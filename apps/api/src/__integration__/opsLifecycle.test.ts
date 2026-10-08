/**
 * The whole VERGO Ops working day against a real database, the way the office
 * uses it: a worker made ready, a client on accepted Terms, a booking staffed
 * through the assignment checks, timesheets edited, disputed and approved,
 * the profit worked out, invoiced and paid; then the screens that read all of
 * that (dashboard, AWR, direct hire, exports, audit) and the tools beside it
 * (payroll history CSV, settings). Every request goes through the real routes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import { prisma, resetDatabase, disconnect, csrfHeaders, inject } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ADMIN_TEST_SESSION_ID } = require('../testing/csrf');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { londonDateKey, addDays } = require('../ops/time');

function createApp() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const opsApi = require('../routes/ops').default;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cookieParser = require('cookie-parser');
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());
  app.use((req: any, _res: any, next: any) => {
    req.session = req.headers['x-test-as'] === 'admin' ? { id: ADMIN_TEST_SESSION_ID, username: 'will', isAdmin: true } : undefined;
    next();
  });
  app.use('/api/v1/ops', opsApi);
  // An unhandled error is a 500 with its message, not a hung request.
  app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ ok: false, error: String(err?.message ?? err) }));
  return app;
}

const app = createApp();
const admin = (method: string, url: string, body?: unknown) =>
  inject(app, { method, url: `/api/v1/ops${url}`, headers: { ...csrfHeaders(), 'x-test-as': 'admin' }, body });
const ok = (res: { statusCode: number; body: any }, status = 200) => {
  assert.equal(res.statusCode, status, JSON.stringify(res.body).slice(0, 800));
  return res.body.data;
};

const today: string = londonDateKey(new Date());
const daysFromToday = (n: number): string => addDays(today, n);

test.beforeEach(async () => {
  await resetDatabase();
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "DocumentLink", "ClientDocument", "WorkerDocument", "DocumentTemplate", "OpsSetting", "AuditLog", "HistoricPayment", "DirectHireTracking", "OpsBookingCost", "OpsBookingSeries", "OpsBooking", "OpsRequirement", "WorkerProfile", "Applicant", "RightToWorkCheck" RESTART IDENTITY CASCADE');
});

test.after(async () => {
  await disconnect();
});

// ── Fixtures, all made through the API ────────────────────────────────────

let n = 0;
async function newWorker(first: string, opts: { roles?: string[] } = {}) {
  n += 1;
  const w = ok(await admin('POST', '/workers', { firstName: first, lastName: 'Test', email: `${first.toLowerCase()}${n}@example.com`, phone: '07700900000' }), 201);
  if (opts.roles) ok(await admin('PATCH', `/workers/${w.id}`, { roles: opts.roles }));
  return w;
}

/** Right to work, contact, payroll, KID and an agreed contract: Ready for Work. */
async function makeReady(workerId: string, roles = ['Waiting staff']) {
  ok(await admin('POST', `/workers/${workerId}/rtw-checks`, {
    method: 'SHARE_CODE', performedOn: daysFromToday(-30), performedBy: 'Will', outcome: 'PASS', prescribedCheckConfirmed: true,
    validUntil: daysFromToday(200), followUpDue: daysFromToday(170), evidenceReference: 'Profile PDF in RTW folder',
  }), 201);
  ok(await admin('PATCH', `/workers/${workerId}`, { emergencyContactName: 'Sam', emergencyContactPhone: '07700900001', payrollStatus: 'ACTIVE', roles }));
  ok(await admin('POST', `/workers/${workerId}/documents/pack`, {}), 201);
  const agreement = await prisma.workerDocument.findFirstOrThrow({ where: { userId: workerId, type: 'ZERO_HOURS_AGREEMENT', status: 'ISSUED' } });
  ok(await admin('POST', `/documents/${agreement.id}/accept`, { acceptedName: 'Typed Name', method: 'Signed copy emailed back' }));
  const worker = ok(await admin('GET', `/workers/${workerId}`));
  assert.equal(worker.readiness.ready, true, `worker should be ready, missing: ${worker.readiness.missing.join(', ')}`);
  return worker;
}

