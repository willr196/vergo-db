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
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Client: PgClient, types: pgTypes } = require('pg');
// DATE columns as plain YYYY-MM-DD. The default parses them to local midnight,
// which in British Summer Time is the previous day in UTC.
pgTypes.setTypeParser(1082, (v: string) => v);

const COMMIT = process.argv.includes('--commit');
const PLACEHOLDER_DOMAIN = 'import.vergoltd.invalid';
const MIN_PAY_RATE = 12.71;
const prisma = new PrismaClient();

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
const titleCase = (v: string) => v.trim().replace(/\s+/g, ' ').replace(/(^|[\s'-])(\p{L})/gu, (_m, a, b) => a + b.toUpperCase());

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
    if (!COMMIT) { fakeId('Client', c.id); tally('Client', 'created', `${c.name}${email ? '' : ' (placeholder email)'}`); continue; }
    const passwordHash = await unusablePasswordHash();
    await prisma.$transaction(async (tx) => {
      const created = await tx.client.create({
        data: {
          companyName: c.name.trim(), contactName: clean(c.contactName) ?? c.name.trim(), email: finalEmail,
          phone: clean(c.contactPhone), adminNotes: notes, passwordHash, status: c.archived ? 'SUSPENDED' : 'APPROVED',
          approvedAt: new Date(), approvedBy: actor, createdAt: c.createdAt,
        },
        select: { id: true },
      });
      await remember(tx, 'Client', c.id, created.id);
      await tx.auditLog.create({ data: { actor, action: 'CLIENT_CREATED', entityType: 'Client', entityId: created.id, newValue: { importedFrom: 'vergo_admin', legacyId: c.id } } });
    });
    tally('Client', 'created', `${c.name}${email ? '' : ' (placeholder email)'}`);
  }

  // The holding client for jobs recorded without one. Reassign each booking
  // to the right client from its page once imported.
  if (jobs.some((j) => !j.clientId) && !(await mapped('Client', NO_CLIENT))) {
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
  for (const s of staff) {
    if (await mapped('Staff', s.id)) { tally('Staff', 'skipped'); continue; }
    const name = `${titleCase(s.firstName)} ${titleCase(s.lastName)}`;
    const email = isEmail(s.email) ? s.email.trim().toLowerCase() : null;
    const existing = email ? await prisma.user.findUnique({ where: { email }, select: { id: true, userType: true } }) : null;
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
    const clientId = await resolve('Client', j.clientId ?? NO_CLIENT);
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
    const role = (clean(j.roleNeeded) ?? clean(j.title) ?? 'Event staff').slice(0, 80);
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
  if (!COMMIT) console.log('\nDry run only. Run again with --commit to import.');
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
