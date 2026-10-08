/**
 * VERGO Ops seen from the worker's app, against a real database: the worker
 * reads and agrees their KID and agreement while signed in, sees what Ops
 * knows about a shift (and nothing commercial), and accepting or declining an
 * offer in the app moves the Ops booking and lands in the audit log.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import { prisma, resetDatabase, disconnect, csrfHeaders, inject, workerToken } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ADMIN_TEST_SESSION_ID } = require('../testing/csrf');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { londonDateKey, addDays } = require('../ops/time');

function createApp() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const opsApi = require('../routes/ops').default;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mobileShifts = require('../routes/mobileShifts').default;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mobileDocuments = require('../routes/mobileDocuments').default;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cookieParser = require('cookie-parser');
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use((req: any, _res: any, next: any) => {
    req.session = req.headers['x-test-as'] === 'admin' ? { id: ADMIN_TEST_SESSION_ID, username: 'will', isAdmin: true } : undefined;
    next();
  });
  app.use('/api/v1/ops', opsApi);
  app.use('/api/v1/mobile/shifts', mobileShifts);
  app.use('/api/v1/mobile/documents', mobileDocuments);
  app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ ok: false, error: String(err?.message ?? err) }));
  return app;
}

const app = createApp();
const admin = (method: string, url: string, body?: unknown) =>
  inject(app, { method, url: `/api/v1/ops${url}`, headers: { ...csrfHeaders(), 'x-test-as': 'admin' }, body });
const asWorker = (userId: string) => (method: string, url: string, body?: unknown) =>
  inject(app, { method, url: `/api/v1/mobile${url}`, headers: { authorization: `Bearer ${workerToken(userId)}` }, body });
const ok = (res: { statusCode: number; body: any }, status = 200) => {
  assert.equal(res.statusCode, status, JSON.stringify(res.body).slice(0, 800));
  return res.body.data;
};

const today: string = londonDateKey(new Date());
const daysFromToday = (n: number): string => addDays(today, n);

test.beforeEach(async () => {
  await resetDatabase();
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "DocumentLink", "ClientDocument", "WorkerDocument", "DocumentTemplate", "OpsSetting", "AuditLog", "OpsScheduleItem", "OpsBookingCost", "OpsBookingSeries", "OpsBooking", "OpsRequirement", "WorkerProfile", "RightToWorkCheck" RESTART IDENTITY CASCADE');
});

test.after(async () => {
  await disconnect();
});

let n = 0;
/** Right to work, contact and payroll done, and the KID and agreement issued but not yet agreed. */
async function workerWithPack(first: string) {
  n += 1;
  const w = ok(await admin('POST', '/workers', { firstName: first, lastName: 'Test', email: `${first.toLowerCase()}${n}@example.com`, phone: '07700900000' }), 201);
  ok(await admin('POST', `/workers/${w.id}/rtw-checks`, {
    method: 'SHARE_CODE', performedOn: daysFromToday(-30), performedBy: 'Will', outcome: 'PASS', prescribedCheckConfirmed: true,
    validUntil: daysFromToday(200), followUpDue: daysFromToday(170), evidenceReference: 'Profile PDF in RTW folder',
  }), 201);
  ok(await admin('PATCH', `/workers/${w.id}`, { emergencyContactName: 'Sam', emergencyContactPhone: '07700900001', payrollStatus: 'ACTIVE', roles: ['Bar staff'] }));
  ok(await admin('POST', `/workers/${w.id}/documents/pack`, {}), 201);
  return w;
}