/** A business client whose current Terms of Business are accepted. */
async function newClientOnTerms(name = 'Acme Events Ltd') {
  n += 1;
  const c = ok(await admin('POST', '/clients', { companyName: name, contactName: 'Jo Bloggs', email: `client${n}@example.com`, clientType: 'BUSINESS_HIRER', industry: 'Corporate events' }), 201);
  ok(await admin('POST', '/commercial-terms/review', { confirm: true }));
  const issued = ok(await admin('POST', `/clients/${c.id}/terms/issue`, {}), 201);
  ok(await admin('POST', `/client-terms/${issued.document.id}/accept`, {
    legalBusinessName: name, acceptedByName: 'Jo Bloggs', typedName: 'Jo Bloggs', method: 'Signed PDF by email', authorityConfirmed: true,
  }));
  return c;
}

// ── The working day ───────────────────────────────────────────────────────

test('a booking from first worker to paid invoice, with every check on the way', async () => {
  const ana = await newWorker('Ana');
  const ben = await newWorker('Ben');
  const cat = await newWorker('Cat');
  await makeReady(ana.id);
  await makeReady(cat.id);
  // Ben has no right-to-work check at all.
  const client = await newClientOnTerms();

  const shiftDay = daysFromToday(-2);
  const booking = ok(await admin('POST', '/bookings', {
    clientId: client.id, status: 'CONFIRMED', eventType: 'Gala dinner', venue: 'The Hall', address: '1 Hall St, London',
    eventDate: shiftDay, startTime: '18:00', expectedFinish: '01:00',
  }), 201);
  assert.match(booking.reference, /^VB-\d{4}-\d{4}$/);
  assert.equal(booking.warnings.some((w: string) => /Terms/.test(w)), false, 'accepted Terms: no terms warning');

  const withReq = ok(await admin('POST', `/bookings/${booking.id}/requirements`, {
    role: 'Waiting staff', quantity: 2, clientChargeRate: 20, workerPayRate: 13, breakMins: 30, minimumHours: 4,
    travelContribution: 5, duties: 'Serve', healthSafetyRisks: 'Hot plates', riskControls: 'Briefing',
  }), 201);
  const requirementId = withReq.requirements[0].id;
  assert.equal(Number(withReq.requirements[0].afterMidnightMultiplier), 1.25, 'the uplift default is filled in');

  // Ben: no right to work, so blocked even with a reason.
  const check = ok(await admin('POST', `/bookings/${booking.id}/assignments/check`, { requirementId, workerId: ben.id }));
  assert.equal(check.ok, false);
  assert.ok(check.warnings.some((w: any) => w.blocking));
  const blocked = await admin('POST', `/bookings/${booking.id}/assignments`, { requirementId, workerId: ben.id, overrideReason: 'We are short of staff tonight' });
  assert.equal(blocked.statusCode, 409);

  // Ana: ready, no warnings.
  const a1 = ok(await admin('POST', `/bookings/${booking.id}/assignments`, { requirementId, workerId: ana.id }), 201);
  assert.deepEqual(a1.warnings, []);
  assert.equal(a1.booking.status, 'STAFFING');
  const dup = await admin('POST', `/bookings/${booking.id}/assignments`, { requirementId, workerId: ana.id });
  assert.equal(dup.statusCode, 409, 'the same worker twice on one requirement');

  // Cat is already on another shift that evening: a warning that needs a reason.
  const other = ok(await admin('POST', '/bookings', {
    clientId: client.id, status: 'CONFIRMED', eventDate: shiftDay, startTime: '17:00', expectedFinish: '20:00',
    requirement: { role: 'Waiting staff', quantity: 1, clientChargeRate: 20, workerPayRate: 13 },
  }), 201);
  ok(await admin('POST', `/bookings/${other.id}/assignments`, { requirementId: other.requirements[0].id, workerId: cat.id }), 201);
  const overlap = await admin('POST', `/bookings/${booking.id}/assignments`, { requirementId, workerId: cat.id });
  assert.equal(overlap.statusCode, 409);
  assert.equal(overlap.body.needsReason, true);
  assert.ok(overlap.body.warnings.some((w: any) => w.code === 'overlap'));
  const a2 = ok(await admin('POST', `/bookings/${booking.id}/assignments`, { requirementId, workerId: cat.id, overrideReason: 'Leaving the first job early, agreed with client' }), 201);
  const catAssignmentId = a2.assignmentId;
  // Take Cat off the other one again so the rest of the day is simple.
  const otherRow = await prisma.booking.findFirstOrThrow({ where: { opsBookingId: other.id } });
  ok(await admin('PATCH', `/assignments/${otherRow.id}`, { status: 'CANCELLED', reason: 'Moved to the gala' }));

  // Both accept: fully staffed.
  ok(await admin('PATCH', `/assignments/${a1.assignmentId}`, { status: 'CONFIRMED' }));
  const full = ok(await admin('PATCH', `/assignments/${catAssignmentId}`, { status: 'CONFIRMED', overrideReason: 'Leaving the first job early, agreed with client' }));
  assert.equal(full.status, 'FULLY_STAFFED');
  assert.equal(full.staffing.unfilled, 0);

  // The assignment confirmation renders from the booking.
  const conf = ok(await admin('POST', `/assignments/${a1.assignmentId}/confirmation`, {}), 201);
  assert.ok(conf.renderedBody.includes('The Hall'));
  assert.ok(conf.renderedBody.includes('£13.00 per hour'));

  // Timesheets: both are awaiting approval (the shift was two days ago).
  const awaiting = ok(await admin('GET', '/timesheets?filter=awaiting'));
  assert.deepEqual(awaiting.map((t: any) => t.id).sort(), [a1.assignmentId, catAssignmentId].sort());

  // Ana: check-in 18:00, check-out 01:30 London (GMT/BST handled by ISO with offset).
  const inAt = new Date(`${shiftDay}T17:00:00Z`).toISOString();
  const outAt = new Date(new Date(`${shiftDay}T17:00:00Z`).getTime() + 7.5 * 3600000).toISOString();
  const noReason = await admin('PATCH', `/assignments/${a1.assignmentId}/timesheet`, { checkedInAt: inAt, checkedOutAt: outAt });
  assert.equal(noReason.statusCode, 400, 'a timesheet edit needs a reason');
  const edited = ok(await admin('PATCH', `/assignments/${a1.assignmentId}/timesheet`, { checkedInAt: inAt, checkedOutAt: outAt, reason: 'Paper sheet from the venue' }));
  assert.equal(edited.actualHours, 7.5);
  assert.equal(edited.netWorkedHours, 7, '30 minute break comes off');
  const backwards = await admin('PATCH', `/assignments/${a1.assignmentId}/timesheet`, { checkedInAt: outAt, checkedOutAt: inAt, reason: 'typo' });
  assert.equal(backwards.statusCode, 400);

  // A dispute stops approval until resolved.
  ok(await admin('POST', `/assignments/${a1.assignmentId}/timesheet/dispute`, { reason: 'Client says she left at midnight' }));
  assert.equal(ok(await admin('GET', '/timesheets?filter=disputed')).length, 1);
  assert.equal((await admin('POST', `/assignments/${a1.assignmentId}/timesheet/approve`, {})).statusCode, 409);
  ok(await admin('POST', `/assignments/${a1.assignmentId}/timesheet/dispute`, { resolve: true, reason: 'Checked CCTV, 01:30 stands' }));
  ok(await admin('POST', `/assignments/${a1.assignmentId}/timesheet/client-approval`, { approvedBy: 'Jo Bloggs' }));
  ok(await admin('POST', `/assignments/${a1.assignmentId}/timesheet/approve`, {}));

  // Invoice refused while Cat's shift is still open.
  const early = await admin('POST', `/bookings/${booking.id}/invoice`, { invoiceRef: 'INV-001' });
  assert.equal(early.statusCode, 409);
  const done = ok(await admin('POST', `/assignments/${catAssignmentId}/timesheet/approve`, { hours: 3 }));
  assert.equal(done.status, 'FULLY_STAFFED');

  // Profit: Ana 7h, Cat 3h billed at the 4h minimum. Ana's checked times run
  // to 01:30, so 1.5h after midnight; Cat has no clock times so her planned
  // 18:00-01:00 gives 1h.
  const costs = ok(await admin('POST', `/bookings/${booking.id}/costs`, { kind: 'CHARGE', category: 'charge', description: 'Late finish fee', amount: 25 }), 201);
  ok(await admin('POST', `/bookings/${booking.id}/costs`, { kind: 'COST', category: 'equipment', description: 'Trays hire', amount: 10 }), 201);
  const p = ok(await admin('GET', `/bookings/${booking.id}`)).profit;
  assert.ok(costs);
  assert.equal(p.billableHours, 11);
  assert.equal(p.revenue.hoursPence, 22000);
  assert.equal(p.revenue.afterMidnightPence, Math.round(2000 * 1.5 * 0.25) + Math.round(2000 * 1 * 0.25));
  assert.equal(p.revenue.chargesPence, 2500);
  assert.equal(p.workerWagesPence, 1300 * 7 + 1300 * 4);
  assert.equal(p.holidayPayPence, Math.round(1300 * 7 * 0.1207) + Math.round(1300 * 4 * 0.1207));
  assert.equal(p.workerTravelExpensesPence, 1000);
  assert.equal(p.otherDirectCostsPence, 1000);
  assert.equal(p.isEstimate, true);
  assert.equal(p.grossContributionPence, p.revenuePence - p.directLabourCostPence - p.otherDirectCostsPence);

  // Actual payroll replaces the estimate.
  const actual = ok(await admin('POST', `/bookings/${booking.id}/actual-payroll`, { wagesPence: 14000, holidayPayPence: 1700, employerCostsPence: 0, note: 'From the October payroll run' }));
  assert.equal(actual.profit.workerWagesPence, 14000);
  assert.equal(actual.profit.isEstimate, false);

  // Invoice and pay; timesheets lock.
  const invoiced = ok(await admin('POST', `/bookings/${booking.id}/invoice`, { invoiceRef: 'INV-001' }));
  assert.equal(invoiced.status, 'INVOICED');
  assert.equal((await admin('POST', `/bookings/${booking.id}/invoice`, { invoiceRef: 'INV-002' })).statusCode, 409);
  const locked = await admin('PATCH', `/assignments/${a1.assignmentId}/timesheet`, { hoursWorked: 9, reason: 'Late correction' });
  assert.equal(locked.statusCode, 409);
  const shifts = await prisma.booking.findMany({ where: { opsBookingId: booking.id, status: 'COMPLETED' } });
  assert.ok(shifts.every((s) => s.invoiceRef === 'INV-001' && s.invoicedAt), 'the shifts carry the invoice for the pay run');

  const csvBefore = await admin('GET', '/exports/invoices');
  assert.ok(csvBefore.raw.includes('INV-001'), 'outstanding until paid');
  const paid = ok(await admin('POST', `/bookings/${booking.id}/paid`, {}));
  assert.equal(paid.status, 'PAID');
  assert.ok(!(await admin('GET', '/exports/invoices')).raw.includes('INV-001'));

  // Everything above is in the audit log.
  const actions = new Set((await prisma.auditLog.findMany({ where: { entityId: booking.id } })).map((a) => a.action));
  for (const a of ['BOOKING_CREATED', 'REQUIREMENT_ADDED', 'ASSIGNMENT_CHANGED', 'TIMESHEET_MODIFIED', 'TIMESHEET_DISPUTED', 'TIMESHEET_DISPUTE_RESOLVED', 'TIMESHEET_CLIENT_APPROVED', 'TIMESHEET_APPROVED', 'CHARGE_ADDED', 'COST_ADDED', 'PROFIT_OVERRIDE', 'BOOKING_STATUS_CHANGED']) {
    assert.ok(actions.has(a), `audit has ${a}`);
  }
});

