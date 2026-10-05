/**
 * Imports the old local VERGO Ops tool (Documents/vergo_admin) into VERGO Ops
 * on the website, so there is one admin system.
 *
 *   npm run import:vergo-admin              dry run: reports what it would do
 *   npm run import:vergo-admin -- --commit  writes it
 *
 * Reads the old database from OLD_DATABASE_URL, or failing that from
 * ~/Documents/vergo_admin/apps/api/.env. Writes to this app's DATABASE_URL,
 * and refuses a non-local target unless ALLOW_REMOTE_DB=1 (scripts/guard-db-target.js).
 *
 * Re-runnable: every imported row is recorded in OpsLegacyImport, so a second
 * run only adds what is new in the old tool. Nothing in either database is
 * deleted or overwritten.
 *
 * How the old records land:
 *   Client          -> Client (approved, no portal login). Matched by email first.
 *   Staff           -> worker: a User (job seeker, no usable password) and its
 *                      WorkerProfile. Matched by email first.
 *   Job             -> OpsBooking, one per day as before, with one requirement
 *                      (role, headcount, charge rate, pay rate).
 *   Assignment      -> the shift (Booking row) on that booking, keeping hours
 *                      and the rate the person was on.
 *   Lead            -> OpsLead.  JobScheduleItem -> running order line.
 * Anyone or any client without an email gets a placeholder address ending in
 * @import.vergoltd.invalid, which can be corrected on their record later.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
// The app's own client, so the repeating-booking fill at the end shares it.
import { prisma } from '../src/prisma';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { fillAllSeries } from '../src/ops/series';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Client: PgClient, types: pgTypes } = require('pg');
// DATE columns as plain YYYY-MM-DD. The default parses them to local midnight,
// which in British Summer Time is the previous day in UTC.
pgTypes.setTypeParser(1082, (v: string) => v);

const COMMIT = process.argv.includes('--commit');
const PLACEHOLDER_DOMAIN = 'import.vergoltd.invalid';
const MIN_PAY_RATE = 12.71;

type Row = Record<string, any>;

function oldDatabaseUrl(): string {
  if (process.env.OLD_DATABASE_URL) return process.env.OLD_DATABASE_URL;
  const envFile = path.join(os.homedir(), 'Documents', 'vergo_admin', 'apps', 'api', '.env');
  if (fs.existsSync(envFile)) {
    const line = fs.readFileSync(envFile, 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
    if (line) return line.slice('DATABASE_URL='.length).replace(/^["']|["']$/g, '');
  }
  throw new Error('Set OLD_DATABASE_URL to the old vergo_admin database.');
}

const isEmail = (v: unknown): v is string => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown) => (v == null ? null : Number(v));
const dateOnly = (v: string) => new Date(`${v}T00:00:00.000Z`);
/** Jobs the old tool held with no client (it allowed that) go under this one. */
const NO_CLIENT = '__no_client__';

/**
 * Corrections to the old tool's client records, by its client name in lower
 * case, taken from VERGO's own invoices (Downloads/VERGO-Invoice-004, -008).
 */
const CLIENT_CORRECTIONS: Record<string, { companyName?: string; billingAddress?: string; clientType?: 'CATERER' | 'OTHER' }> = {
  popcorn: { companyName: 'Popcorn Catering', billingAddress: '3 Kingfisher Court, Bowesfield Park, Stockton-On-Tees TS18 3EX', clientType: 'CATERER' },
};

/**
 * The client of a job the old tool kept without one, read from its title
 * ("KARAS JOBS", "LORRAINE - 1xb 1xw", "debs job"). A match to one of the old
 * tool's own clients uses it; otherwise a client is created by that name
 * (once per name). Anything unreadable goes under the holding client.
 */