async function bookingOnTerms(quantity: number, inDays = 5) {
  n += 1;
  const c = ok(await admin('POST', '/clients', { companyName: 'Acme Events Ltd', contactName: 'Jo Bloggs', email: `client${n}@example.com`, clientType: 'BUSINESS_HIRER' }), 201);
  ok(await admin('POST', '/commercial-terms/review', { confirm: true }));
  const issued = ok(await admin('POST', `/clients/${c.id}/terms/issue`, {}), 201);
  ok(await admin('POST', `/client-terms/${issued.document.id}/accept`, {
    legalBusinessName: 'Acme Events Ltd', acceptedByName: 'Jo Bloggs', typedName: 'Jo Bloggs', method: 'Signed PDF by email', authorityConfirmed: true,
  }));
  return ok(await admin('POST', '/bookings', {
    clientId: c.id, status: 'CONFIRMED', eventType: 'Summer party', venue: 'The Hall', address: '1 Hall St, London',
    eventDate: daysFromToday(inDays), startTime: '18:00', expectedFinish: '23:00', onSiteContactName: 'Jo Bloggs', onSiteContactPhone: '07700900555',
    requirement: {
      role: 'Bar staff', quantity, clientChargeRate: 27.35, workerPayRate: 14, breakMins: 30,
      dressCode: 'All black', duties: 'Bar service', healthSafetyRisks: 'Glass, wet floors', riskControls: 'Briefing on arrival',
    },
  }), 201);
}

test('a worker confirms the KID and agrees the agreement in the app', async () => {
  const ana = await workerWithPack('Ana');
  const other = await workerWithPack('Ben');
  const app = asWorker(ana.id);

  const start = ok(await app('GET', '/documents'));
  assert.equal(start.toDo, 2);
  assert.equal(start.agreement.acceptedAt, null);

  // The agreement does not open until the KID is confirmed.
  assert.equal((await app('POST', `/documents/agreement/${start.agreement.id}/accept`, { agree: true, typedName: 'Ana Test' })).statusCode, 409);
  // Someone else's document is not there at all.
  const bens = ok(await asWorker(other.id)('GET', '/documents'));
  assert.equal((await app('GET', `/documents/${bens.kid.id}`)).statusCode, 404);
  assert.equal((await app('POST', `/documents/kid/${bens.kid.id}/acknowledge`, { acknowledged: true })).statusCode, 404);

  const kid = ok(await app('GET', `/documents/${start.kid.id}`));
  assert.equal(kid.title, 'Key Information Document');
  assert.ok(kid.body.length > 200, 'the full text comes with it');

  assert.equal((await app('POST', `/documents/kid/${start.kid.id}/acknowledge`, {})).statusCode, 400, 'the box must be ticked');
  ok(await app('POST', `/documents/kid/${start.kid.id}/acknowledge`, { acknowledged: true }));
  assert.equal(ok(await app('GET', '/documents')).toDo, 1);

  assert.equal((await app('POST', `/documents/agreement/${start.agreement.id}/accept`, { agree: true, typedName: 'A' })).statusCode, 400);
  ok(await app('POST', `/documents/agreement/${start.agreement.id}/accept`, { agree: true, typedName: '  Ana   Test ' }));
  const done = ok(await app('GET', '/documents'));
  assert.equal(done.toDo, 0);
  assert.equal(done.agreement.acceptedName, 'Ana Test');

  // Ops sees it: the worker is now ready, and the evidence says it was the app.
  const worker = ok(await admin('GET', `/workers/${ana.id}`));
  assert.equal(worker.readiness.ready, true, worker.readiness.missing.join(', '));
  const row = await prisma.workerDocument.findUniqueOrThrow({ where: { id: start.agreement.id } });
  assert.equal(row.acceptedAuthUserId, ana.id);
  assert.match(row.acceptanceMethod ?? '', /VERGO app/);
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: ana.id, action: 'CONTRACT_AGREED' } });
  assert.equal(audit.actor, 'Ana Test (worker, in the app)');
  assert.equal((audit.newValue as any).via, 'app');
});