test('moving a booking to another day or time moves its shifts with it', async () => {
  const ana = await newWorker('Ana');
  await makeReady(ana.id);
  const client = await newClientOnTerms();
  const day = daysFromToday(10);
  const b = ok(await admin('POST', '/bookings', {
    clientId: client.id, status: 'CONFIRMED', eventDate: day, startTime: '09:00', expectedFinish: '17:00', venue: 'Old venue',
    requirement: { role: 'Waiting staff', quantity: 1, clientChargeRate: 20, workerPayRate: 13 },
  }), 201);
  const a = ok(await admin('POST', `/bookings/${b.id}/assignments`, { requirementId: b.requirements[0].id, workerId: ana.id }), 201);

  const newDay = daysFromToday(12);
  ok(await admin('PATCH', `/bookings/${b.id}`, { eventDate: newDay, startTime: '10:00', expectedFinish: '18:00', venue: 'New venue' }));
  const shift = await prisma.booking.findUniqueOrThrow({ where: { id: a.assignmentId } });
  assert.equal(shift.eventDate.toISOString().slice(0, 10), newDay, "the worker's shift moves with the booking");
  assert.equal(shift.shiftStart, '10:00');
  assert.equal(shift.shiftEnd, '18:00');
  assert.equal(shift.venue, 'New venue');
  assert.equal(Number(shift.hoursEstimated), 8);

  // A shift with its own times keeps them when only the date moves.
  ok(await admin('PATCH', `/assignments/${a.assignmentId}`, { plannedStart: '12:00' }));
  ok(await admin('PATCH', `/bookings/${b.id}`, { eventDate: day }));
  const kept = await prisma.booking.findUniqueOrThrow({ where: { id: a.assignmentId } });
  assert.equal(kept.eventDate.toISOString().slice(0, 10), day);
  assert.equal(kept.shiftStart, '12:00');
});