const CLIENT_FROM_TITLE: { match: RegExp; oldClientName?: string; name?: string }[] = [
  { match: /^karas\b/i, oldClientName: 'karas' },
  // Invoice 006 (6 Sep 2026) bills this job to Dan Barraclough.
  { match: /^dan\b/i, name: 'Dan Barraclough' },
];
function clientFromTitle(title: string | null): { oldClientName?: string; name?: string } | null {
  const t = (title ?? '').trim();
  const rule = CLIENT_FROM_TITLE.find((r) => r.match.test(t));
  if (rule) return rule;
  const m = t.match(/^([A-Za-z]+)(?:'s)?\s*(?:-|\bjobs?\b)/i);
  return m ? { name: titleCase(m[1].toLowerCase()) } : null;
}
const digits = (v: unknown) => {
  const d = typeof v === 'string' ? v.replace(/\D/g, '') : '';
  return d.startsWith('44') ? '0' + d.slice(2) : d;
};
const titleCase = (v: string) => v.trim().replace(/\s+/g, ' ').replace(/(^|[\s-])(\p{L})/gu, (_m, a, b) => a + b.toUpperCase());

async function unusablePasswordHash() {
  return bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
}

const report: string[] = [];
const counts: Record<string, { created: number; linked: number; skipped: number }> = {};
function tally(entity: string, kind: 'created' | 'linked' | 'skipped', note?: string) {
  (counts[entity] ??= { created: 0, linked: 0, skipped: 0 })[kind] += 1;
  if (note) report.push(`${entity}: ${note}`);
}

async function mapped(entity: string, legacyId: string): Promise<string | null> {
  const row = await prisma.opsLegacyImport.findUnique({ where: { entity_legacyId: { entity, legacyId } } });
  return row?.newId ?? null;
}
async function remember(db: Prisma.TransactionClient | PrismaClient, entity: string, legacyId: string, newId: string) {
  await db.opsLegacyImport.create({ data: { entity, legacyId, newId } });
}

// In a dry run nothing is written, so ids that would be created are faked and
// kept here so later steps (jobs needing a client id) can still be checked.
const dryIds = new Map<string, string>();
const fakeId = (entity: string, legacyId: string) => {
  const id = `dry-${entity}-${legacyId}`;
  dryIds.set(`${entity}:${legacyId}`, id);
  return id;
};
async function resolve(entity: string, legacyId: string) {
  return (await mapped(entity, legacyId)) ?? dryIds.get(`${entity}:${legacyId}`) ?? null;
}

async function nextReference(year: number, used: Set<string>) {
  const prefix = `VB-${year}-`;
  const last = await prisma.opsBooking.findFirst({ where: { reference: { startsWith: prefix } }, orderBy: { reference: 'desc' }, select: { reference: true } });
  let n = last ? Number(last.reference.slice(prefix.length)) + 1 : 1;
  let ref = `${prefix}${String(n).padStart(4, '0')}`;
  while (used.has(ref)) ref = `${prefix}${String(++n).padStart(4, '0')}`;
  used.add(ref);
  return ref;
}

async function main() {
  const old = new PgClient({ connectionString: oldDatabaseUrl() });
  await old.connect();
  const q = async (sql: string) => (await old.query(sql)).rows as Row[];
  const tableExists = async (name: string) => (await q(`SELECT to_regclass('public."${name}"') AS t`))[0].t !== null;

  const [clients, staff, jobs, assignments] = await Promise.all([
    q('SELECT * FROM "Client" ORDER BY "createdAt"'),
    q('SELECT * FROM "Staff" ORDER BY "createdAt"'),
    q('SELECT * FROM "Job" ORDER BY date, "startTime"'),
    q('SELECT * FROM "Assignment" ORDER BY "createdAt"'),
  ]);
  const leads = (await tableExists('Lead')) ? await q('SELECT * FROM "Lead" ORDER BY "createdAt"') : [];
  const scheduleItems = (await tableExists('JobScheduleItem')) ? await q('SELECT * FROM "JobScheduleItem" ORDER BY "createdAt"') : [];
  await old.end();

  console.log(`Old tool: ${clients.length} clients, ${staff.length} staff, ${jobs.length} jobs, ${assignments.length} assignments, ${leads.length} leads, ${scheduleItems.length} running order lines.`);
  console.log(COMMIT ? 'Writing (--commit).\n' : 'Dry run: nothing is written. Add --commit to import.\n');

  const actor = 'import:vergo-admin';
  const staffById = new Map(staff.map((s) => [s.id, s]));
  const assignmentsByJob = new Map<string, Row[]>();
  for (const a of assignments) assignmentsByJob.set(a.jobId, [...(assignmentsByJob.get(a.jobId) ?? []), a]);

  // ── Clients ──────────────────────────────────────────────────────────────
  for (const c of clients) {
    if (await mapped('Client', c.id)) { tally('Client', 'skipped'); continue; }
    const email = isEmail(c.contactEmail) ? c.contactEmail.trim().toLowerCase() : null;
    const existing = email ? await prisma.client.findUnique({ where: { email }, select: { id: true, companyName: true } }) : null;
    if (existing) {
      if (COMMIT) await remember(prisma, 'Client', c.id, existing.id); else fakeId('Client', c.id);
      tally('Client', 'linked', `${c.name} -> existing client ${existing.companyName} (same email)`);
      continue;
    }
    const finalEmail = email ?? `client-${c.id}@${PLACEHOLDER_DOMAIN}`;
    const notes = [clean(c.notes), c.defaultChargeRate != null ? `Usual charge rate £${Number(c.defaultChargeRate).toFixed(2)}/h.` : null, 'Imported from the old VERGO Ops tool.']
      .filter(Boolean).join(' ');
    const fix = CLIENT_CORRECTIONS[c.name.trim().toLowerCase()] ?? {};
    const companyName = fix.companyName ?? titleCase(c.name.trim().toLowerCase());
    const label = `${companyName}${companyName !== c.name.trim() ? ` (was "${c.name.trim()}")` : ''}${email ? '' : ' (placeholder email)'}`;
    if (!COMMIT) { fakeId('Client', c.id); tally('Client', 'created', label); continue; }
    const passwordHash = await unusablePasswordHash();
    await prisma.$transaction(async (tx) => {
      const created = await tx.client.create({
        data: {
          companyName, contactName: clean(c.contactName) ?? companyName, email: finalEmail,
          phone: clean(c.contactPhone), adminNotes: notes, passwordHash, status: c.archived ? 'SUSPENDED' : 'APPROVED',
          billingAddress: fix.billingAddress ?? null, ...(fix.clientType ? { clientType: fix.clientType } : {}),
          approvedAt: new Date(), approvedBy: actor, createdAt: c.createdAt,
        },
        select: { id: true },
      });
      await remember(tx, 'Client', c.id, created.id);
      await tx.auditLog.create({ data: { actor, action: 'CLIENT_CREATED', entityType: 'Client', entityId: created.id, newValue: { importedFrom: 'vergo_admin', legacyId: c.id } } });
    });
    tally('Client', 'created', label);
  }

  // Jobs kept without a client: find it from the title (see CLIENT_FROM_TITLE).
  // Each job's client key is recorded here so the jobs step can resolve it.
  const oldClientIdByName = new Map(clients.map((c) => [c.name.trim().toLowerCase(), c.id as string]));
  const clientKeyOfJob = new Map<string, string>();
  for (const j of jobs) {
    if (j.clientId) { clientKeyOfJob.set(j.id, j.clientId); continue; }
    const found = clientFromTitle(j.title);
    const oldId = found?.oldClientName ? oldClientIdByName.get(found.oldClientName) : undefined;
    clientKeyOfJob.set(j.id, oldId ?? (found?.name ? `title:${found.name.toLowerCase()}` : NO_CLIENT));
    if (!oldId && found?.name) {
      const key = `title:${found.name.toLowerCase()}`;
      if (await resolve('Client', key)) continue;
      if (!COMMIT) { fakeId('Client', key); tally('Client', 'created', `${found.name} (from the job title "${clean(j.title)}", placeholder email)`); continue; }
      await prisma.$transaction(async (tx) => {
        const created = await tx.client.create({
          data: {
            companyName: found.name!, contactName: found.name!, email: `client-${key.replace(/[^a-z0-9]+/g, '-')}@${PLACEHOLDER_DOMAIN}`,
            passwordHash: await unusablePasswordHash(), status: 'APPROVED', approvedAt: new Date(), approvedBy: actor, clientType: 'OTHER',
            adminNotes: `Created by the import from the old VERGO Ops tool, which recorded "${clean(j.title)}" with no client. Add their contact details, and set the type to private consumer if this is a private customer.`,
          },
          select: { id: true },
        });
        await remember(tx, 'Client', key, created.id);
        await tx.auditLog.create({ data: { actor, action: 'CLIENT_CREATED', entityType: 'Client', entityId: created.id, newValue: { importedFrom: 'vergo_admin', fromJobTitle: clean(j.title) } } });
      });
      tally('Client', 'created', `${found.name} (from the job title "${clean(j.title)}", placeholder email)`);
    }
  }

  // The holding client for jobs whose client cannot be read from the title.
  // Reassign each booking to the right client from its page once imported.
  if ([...clientKeyOfJob.values()].includes(NO_CLIENT) && !(await mapped('Client', NO_CLIENT))) {
    const email = `no-client@${PLACEHOLDER_DOMAIN}`;
    const existing = await prisma.client.findUnique({ where: { email }, select: { id: true } });
    if (!COMMIT) { fakeId('Client', NO_CLIENT); tally('Client', existing ? 'linked' : 'created', 'No client recorded (imported): holding client for jobs the old tool kept without one'); }
    else {
      const id = existing?.id ?? (await prisma.client.create({
        data: {
          companyName: 'No client recorded (imported)', contactName: 'Not recorded', email, passwordHash: await unusablePasswordHash(),
          status: 'APPROVED', approvedAt: new Date(), approvedBy: actor, clientType: 'OTHER',
          adminNotes: 'Holds bookings that the old VERGO Ops tool recorded without a client. Move each booking to its real client.',
        },
        select: { id: true },
      })).id;
      await remember(prisma, 'Client', NO_CLIENT, id);
      tally('Client', existing ? 'linked' : 'created', 'No client recorded (imported): holding client for jobs the old tool kept without one');
    }
  }

  // ── Staff -> workers ─────────────────────────────────────────────────────
  // Someone with no email in the old tool may already be on the site (an
  // applicant, or added in Ops): match them by phone number before creating.
  const workerPhones = new Map<string, { id: string; userType: string }>();
  for (const u of await prisma.user.findMany({ where: { userType: 'JOB_SEEKER', phone: { not: null } }, select: { id: true, userType: true, phone: true } })) {
    const key = digits(u.phone);
    if (key.length >= 10) workerPhones.set(key, workerPhones.has(key) ? { id: '', userType: 'AMBIGUOUS' } : u);
  }
  for (const s of staff) {
    if (await mapped('Staff', s.id)) { tally('Staff', 'skipped'); continue; }
    const name = `${titleCase(s.firstName)} ${titleCase(s.lastName)}`;
    const email = isEmail(s.email) ? s.email.trim().toLowerCase() : null;
    const byPhone = !email && digits(s.phone).length >= 10 ? workerPhones.get(digits(s.phone)) : undefined;
    const existing = email
      ? await prisma.user.findUnique({ where: { email }, select: { id: true, userType: true } })
      : byPhone && byPhone.userType !== 'AMBIGUOUS' ? byPhone : null;
    if (existing && existing.userType !== 'JOB_SEEKER') {
      tally('Staff', 'skipped', `${name}: ${email} belongs to a non-worker account, not imported`);
      continue;
    }
    const notes = [clean(s.notes), s.hourlyRate != null ? `Pay rate in the old tool: £${Number(s.hourlyRate).toFixed(2)}/h.` : null, 'Imported from the old VERGO Ops tool.']
      .filter(Boolean).join(' ');
    if (!COMMIT) { fakeId('Staff', s.id); tally('Staff', existing ? 'linked' : 'created', `${name}${existing ? ' -> existing worker account' : email ? '' : ' (placeholder email)'}`); continue; }
    const passwordHash = existing ? null : await unusablePasswordHash();
    await prisma.$transaction(async (tx) => {
      const userId = existing?.id ?? (await tx.user.create({
        data: {
          email: email ?? `staff-${s.id}@${PLACEHOLDER_DOMAIN}`, firstName: titleCase(s.firstName), lastName: titleCase(s.lastName),
          phone: clean(s.phone), passwordHash: passwordHash!, userType: 'JOB_SEEKER', createdAt: s.createdAt,
        },
        select: { id: true },
      })).id;
      const profile = await tx.workerProfile.findUnique({ where: { userId } });
      if (!profile) {
        await tx.workerProfile.create({ data: { userId, activeStatus: s.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE', internalNotes: notes.slice(0, 2000) } });
      }
      await remember(tx, 'Staff', s.id, userId);
      await tx.auditLog.create({ data: { actor, action: 'WORKER_ADDED', entityType: 'Worker', entityId: userId, newValue: { importedFrom: 'vergo_admin', legacyId: s.id, linkedExisting: !!existing } } });
    });
    tally('Staff', existing ? 'linked' : 'created', `${name}${existing ? ' -> existing worker account' : email ? '' : ' (placeholder email)'}`);
  }

  // ── Jobs -> Ops bookings, assignments -> shifts ──────────────────────────
  const usedRefs = new Set<string>();
  for (const j of jobs) {
    if (await mapped('Job', j.id)) { tally('Job', 'skipped'); continue; }
    const clientId = await resolve('Client', clientKeyOfJob.get(j.id) ?? NO_CLIENT);
    if (!clientId) { tally('Job', 'skipped', `${j.reference}: its client was not imported`); continue; }
    const crew = assignmentsByJob.get(j.id) ?? [];
    const payRates = crew.map((a) => num(a.rateOverride) ?? num(staffById.get(a.staffId)?.hourlyRate)).filter((v): v is number => v != null);
    const commonRate = payRates.length
      ? [...payRates].sort((a, b) => payRates.filter((x) => x === b).length - payRates.filter((x) => x === a).length)[0]
      : MIN_PAY_RATE;
    const date: string = j.date;
    const paid = j.invoiceStatus === 'PAID';
    const invoiced = paid || j.invoiceStatus === 'INVOICED';
    const status = j.status === 'CANCELLED' ? 'CANCELLED' : paid ? 'PAID' : invoiced ? 'INVOICED' : j.status === 'COMPLETED' ? 'COMPLETED' : j.status === 'DRAFT' ? 'DRAFT' : 'CONFIRMED';
    // The old tool often held the client in the title ("Dan JOB", "LORRAINE -
    // 1xb 1xw") and left the role empty: not a role, so "Event staff".
    const fromTitle = !clean(j.roleNeeded);
    const roleText = clean(j.roleNeeded) ?? clean(j.title);
    const role = (roleText && !/\bjobs?\b/i.test(roleText) && !(fromTitle && !j.clientId && clientFromTitle(roleText)) ? roleText : 'Event staff').slice(0, 80);
    const quantity = Math.max(j.staffNeeded ?? 0, crew.length, 1);
    const chargeRate = Number(j.chargeRate);
    const reference = await nextReference(Number(date.slice(0, 4)), usedRefs);

    if (!COMMIT) {
      fakeId('Job', j.id);
      tally('Job', 'created', `${j.reference} ${date} ${j.title} -> ${reference} (${status}), ${role} x${quantity}, ${crew.length} assigned`);
      for (const a of crew) tally('Assignment', (await resolve('Staff', a.staffId)) ? 'created' : 'skipped');
      continue;
    }

    const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { subscriptionTier: true } });
    await prisma.$transaction(async (tx) => {
      const booking = await tx.opsBooking.create({
        data: {
          reference, clientId, eventType: clean(j.title)?.slice(0, 120) ?? null, venue: clean(j.venueName)?.slice(0, 200) ?? null,
          eventDate: dateOnly(date), startTime: j.startTime, expectedFinish: j.endTime, status: status as Prisma.OpsBookingCreateInput['status'],
          notes: [clean(j.notes), `Imported from the old VERGO Ops tool (${j.reference}).`].filter(Boolean).join('\n').slice(0, 4000),
          invoiceRef: invoiced ? `Imported (${j.reference})` : null,
          invoicedAt: invoiced ? j.updatedAt : null, paidAt: paid ? j.updatedAt : null, createdAt: j.createdAt,
        },
      });
      const requirement = await tx.opsRequirement.create({
        data: {
          opsBookingId: booking.id, role, quantity, clientChargeRate: new Prisma.Decimal(chargeRate),
          workerPayRate: new Prisma.Decimal(commonRate), breakMins: j.breakMinutes ?? 0,
        },
      });
      for (const a of crew) {
        if (await tx.opsLegacyImport.findUnique({ where: { entity_legacyId: { entity: 'Assignment', legacyId: a.id } } })) continue;
        const staffId = await tx.opsLegacyImport.findUnique({ where: { entity_legacyId: { entity: 'Staff', legacyId: a.staffId } } });
        if (!staffId) { tally('Assignment', 'skipped', `${j.reference}: a staff member was not imported`); continue; }
        const hours = Number(a.hours);
        const payRate = num(a.rateOverride) ?? num(staffById.get(a.staffId)?.hourlyRate) ?? commonRate;
        const shift = await tx.booking.create({
          data: {
            clientId, staffId: staffId.newId, opsBookingId: booking.id, requirementId: requirement.id, role,
            eventName: [reference, clean(j.title)].filter(Boolean).join(' '), eventDate: booking.eventDate,
            location: clean(j.venueName) ?? 'To be confirmed', venue: clean(j.venueName), shiftStart: j.startTime, shiftEnd: j.endTime,
            breakMins: j.breakMinutes ?? 0, hoursEstimated: new Prisma.Decimal(hours),
            clientTierAtBooking: client.subscriptionTier, staffTierAtBooking: 'STANDARD',
            hourlyRateCharged: new Prisma.Decimal(chargeRate), staffPayRate: new Prisma.Decimal(payRate),
            totalEstimated: new Prisma.Decimal((chargeRate * hours).toFixed(2)),
            status: j.status === 'CANCELLED' ? 'CANCELLED' : j.status === 'COMPLETED' ? 'COMPLETED' : 'CONFIRMED',
            confirmedAt: a.createdAt, confirmedBy: actor, adminNotes: clean(a.notes), createdAt: a.createdAt,
          },
        });
        await remember(tx, 'Assignment', a.id, shift.id);
        tally('Assignment', 'created');
      }
      await remember(tx, 'Job', j.id, booking.id);
      await tx.auditLog.create({ data: { actor, action: 'BOOKING_CREATED', entityType: 'OpsBooking', entityId: booking.id, newValue: { importedFrom: 'vergo_admin', legacyId: j.id, legacyReference: j.reference } } });
    }, { timeout: 30000 });
    tally('Job', 'created', `${j.reference} ${date} -> ${reference}`);
  }

  // ── Ongoing jobs -> repeating bookings ───────────────────────────────────
  // The old tool stored an ongoing job as one row per day sharing a seriesId,
  // with repeatDays (1 = Monday .. 7 = Sunday, as here). Its imported days are
  // linked to one repeating booking whose pattern is the latest day, and which
  // carries on from the old tool's last day, so Ops keeps adding days.
  const ongoing = new Map<string, Row[]>();
  for (const j of jobs) if (j.seriesId && j.ongoing) ongoing.set(j.seriesId, [...(ongoing.get(j.seriesId) ?? []), j]);
  for (const [seriesKey, days] of ongoing) {
    if (await mapped('JobSeries', seriesKey)) { tally('Repeating booking', 'skipped'); continue; }
    days.sort((a, b) => (a.date < b.date ? -1 : 1));
    const first = days[0];
    const last = days[days.length - 1];
    const weekdays = [...new Set<number>((last.repeatDays ?? []).map(Number))].filter((d) => d >= 1 && d <= 7).sort();
    const endsOn: string | null = days.map((d) => d.endDate).filter(Boolean).sort().pop() ?? null;
    const describe = `${clean(last.title) ?? 'Ongoing job'}: ${days.length} days ${first.date} to ${last.date}, repeating on days ${weekdays.join(',')} ${endsOn ? 'until ' + endsOn : 'until stopped'}`;
    if (!weekdays.length) { tally('Repeating booking', 'skipped', `${describe}: no repeat days recorded`); continue; }
    if (!COMMIT) { tally('Repeating booking', 'created', describe); continue; }
    const patternId = await mapped('Job', last.id);
    const clientId = patternId ? (await prisma.opsBooking.findUnique({ where: { id: patternId }, select: { clientId: true } }))?.clientId : null;
    if (!patternId || !clientId) { tally('Repeating booking', 'skipped', `${describe}: its days were not imported`); continue; }
    await prisma.$transaction(async (tx) => {
      const series = await tx.opsBookingSeries.create({
        data: {
          clientId, patternBookingId: patternId, weekdays, startsOn: dateOnly(first.date), endsOn: endsOn ? dateOnly(endsOn) : null,
          generatedThrough: dateOnly(last.date), createdBy: actor,
        },
        select: { id: true },
      });
      for (const d of days) {
        const bookingId = await tx.opsLegacyImport.findUnique({ where: { entity_legacyId: { entity: 'Job', legacyId: d.id } } });
        if (bookingId) await tx.opsBooking.update({ where: { id: bookingId.newId }, data: { seriesId: series.id } });
      }
      await remember(tx, 'JobSeries', seriesKey, series.id);
      await tx.auditLog.create({ data: { actor, action: 'BOOKING_SERIES_STARTED', entityType: 'OpsBooking', entityId: patternId, newValue: { importedFrom: 'vergo_admin', seriesId: series.id, weekdays, days: days.length } } });
    });
    tally('Repeating booking', 'created', describe);
  }

  // ── Leads ────────────────────────────────────────────────────────────────
  for (const l of leads) {
    if (await mapped('Lead', l.id)) { tally('Lead', 'skipped'); continue; }
    const clientId = l.clientId ? await resolve('Client', l.clientId) : null;
    if (!COMMIT) { fakeId('Lead', l.id); tally('Lead', 'created', l.company); continue; }
    const lead = await prisma.opsLead.create({
      data: {
        company: l.company.slice(0, 200), contactName: clean(l.contactName), contactEmail: isEmail(l.contactEmail) ? l.contactEmail.toLowerCase() : null,
        contactPhone: clean(l.contactPhone), contactedOn: dateOnly(l.contactedOn), channel: l.channel, stage: l.stage, notes: clean(l.notes),
        clientId: clientId && !clientId.startsWith('dry-') && !(await prisma.opsLead.findUnique({ where: { clientId } })) ? clientId : null,
        createdAt: l.createdAt,
      },
    });
    await remember(prisma, 'Lead', l.id, lead.id);
    tally('Lead', 'created', l.company);
  }

  // ── Running order ────────────────────────────────────────────────────────
  for (const s of scheduleItems) {
    if (await mapped('JobScheduleItem', s.id)) { tally('JobScheduleItem', 'skipped'); continue; }
    const bookingId = await resolve('Job', s.jobId);
    if (!bookingId) { tally('JobScheduleItem', 'skipped', `"${s.title}": its job was not imported`); continue; }
    if (!COMMIT) { tally('JobScheduleItem', 'created'); continue; }
    const item = await prisma.opsScheduleItem.create({
      data: { opsBookingId: bookingId, time: clean(s.time), title: s.title.slice(0, 200), assignee: clean(s.assignee), notes: clean(s.notes), createdAt: s.createdAt },
    });
    await remember(prisma, 'JobScheduleItem', s.id, item.id);
    tally('JobScheduleItem', 'created');
  }

  console.log(report.join('\n'));
  console.log('\nSummary (created / linked to an existing record / skipped):');
  for (const [entity, c] of Object.entries(counts)) console.log(`  ${entity.padEnd(16)} ${c.created} / ${c.linked} / ${c.skipped}`);
  if (COMMIT) {
    const added = await fillAllSeries('import:vergo-admin');
    if (added) console.log(`\nRepeating bookings: added ${added} upcoming day(s) after the old tool's last day.`);
  }
  if (!COMMIT) console.log('\nDry run only. Run again with --commit to import.');
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
