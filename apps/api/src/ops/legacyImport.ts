/**
 * Imports the desktop VERGO Ops tool (Documents/vergo_admin) into VERGO Ops on
 * the website. The desktop tool stays in use for offline bookings; this brings
 * what was added there across.
 *
 * Two ways in, one importer:
 *   - Ops > Import, upload one of the desktop tool's backups
 *     (vergo_admin/backups/vergo-ops-*.sql, written daily by backup.ps1);
 *   - npm run import:vergo-admin, reading the desktop database directly.
 *
 * Re-runnable: every imported row is recorded in OpsLegacyImport, so a second
 * run only adds what is new in the desktop tool: new clients, staff, jobs,
 * people put on jobs already imported, leads and running order lines. Nothing
 * in either database is deleted or overwritten; a change made in the desktop
 * tool to a job already imported is not copied (change it here too).
 *
 * How the desktop records land:
 *   Client          -> Client (approved, no portal login). Matched by email first.
 *   Staff           -> worker: a User (job seeker, no usable password) and its
 *                      WorkerProfile. Matched by email, then by phone.
 *   Job             -> OpsBooking, one per day as before, with one requirement
 *                      (role, headcount, charge rate, pay rate).
 *   Assignment      -> the shift (Booking row) on that booking, keeping hours
 *                      and the rate the person was on.
 *   Lead            -> OpsLead.  JobScheduleItem -> running order line.
 *   Usual rates     -> Client.defaultChargeRate, WorkerProfile.defaultPayRate.
 * Anyone or any client without an email gets a placeholder address ending in
 * @import.vergoltd.invalid, which can be corrected on their record later.
 */

import { Prisma, PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { prisma } from '../prisma';
import { fillAllSeries } from './series';
import { parsePgDump, type LegacyData, type Row } from './legacyDump';

export { parsePgDump, type LegacyData };

export type LegacyImportResult = {
  committed: boolean;
  source: Record<keyof LegacyData, number>;
  counts: Record<string, { created: number; linked: number; skipped: number }>;
  report: string[];
  /** Usual rates filled in on clients and staff imported before those fields existed. */
  ratesFilled: number;
  /** Upcoming days added to repeating bookings after the import. */
  seriesDaysAdded: number;
};

const PLACEHOLDER_DOMAIN = 'import.vergoltd.invalid';
const MIN_PAY_RATE = 12.71;
const NO_CLIENT = '__no_client__';

// ── Helpers ───────────────────────────────────────────────────────────────

const isEmail = (v: unknown): v is string => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown) => (v == null ? null : Number(v));
const dateOnly = (v: string) => new Date(`${v}T00:00:00.000Z`);
const digits = (v: unknown) => {
  const d = typeof v === 'string' ? v.replace(/\D/g, '') : '';
  return d.startsWith('44') ? '0' + d.slice(2) : d;
};
const titleCase = (v: string) => v.trim().replace(/\s+/g, ' ').replace(/(^|[\s-])(\p{L})/gu, (_m, a, b) => a + b.toUpperCase());

/**
 * Corrections to the desktop tool's client records, by its client name in
 * lower case, taken from VERGO's own invoices (VERGO-Invoice-004, -008).
 */
const CLIENT_CORRECTIONS: Record<string, { companyName?: string; billingAddress?: string; clientType?: 'CATERER' | 'OTHER' }> = {
  popcorn: { companyName: 'Popcorn Catering', billingAddress: '3 Kingfisher Court, Bowesfield Park, Stockton-On-Tees TS18 3EX', clientType: 'CATERER' },
};

/**
 * The client of a job the desktop tool kept without one, read from its title
 * ("KARAS JOBS", "LORRAINE - 1xb 1xw", "debs job"). A match to one of the
 * desktop tool's own clients uses it; otherwise a client is created by that
 * name (once per name). Anything unreadable goes under the holding client.
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

async function unusablePasswordHash() {
  return bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
}

let running = false;

// ── Import ────────────────────────────────────────────────────────────────

/** Import, or with commit false only report what would happen. One import runs at a time. */
export async function importLegacy(data: LegacyData, opts: { commit: boolean; actor: string }): Promise<LegacyImportResult> {
  if (running) throw Object.assign(new Error('An import is already running. Try again in a minute.'), { statusCode: 409 });
  running = true;
  try {
    return await run(data, opts);
  } finally {
    running = false;
  }
}