test('cancelling a booking stands its staff down; replacing a worker keeps the old row', async () => {
  const ana = await newWorker('Ana');
  const cat = await newWorker('Cat');
  await makeReady(ana.id);
  await makeReady(cat.id);
  const client = await newClientOnTerms();
  const b = ok(await admin('POST', '/bookings', {
    clientId: client.id, status: 'CONFIRMED', eventDate: daysFromToday(5), startTime: '09:00', expectedFinish: '17:00',
    requirement: { role: 'Waiting staff', quantity: 1, clientChargeRate: 20, workerPayRate: 13 },
  }), 201);
  const a = ok(await admin('POST', `/bookings/${b.id}/assignments`, { requirementId: b.requirements[0].id, workerId: ana.id, status: 'CONFIRMED' }), 201);
  assert.equal(a.booking.status, 'FULLY_STAFFED');

  const swapped = ok(await admin('POST', `/assignments/${a.assignmentId}/replace`, { workerId: cat.id, reason: 'Ana is ill', status: 'CONFIRMED' }));
  const rows = swapped.assignments.map((x: any) => [x.worker.name, x.status]).sort();
  assert.deepEqual(rows, [['Ana Test', 'REPLACED'], ['Cat Test', 'CONFIRMED']]);
  assert.equal(swapped.status, 'FULLY_STAFFED');

  const cancelled = ok(await admin('PATCH', `/bookings/${b.id}`, { status: 'CANCELLED' }));
  assert.equal(cancelled.status, 'CANCELLED');
  assert.ok(cancelled.assignments.every((x: any) => x.rawStatus === 'CANCELLED'));
  assert.equal((await admin('POST', `/bookings/${b.id}/invoice`, { invoiceRef: 'X' })).statusCode, 409);
  assert.equal((await admin('POST', `/bookings/${b.id}/assignments`, { requirementId: b.requirements[0].id, workerId: ana.id })).statusCode, 409);
});