test('an Ops shift in the app: the details, then accepting and declining move the booking', async () => {
  const ana = await workerWithPack('Ana');
  const app = asWorker(ana.id);
  const docs = ok(await app('GET', '/documents'));
  ok(await app('POST', `/documents/kid/${docs.kid.id}/acknowledge`, { acknowledged: true }));
  ok(await app('POST', `/documents/agreement/${docs.agreement.id}/accept`, { agree: true, typedName: 'Ana Test' }));

  const booking = await bookingOnTerms(1);
  ok(await admin('POST', `/bookings/${booking.id}/schedule`, { time: '17:30', title: 'Briefing', assignee: 'Jo' }), 201);
  ok(await admin('POST', `/bookings/${booking.id}/schedule`, { title: 'Glass collection after speeches' }), 201);
  const offered = ok(await admin('POST', `/bookings/${booking.id}/assignments`, { requirementId: booking.requirements[0].id, workerId: ana.id, status: 'PENDING' }), 201);
  ok(await admin('POST', `/assignments/${offered.assignmentId}/confirmation`, {}), 201);

  const list = ok(await app('GET', '/shifts?view=upcoming'));
  assert.equal(list.shifts.length, 1);
  const s = list.shifts[0];
  assert.equal(s.role, 'Bar staff');
  assert.equal(s.ops.dressCode, 'All black');
  assert.equal(s.ops.runningOrder, undefined, 'the running order is on the detail only');

  const detail = ok(await app('GET', `/shifts/${s.id}`));
  assert.equal(detail.ops.reference, booking.reference);
  assert.deepEqual(detail.ops.onSiteContact, { name: 'Jo Bloggs', phone: '07700900555' });
  assert.equal(detail.ops.healthSafetyRisks, 'Glass, wet floors');
  assert.equal(detail.ops.breakMins, 30);
  assert.deepEqual(detail.ops.runningOrder.map((i: any) => i.title), ['Briefing', 'Glass collection after speeches']);
  assert.ok(detail.ops.confirmationDocumentId, 'the assignment confirmation is linked');
  ok(await app('GET', `/documents/${detail.ops.confirmationDocumentId}`));
  // Nothing commercial reaches the worker.
  assert.ok(!JSON.stringify(detail).includes('27.35'), 'the client charge rate is not sent');

  ok(await app('POST', `/shifts/${s.id}/confirm`, { acceptedTerms: true }));
  const after = ok(await admin('GET', `/bookings/${booking.id}`));
  assert.equal(after.status, 'FULLY_STAFFED');
  const accepted = await prisma.auditLog.findFirstOrThrow({ where: { entityId: booking.id, action: 'ASSIGNMENT_CHANGED', actor: { contains: 'in the app' } } });
  assert.equal((accepted.newValue as any).status, 'CONFIRMED');

  // A second offer, declined with a reason: the booking stays unstaffed.
  const second = await bookingOnTerms(1, 6);
  const offer2 = ok(await admin('POST', `/bookings/${second.id}/assignments`, { requirementId: second.requirements[0].id, workerId: ana.id, status: 'PENDING' }), 201);
  ok(await app('POST', `/shifts/${offer2.assignmentId}/decline`, { reason: 'Away that weekend' }));
  const declinedBooking = ok(await admin('GET', `/bookings/${second.id}`));
  assert.equal(declinedBooking.staffing.unfilled, 1);
  assert.equal(declinedBooking.status, 'CONFIRMED');
  const declined = await prisma.auditLog.findFirstOrThrow({ where: { entityId: second.id, action: 'ASSIGNMENT_CHANGED', actor: { contains: 'in the app' } } });
  assert.match(declined.reason ?? '', /Away that weekend/);
});

test('an Ops shift waits while the worker has an agreement to agree', async () => {
  const ana = await workerWithPack('Ana');
  const booking = await bookingOnTerms(1);
  const offered = await admin('POST', `/bookings/${booking.id}/assignments`, {
    requirementId: booking.requirements[0].id, workerId: ana.id, status: 'PENDING', overrideReason: 'Agreeing it in the app today',
  });
  const assignmentId = ok(offered, 201).assignmentId;

  const app = asWorker(ana.id);
  const refused = await app('POST', `/shifts/${assignmentId}/confirm`, { acceptedTerms: true });
  assert.equal(refused.statusCode, 409);
  assert.equal(refused.body.code, 'AGREEMENT_PENDING');

  const docs = ok(await app('GET', '/documents'));
  ok(await app('POST', `/documents/kid/${docs.kid.id}/acknowledge`, { acknowledged: true }));
  ok(await app('POST', `/documents/agreement/${docs.agreement.id}/accept`, { agree: true, typedName: 'Ana Test' }));
  ok(await app('POST', `/shifts/${assignmentId}/confirm`, { acceptedTerms: true }));
});