async function run({ clients, staff, jobs, assignments, leads, scheduleItems }: LegacyData, { commit: COMMIT, actor }: { commit: boolean; actor: string }): Promise<LegacyImportResult> {
  const report: string[] = [];
  const counts: LegacyImportResult['counts'] = {};
  let ratesFilled = 0;
  const tally = (entity: string, kind: 'created' | 'linked' | 'skipped', note?: string) => {
    (counts[entity] ??= { created: 0, linked: 0, skipped: 0 })[kind] += 1;
    if (note) report.push(`${entity}: ${note}`);
  };
  const mapped = async (entity: string, legacyId: string) =>
    (await prisma.opsLegacyImport.findUnique({ where: { entity_legacyId: { entity, legacyId } } }))?.newId ?? null;
  const remember = (db: Prisma.TransactionClient | PrismaClient, entity: string, legacyId: string, newId: string) =>
    db.opsLegacyImport.create({ data: { entity, legacyId, newId } });
  // In a dry run nothing is written, so ids that would be created are faked and
  // kept here so later steps (jobs needing a client id) can still be checked.
  const dryIds = new Map<string, string>();
  const fakeId = (entity: string, legacyId: string) => {
    const id = `dry-${entity}-${legacyId}`;
    dryIds.set(`${entity}:${legacyId}`, id);
    return id;
  };
  const resolve = async (entity: string, legacyId: string) => (await mapped(entity, legacyId)) ?? dryIds.get(`${entity}:${legacyId}`) ?? null;
  const usedRefs = new Set<string>();
  const nextReference = async (year: number) => {
    const prefix = `VB-${year}-`;
    const last = await prisma.opsBooking.findFirst({ where: { reference: { startsWith: prefix } }, orderBy: { reference: 'desc' }, select: { reference: true } });
    let n = last ? Number(last.reference.slice(prefix.length)) + 1 : 1;
    let ref = `${prefix}${String(n).padStart(4, '0')}`;
    while (usedRefs.has(ref)) ref = `${prefix}${String(++n).padStart(4, '0')}`;
    usedRefs.add(ref);
    return ref;
  };

  const staffById = new Map(staff.map((s) => [s.id, s]));
  const assignmentsByJob = new Map<string, Row[]>();
  for (const a of assignments) assignmentsByJob.set(a.jobId, [...(assignmentsByJob.get(a.jobId) ?? []), a]);

  // ── Clients ──────────────────────────────────────────────────────────────
  for (const c of clients) {
    const rate = num(c.defaultChargeRate);
    const already = await mapped('Client', c.id);
    if (already) {
      // Imported before the usual rate had a field of its own: fill it in.
      if (rate != null) {
        const where = { id: already, defaultChargeRate: null };
        const n = COMMIT ? (await prisma.client.updateMany({ where, data: { defaultChargeRate: new Prisma.Decimal(rate) } })).count : await prisma.client.count({ where });
        if (n) { ratesFilled++; report.push(`Client: ${c.name}: usual charge rate £${rate.toFixed(2)}/h filled in`); }
      }
      tally('Client', 'skipped');
      continue;
    }
    const email = isEmail(c.contactEmail) ? c.contactEmail.trim().toLowerCase() : null;
    const existing = email ? await prisma.client.findUnique({ where: { email }, select: { id: true, companyName: true } }) : null;
    if (existing) {
      if (COMMIT) await remember(prisma, 'Client', c.id, existing.id); else fakeId('Client', c.id);
      tally('Client', 'linked', `${c.name} -> existing client ${existing.companyName} (same email)`);
      continue;
    }
    const finalEmail = email ?? `client-${c.id}@${PLACEHOLDER_DOMAIN}`;
    const notes = [clean(c.notes), 'Imported from the desktop VERGO Ops tool.'].filter(Boolean).join(' ');
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
          defaultChargeRate: rate != null ? new Prisma.Decimal(rate) : null,
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
            adminNotes: `Created by the import from the desktop VERGO Ops tool, which recorded "${clean(j.title)}" with no client. Add their contact details, and set the type to private consumer if this is a private customer.`,
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
    const note = 'No client recorded (imported): holding client for jobs the desktop tool kept without one';
    if (!COMMIT) { fakeId('Client', NO_CLIENT); tally('Client', existing ? 'linked' : 'created', note); }
    else {
      const id = existing?.id ?? (await prisma.client.create({
        data: {
          companyName: 'No client recorded (imported)', contactName: 'Not recorded', email, passwordHash: await unusablePasswordHash(),
          status: 'APPROVED', approvedAt: new Date(), approvedBy: actor, clientType: 'OTHER',
          adminNotes: 'Holds bookings that the desktop VERGO Ops tool recorded without a client. Move each booking to its real client.',
        },
        select: { id: true },
      })).id;
      await remember(prisma, 'Client', NO_CLIENT, id);
      tally('Client', existing ? 'linked' : 'created', note);
    }
  }

  // ── Staff -> workers ─────────────────────────────────────────────────────
  // Someone with no email in the desktop tool may already be on the site (an
  // applicant, or added in Ops): match them by phone number before creating.
  const workerPhones = new Map<string, { id: string; userType: string }>();
  for (const u of await prisma.user.findMany({ where: { userType: 'JOB_SEEKER', phone: { not: null } }, select: { id: true, userType: true, phone: true } })) {
    const key = digits(u.phone);
    if (key.length >= 10) workerPhones.set(key, workerPhones.has(key) ? { id: '', userType: 'AMBIGUOUS' } : u);
  }
  for (const s of staff) {
    const rate = num(s.hourlyRate);
    const name = `${titleCase(s.firstName)} ${titleCase(s.lastName)}`;
    const already = await mapped('Staff', s.id);
    if (already) {
      if (rate != null) {
        const where = { userId: already, defaultPayRate: null };
        const n = COMMIT ? (await prisma.workerProfile.updateMany({ where, data: { defaultPayRate: new Prisma.Decimal(rate) } })).count : await prisma.workerProfile.count({ where });
        if (n) { ratesFilled++; report.push(`Staff: ${name}: usual pay rate £${rate.toFixed(2)}/h filled in`); }
      }
      tally('Staff', 'skipped');
      continue;
    }
    const email = isEmail(s.email) ? s.email.trim().toLowerCase() : null;
    const byPhone = !email && digits(s.phone).length >= 10 ? workerPhones.get(digits(s.phone)) : undefined;
    const existing = email
      ? await prisma.user.findUnique({ where: { email }, select: { id: true, userType: true } })
      : byPhone && byPhone.userType !== 'AMBIGUOUS' ? byPhone : null;
    if (existing && existing.userType !== 'JOB_SEEKER') {
      tally('Staff', 'skipped', `${name}: ${email} belongs to a non-worker account, not imported`);
      continue;
    }
    const notes = [clean(s.notes), 'Imported from the desktop VERGO Ops tool.'].filter(Boolean).join(' ');
    const label = `${name}${existing ? ' -> existing worker account' : email ? '' : ' (placeholder email)'}`;
    if (!COMMIT) { fakeId('Staff', s.id); tally('Staff', existing ? 'linked' : 'created', label); continue; }
    const passwordHash = existing ? null : await unusablePasswordHash();
    await prisma.$transaction(async (tx) => {
      const userId = existing?.id ?? (await tx.user.create({
        data: {
          email: email ?? `staff-${s.id}@${PLACEHOLDER_DOMAIN}`, firstName: titleCase(s.firstName), lastName: titleCase(s.lastName),
          phone: clean(s.phone), passwordHash: passwordHash!, userType: 'JOB_SEEKER', createdAt: s.createdAt,
        },
        select: { id: true },
      })).id;
      const defaultPayRate = rate != null ? new Prisma.Decimal(rate) : null;
      const profile = await tx.workerProfile.findUnique({ where: { userId } });
      if (!profile) {
        await tx.workerProfile.create({ data: { userId, activeStatus: s.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE', internalNotes: notes.slice(0, 2000), defaultPayRate } });
      } else if (profile.defaultPayRate == null && defaultPayRate) {
        await tx.workerProfile.update({ where: { userId }, data: { defaultPayRate } });
      }
      await remember(tx, 'Staff', s.id, userId);
      await tx.auditLog.create({ data: { actor, action: 'WORKER_ADDED', entityType: 'Worker', entityId: userId, newValue: { importedFrom: 'vergo_admin', legacyId: s.id, linkedExisting: !!existing } } });
    });
    tally('Staff', existing ? 'linked' : 'created', label);
  }

  // ── Jobs -> Ops bookings, assignments -> shifts ──────────────────────────
  /** A desktop assignment as a shift on an imported booking. */
  const createShift = async (
    tx: Prisma.TransactionClient, a: Row, j: Row,
    target: { bookingId: string; reference: string; clientId: string; eventDate: Date; requirementId: string; role: string; chargeRate: number; fallbackPayRate: number; subscriptionTier: Prisma.BookingCreateInput['clientTierAtBooking'] },
  ) => {
    const staffId = await tx.opsLegacyImport.findUnique({ where: { entity_legacyId: { entity: 'Staff', legacyId: a.staffId } } });
    if (!staffId) { tally('Assignment', 'skipped', `${j.reference}: a staff member was not imported`); return; }
    const hours = Number(a.hours);
    const payRate = num(a.rateOverride) ?? num(staffById.get(a.staffId)?.hourlyRate) ?? target.fallbackPayRate;
    const shift = await tx.booking.create({
      data: {
        clientId: target.clientId, staffId: staffId.newId, opsBookingId: target.bookingId, requirementId: target.requirementId, role: target.role,
        eventName: [target.reference, clean(j.title)].filter(Boolean).join(' '), eventDate: target.eventDate,
        location: clean(j.venueName) ?? 'To be confirmed', venue: clean(j.venueName), shiftStart: j.startTime, shiftEnd: j.endTime,
        breakMins: j.breakMinutes ?? 0, hoursEstimated: new Prisma.Decimal(hours),
        clientTierAtBooking: target.subscriptionTier, staffTierAtBooking: 'STANDARD',
        hourlyRateCharged: new Prisma.Decimal(target.chargeRate), staffPayRate: new Prisma.Decimal(payRate),
        totalEstimated: new Prisma.Decimal((target.chargeRate * hours).toFixed(2)),
        status: j.status === 'CANCELLED' ? 'CANCELLED' : j.status === 'COMPLETED' ? 'COMPLETED' : 'CONFIRMED',
        confirmedAt: a.createdAt, confirmedBy: actor, adminNotes: clean(a.notes), createdAt: a.createdAt,
      },
    });
    await remember(tx, 'Assignment', a.id, shift.id);
    tally('Assignment', 'created');
  };

  for (const j of jobs) {
    const crew = assignmentsByJob.get(j.id) ?? [];
    const bookingId = await mapped('Job', j.id);
    if (bookingId) {
      tally('Job', 'skipped');
      // People put on this job in the desktop tool after it was imported.
      const fresh: Row[] = [];
      for (const a of crew) if (!(await mapped('Assignment', a.id))) fresh.push(a);
      if (!fresh.length) continue;
      const booking = await prisma.opsBooking.findUnique({
        where: { id: bookingId },
        select: { id: true, reference: true, clientId: true, eventDate: true, status: true, client: { select: { subscriptionTier: true } }, requirements: { orderBy: { createdAt: 'asc' }, take: 1 } },
      });
      const requirement = booking?.requirements[0];
      if (!booking || !requirement || ['CANCELLED', 'INVOICED', 'PAID'].includes(booking.status)) {
        for (const a of fresh) tally('Assignment', 'skipped', `${j.reference}: added in the desktop tool after import, but ${booking?.reference ?? 'its booking'} ${requirement ? 'is ' + booking!.status.toLowerCase() : 'has no requirement'}; add them here`);
        continue;
      }
      if (!COMMIT) { for (const a of fresh) tally('Assignment', (await resolve('Staff', a.staffId)) ? 'created' : 'skipped', `${booking.reference}: ${staffById.get(a.staffId)?.firstName ?? 'someone'} added in the desktop tool`); continue; }
      await prisma.$transaction(async (tx) => {
        for (const a of fresh) {
          await createShift(tx, a, j, {
            bookingId: booking.id, reference: booking.reference, clientId: booking.clientId, eventDate: booking.eventDate, requirementId: requirement.id,
            role: requirement.role, chargeRate: Number(requirement.clientChargeRate), fallbackPayRate: Number(requirement.workerPayRate), subscriptionTier: booking.client.subscriptionTier,
          });
        }
        // The desktop tool took on more people than the headcount it was imported with.
        const onIt = await tx.booking.count({ where: { requirementId: requirement.id, status: { in: ['PENDING', 'CONFIRMED', 'COMPLETED'] } } });
        if (onIt > requirement.quantity) await tx.opsRequirement.update({ where: { id: requirement.id }, data: { quantity: onIt } });
      }, { timeout: 30000 });
      report.push(`Assignment: ${booking.reference}: ${fresh.map((a) => staffById.get(a.staffId)?.firstName ?? 'someone').join(', ')} added in the desktop tool`);
      continue;
    }

    const clientId = await resolve('Client', clientKeyOfJob.get(j.id) ?? NO_CLIENT);
    if (!clientId) { tally('Job', 'skipped', `${j.reference}: its client was not imported`); continue; }
    const payRates = crew.map((a) => num(a.rateOverride) ?? num(staffById.get(a.staffId)?.hourlyRate)).filter((v): v is number => v != null);
    const commonRate = payRates.length
      ? [...payRates].sort((a, b) => payRates.filter((x) => x === b).length - payRates.filter((x) => x === a).length)[0]
      : MIN_PAY_RATE;
    const date: string = j.date;
    const paid = j.invoiceStatus === 'PAID';
    const invoiced = paid || j.invoiceStatus === 'INVOICED';
    const status = j.status === 'CANCELLED' ? 'CANCELLED' : paid ? 'PAID' : invoiced ? 'INVOICED' : j.status === 'COMPLETED' ? 'COMPLETED' : j.status === 'DRAFT' ? 'DRAFT' : 'CONFIRMED';
    // The desktop tool often held the client in the title ("Dan JOB", "LORRAINE -
    // 1xb 1xw") and left the role empty: not a role, so "Event staff".
    const fromTitle = !clean(j.roleNeeded);
    const roleText = clean(j.roleNeeded) ?? clean(j.title);
    const role = (roleText && !/\bjobs?\b/i.test(roleText) && !(fromTitle && !j.clientId && clientFromTitle(roleText)) ? roleText : 'Event staff').slice(0, 80);
    const quantity = Math.max(j.staffNeeded ?? 0, crew.length, 1);
    const chargeRate = Number(j.chargeRate);
    const reference = await nextReference(Number(date.slice(0, 4)));

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
          notes: [clean(j.notes), `Imported from the desktop VERGO Ops tool (${j.reference}).`].filter(Boolean).join('\n').slice(0, 4000),
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
        await createShift(tx, a, j, {
          bookingId: booking.id, reference, clientId, eventDate: booking.eventDate, requirementId: requirement.id,
          role, chargeRate, fallbackPayRate: commonRate, subscriptionTier: client.subscriptionTier,
        });
      }
      await remember(tx, 'Job', j.id, booking.id);
      await tx.auditLog.create({ data: { actor, action: 'BOOKING_CREATED', entityType: 'OpsBooking', entityId: booking.id, newValue: { importedFrom: 'vergo_admin', legacyId: j.id, legacyReference: j.reference } } });
    }, { timeout: 30000 });
    tally('Job', 'created', `${j.reference} ${date} -> ${reference}`);
  }

  // ── Ongoing jobs -> repeating bookings ───────────────────────────────────
  // The desktop tool stored an ongoing job as one row per day sharing a
  // seriesId, with repeatDays (1 = Monday .. 7 = Sunday, as here). Its imported
  // days are linked to one repeating booking whose pattern is the latest day,
  // and which carries on from the desktop tool's last day.
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
        const dayId = await tx.opsLegacyImport.findUnique({ where: { entity_legacyId: { entity: 'Job', legacyId: d.id } } });
        if (dayId) await tx.opsBooking.update({ where: { id: dayId.newId }, data: { seriesId: series.id } });
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
    if (await mapped('JobScheduleItem', s.id)) { tally('Running order line', 'skipped'); continue; }
    const bookingId = await resolve('Job', s.jobId);
    if (!bookingId) { tally('Running order line', 'skipped', `"${s.title}": its job was not imported`); continue; }
    if (!COMMIT) { tally('Running order line', 'created'); continue; }
    const item = await prisma.opsScheduleItem.create({
      data: { opsBookingId: bookingId, time: clean(s.time), title: s.title.slice(0, 200), assignee: clean(s.assignee), notes: clean(s.notes), createdAt: s.createdAt },
    });
    await remember(prisma, 'JobScheduleItem', s.id, item.id);
    tally('Running order line', 'created');
  }

  return {
    committed: COMMIT,
    source: { clients: clients.length, staff: staff.length, jobs: jobs.length, assignments: assignments.length, leads: leads.length, scheduleItems: scheduleItems.length },
    counts,
    report,
    ratesFilled,
    seriesDaysAdded: COMMIT ? await fillAllSeries(actor) : 0,
  };
}