test('saving a form unchanged logs no change, and addresses keep their commas', async () => {
  const client = await newClientOnTerms();
  const b = ok(await admin('POST', '/bookings', {
    clientId: client.id, status: 'CONFIRMED', eventDate: daysFromToday(9), startTime: '09:00', expectedFinish: '17:00',
    requirement: { role: 'Waiting staff', quantity: 1, clientChargeRate: 22.5, workerPayRate: 13.5 },
  }), 201);
  const req = b.requirements[0];
  ok(await admin('PATCH', `/requirements/${req.id}`, { role: 'Waiting staff', quantity: 1, clientChargeRate: 22.5, workerPayRate: 13.5 }));
  assert.equal(await prisma.auditLog.count({ where: { entityId: b.id, action: { in: ['RATE_CHANGED', 'REQUIREMENT_UPDATED'] } } }), 0, 'the same rates are not a rate change');
  ok(await admin('PATCH', `/requirements/${req.id}`, { clientChargeRate: 23 }));
  const change = await prisma.auditLog.findFirstOrThrow({ where: { entityId: b.id, action: 'RATE_CHANGED' } });
  assert.deepEqual(change.oldValue, { clientChargeRate: 22.5 }, 'money is logged as a number');

  ok(await admin('PATCH', `/clients/${client.id}`, { defaultChargeRate: 20, venueAddresses: ['The Hall, 1 High St, London'] }));
  const before = await prisma.auditLog.count({ where: { entityId: client.id, action: 'CLIENT_UPDATED' } });
  const same = ok(await admin('PATCH', `/clients/${client.id}`, { defaultChargeRate: 20, venueAddresses: ['The Hall, 1 High St, London'] }));
  assert.deepEqual(same.venueAddresses, ['The Hall, 1 High St, London']);
  assert.equal(await prisma.auditLog.count({ where: { entityId: client.id, action: 'CLIENT_UPDATED' } }), before);

  const [line] = ok(await admin('POST', `/bookings/${b.id}/schedule`, { time: '08:30', title: 'Briefing', assignee: null, notes: null }), 201);
  const lines = await prisma.auditLog.count({ where: { entityId: b.id, action: 'RUNNING_ORDER_CHANGED' } });
  ok(await admin('PATCH', `/schedule/${line.id}`, { time: '08:30', title: 'Briefing', assignee: null, notes: null }));
  assert.equal(await prisma.auditLog.count({ where: { entityId: b.id, action: 'RUNNING_ORDER_CHANGED' } }), lines, 'an unchanged running order line is not logged');
});

test('a draft or quote with nothing worked cannot be invoiced', async () => {
  const client = await newClientOnTerms();
  const b = ok(await admin('POST', '/bookings', { clientId: client.id, status: 'QUOTED', eventDate: daysFromToday(20), startTime: '09:00', expectedFinish: '17:00' }), 201);
  const res = await admin('POST', `/bookings/${b.id}/invoice`, { invoiceRef: 'INV-Q' });
  assert.equal(res.statusCode, 409);
});

test('a Ready override needs a reason, and never gets past a right-to-work block', async () => {
  const ben = await newWorker('Ben', { roles: ['Waiting staff'] });
  assert.equal((await admin('POST', `/workers/${ben.id}/ready-override`, { active: true, reason: 'short' })).statusCode, 400);
  const over = ok(await admin('POST', `/workers/${ben.id}/ready-override`, { active: true, reason: 'Known to us for years, paperwork in post' }));
  assert.equal(over.readiness.ready, true);
  assert.equal(over.readiness.overridden, true);

  const client = await newClientOnTerms();
  const b = ok(await admin('POST', '/bookings', {
    clientId: client.id, status: 'CONFIRMED', eventDate: daysFromToday(3), startTime: '09:00', expectedFinish: '17:00',
    requirement: { role: 'Waiting staff', quantity: 1, clientChargeRate: 20, workerPayRate: 13 },
  }), 201);
  const res = await admin('POST', `/bookings/${b.id}/assignments`, { requirementId: b.requirements[0].id, workerId: ben.id, overrideReason: 'Override is set on his record' });
  assert.equal(res.statusCode, 409, 'no right to work blocks even an overridden worker');

  const filtered = ok(await admin('GET', '/workers?ready=overridden'));
  assert.deepEqual(filtered.map((w: any) => w.id), [ben.id]);
});

test('right-to-work records refuse a share code, a future date and an unconfirmed pass', async () => {
  const w = await newWorker('Ana');
  const base = { method: 'SHARE_CODE', performedOn: today, performedBy: 'Will', outcome: 'PASS', prescribedCheckConfirmed: true };
  assert.equal((await admin('POST', `/workers/${w.id}/rtw-checks`, { ...base, prescribedCheckConfirmed: false })).statusCode, 400);
  assert.equal((await admin('POST', `/workers/${w.id}/rtw-checks`, { ...base, performedOn: daysFromToday(1) })).statusCode, 400);
  assert.equal((await admin('POST', `/workers/${w.id}/rtw-checks`, { ...base, evidenceReference: 'W4K 7XP 9QR' })).statusCode, 400);
  assert.equal((await admin('POST', `/workers/${w.id}/rtw-checks`, { ...base, validUntil: daysFromToday(20) })).statusCode, 400, 'time-limited needs a follow-up');
  const soon = ok(await admin('POST', `/workers/${w.id}/rtw-checks`, { ...base, validUntil: daysFromToday(20), followUpDue: daysFromToday(10) }), 201);
  assert.equal(soon.rtw.status, 'valid');
  assert.equal(soon.rtw.expiryBucket, 'within_30');
  assert.deepEqual(ok(await admin('GET', '/workers?rtwExpiry=within_30')).map((x: any) => x.id), [w.id]);

  const blocked = ok(await admin('POST', `/workers/${w.id}/rtw-block`, { blocked: true, reason: 'Home Office letter' }));
  assert.equal(blocked.rtw.status, 'blocked');
});

test('the dashboard, AWR, direct hire and exports read the same day back', async () => {
  const ana = await newWorker('Ana');
  await makeReady(ana.id);
  await newWorker('Ben');
  const client = await newClientOnTerms();

  // Eleven weekly shifts with the same hirer and role: past the 10-week warning.
  for (let week = 11; week >= 1; week--) {
    const b = ok(await admin('POST', '/bookings', {
      clientId: client.id, status: 'CONFIRMED', eventDate: daysFromToday(-7 * week), startTime: '09:00', expectedFinish: '17:00',
      requirement: { role: 'Waiting staff', quantity: 1, clientChargeRate: 20, workerPayRate: 13 },
    }), 201);
    ok(await admin('POST', `/bookings/${b.id}/assignments`, { requirementId: b.requirements[0].id, workerId: ana.id, status: 'CONFIRMED' }), 201);
  }
  // One upcoming booking with an empty slot.
  ok(await admin('POST', '/bookings', {
    clientId: client.id, status: 'CONFIRMED', eventDate: daysFromToday(4), startTime: '09:00', expectedFinish: '17:00',
    requirement: { role: 'Waiting staff', quantity: 2, clientChargeRate: 20, workerPayRate: 13 },
  }), 201);

  const dash = ok(await admin('GET', '/dashboard'));
  assert.equal(dash.workers.active, 2);
  assert.equal(dash.workers.ready, 1);
  assert.equal(dash.workers.blocked, 1);
  assert.equal(dash.workers.rtwNoCheck, 1);
  assert.equal(dash.assignments.unfilledSlots, 2);
  assert.equal(dash.assignments.timesheetsAwaitingApproval, 11);
  assert.equal(dash.money.isEstimate, true);
  assert.ok(Array.isArray(dash.alerts));

  const awr = ok(await admin('GET', '/awr'));
  assert.match(awr.label, /review required/);
  assert.equal(awr.rows.length, 1);
  assert.equal(awr.rows[0].weeksAccumulated, 11);
  assert.notEqual(awr.rows[0].level, 'none');

  const dh = ok(await admin('GET', '/direct-hire'));
  assert.equal(dh.rows.length, 1);
  ok(await admin('PUT', '/direct-hire', { userId: ana.id, clientId: client.id, transferFeeStatus: 'POSSIBLE', notes: 'Client asked about hiring her' }));
  assert.equal(ok(await admin('GET', '/direct-hire')).rows[0].tracking.transferFeeStatus, 'POSSIBLE');

  for (const name of ['workers', 'compliance', 'bookings', 'profitability', 'assignments', 'timesheets', 'payroll-history', 'invoices']) {
    const res = await admin('GET', `/exports/${name}.csv`);
    assert.equal(res.statusCode, 200, name);
    assert.ok(res.raw.split('\n')[0].includes(','), `${name} has a header row`);
  }
  const workersCsv = (await admin('GET', '/exports/workers.csv')).raw;
  assert.ok(workersCsv.includes('Ana'));
  assert.ok(!/0770090000[01]/.test((await admin('GET', '/exports/compliance.csv')).raw), 'compliance export has no phone numbers');
  assert.equal((await admin('GET', '/exports/nope.csv')).statusCode, 404);

  const audit = ok(await admin('GET', '/audit?action=EXPORT_DOWNLOADED'));
  assert.ok(audit.length >= 8, 'every export is logged');

  const record = await admin('GET', `/workers/${ana.id}/export`);
  assert.equal(record.statusCode, 200);
  assert.equal(record.body.worker.id, ana.id);
});

test('payroll history: a CSV with a bad row is refused, then imports once', async () => {
  const ana = await newWorker('Ana');
  const header = 'worker_name,worker_email,payment_date,hours,base_pay,holiday_pay,gross_transferred,notes,payroll_corrected,fps_submitted,hmrc_reconciled';
  const bad = [header, `Ana Test,${ana.email},31/08/2026,10,130,15.69,145.69,,no,no,no`, 'Someone,,not a date,,,,abc,,,,'].join('\n');
  const preview = ok(await admin('POST', '/payroll-history/import', { csv: bad }));
  assert.equal(preview.committed, false);
  assert.equal(preview.rows[0].matched, true, 'matched to the worker by email');
  assert.equal(preview.rows[1].errors.length, 2);
  assert.equal((await admin('POST', '/payroll-history/import', { csv: bad, commit: true })).statusCode, 400);
  assert.equal(await prisma.historicPayment.count(), 0);

  const good = [header, `Ana Test,${ana.email},31/08/2026,10,130,15.69,"£145.69",Paid by bank,yes,no,no`, 'Old Worker,,2026-07-31,,,,"1,200.00",,,,'].join('\n');
  const done = ok(await admin('POST', '/payroll-history/import', { csv: good, commit: true }));
  assert.equal(done.created, 2);
  const again = ok(await admin('POST', '/payroll-history/import', { csv: good, commit: true }));
  assert.equal(again.created, 0, 'duplicates are skipped');

  const list = ok(await admin('GET', '/payroll-history'));
  assert.equal(list.rows.length, 2);
  assert.equal(list.totals.gross, 1345.69);
  const old = list.rows.find((r: any) => r.workerName === 'Old Worker');
  ok(await admin('PATCH', `/payroll-history/${old.id}`, { fpsSubmitted: true }));
  assert.equal(ok(await admin('GET', '/payroll-history')).totals.notFps, 1);

  const manualBadUser = await admin('POST', '/payroll-history', { userId: 'not-a-worker', workerName: 'X', paymentDate: '2026-08-01', grossTransferred: 10 });
  assert.equal(manualBadUser.statusCode, 404, 'an unknown worker id is a clear 404, not a crash');

  const csv = (await admin('GET', '/exports/payroll-history.csv')).raw;
  assert.ok(csv.includes('Old Worker') && csv.includes('1200.00') || csv.includes('1200'));
});

test('settings save, are audited, and a bad value is refused', async () => {
  const s = ok(await admin('GET', '/settings'));
  assert.ok(s.settings);
  assert.equal((await admin('PUT', '/settings/payFrequency', { value: 'fortnightly-ish' })).statusCode, 400);
  ok(await admin('PUT', '/settings/payFrequency', { value: 'monthly' }));
  assert.equal(ok(await admin('GET', '/settings')).settings.payFrequency, 'monthly');
  assert.equal((await admin('PUT', '/settings/notASetting', { value: 1 })).statusCode, 404);
  assert.ok((await prisma.auditLog.count({ where: { action: 'SETTING_CHANGED' } })) >= 1);
});

test('leads convert to bookings, and the rota lists the week', async () => {
  const ana = await newWorker('Ana');
  await makeReady(ana.id);
  const client = await newClientOnTerms();
  const lead = ok(await admin('POST', '/leads', { company: 'Bob Ltd', contactName: 'Bob Party', contactEmail: 'bob@example.com', contactedOn: today, notes: 'Wants 3 bar staff' }), 201);
  assert.ok(lead.id);
  const leads = ok(await admin('GET', '/leads'));
  assert.equal(leads.length, 1);
  const converted = ok(await admin('POST', `/leads/${lead.id}/convert`, {}), 201);
  assert.equal(converted.companyName, 'Bob Ltd');
  assert.equal((await admin('POST', `/leads/${lead.id}/convert`, {})).statusCode, 409, 'converted once only');
  const fromLead = ok(await admin('GET', `/clients/${converted.clientId}`));
  assert.equal(fromLead.email, 'bob@example.com');

  const b = ok(await admin('POST', '/bookings', {
    clientId: client.id, status: 'CONFIRMED', eventDate: daysFromToday(2), startTime: '09:00', expectedFinish: '17:00',
    requirement: { role: 'Waiting staff', quantity: 1, clientChargeRate: 20, workerPayRate: 13 },
  }), 201);
  ok(await admin('POST', `/bookings/${b.id}/assignments`, { requirementId: b.requirements[0].id, workerId: ana.id, status: 'CONFIRMED' }), 201);
  const rota = ok(await admin('GET', `/rota?week=${daysFromToday(2)}`));
  assert.ok(JSON.stringify(rota).includes('Ana'), 'the rota shows who is working');
});

test('nothing in Ops answers without an admin session', async () => {
  for (const [method, url] of [['GET', '/dashboard'], ['GET', '/workers'], ['GET', '/bookings'], ['GET', '/exports/workers.csv'], ['POST', '/workers'], ['GET', '/payroll-history'], ['GET', '/audit']]) {
    const res = await inject(app, { method, url: `/api/v1/ops${url}`, headers: csrfHeaders(), body: method === 'POST' ? {} : undefined });
    assert.equal(res.statusCode, 401, `${method} ${url}`);
  }
});
