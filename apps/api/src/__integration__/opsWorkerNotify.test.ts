/**
 * What a worker's phone is told when the office acts in VERGO Ops, against a
 * real database: offers, bookings, moves, cancellations, replacements and
 * documents, and that a worker without the app (or a past shift) gets nothing
 * while Ops is told they need a text instead.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import { prisma, resetDatabase, disconnect, csrfHeaders, inject } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ADMIN_TEST_SESSION_ID } = require('../testing/csrf');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { londonDateKey, addDays } = require('../ops/time');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { setWorkerPushSender } = require('../ops/workerNotify');

type Push = { userId: string; title: string; body: string; data: Record<string, unknown> };
let pushes: Push[] = [];

function createApp() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const opsApi = require('../routes/ops').default;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cookieParser = require('cookie-parser');
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use((req: any, _res: any, next: any) => {
    req.session = { id: ADMIN_TEST_SESSION_ID, username: 'will', isAdmin: true };
    next();
  });
  app.use('/api/v1/ops', opsApi);
  app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ ok: false, error: String(err?.message ?? err) }));
  return app;
}

const app = createApp();
const admin = (method: string, url: string, body?: unknown) =>
  inject(app, { method, url: `/api/v1/ops${url}`, headers: csrfHeaders(), body });
const ok = (res: { statusCode: number; body: any }, status = 200) => {
  assert.equal(res.statusCode, status, JSON.stringify(res.body).slice(0, 800));
  return res.body.data;
};

const today: string = londonDateKey(new Date());
const daysFromToday = (n: number): string => addDays(today, n);

test.before(() => {
  setWorkerPushSender(async (userId: string, title: string, body: string, data: Record<string, unknown>) => {
    pushes.push({ userId, title, body, data });
  });
});

test.beforeEach(async () => {
  await resetDatabase();
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "DocumentLink", "ClientDocument", "WorkerDocument", "DocumentTemplate", "OpsSetting", "AuditLog", "OpsScheduleItem", "OpsBookingCost", "OpsBookingSeries", "OpsBooking", "OpsRequirement", "WorkerProfile", "RightToWorkCheck", "PushToken" RESTART IDENTITY CASCADE');
  pushes = [];
});

test.after(async () => {
  setWorkerPushSender(null);
  await disconnect();
});

let n = 0;
/** Ready for Work, agreed by admin; with the app on a phone unless told otherwise. */
async function readyWorker(first: string, opts: { app?: boolean } = {}) {
  n += 1;
  const w = ok(await admin('POST', '/workers', { firstName: first, lastName: 'Test', email: `${first.toLowerCase()}${n}@example.com`, phone: '07700900000' }), 201);
  if (opts.app !== false) await prisma.pushToken.create({ data: { token: `ExponentPushToken[${first}${n}]`, platform: 'ios', userId: w.id } });
  ok(await admin('POST', `/workers/${w.id}/rtw-checks`, {
    method: 'SHARE_CODE', performedOn: daysFromToday(-30), performedBy: 'Will', outcome: 'PASS', prescribedCheckConfirmed: true,
    validUntil: daysFromToday(200), followUpDue: daysFromToday(170), evidenceReference: 'Profile PDF in RTW folder',
  }), 201);
  ok(await admin('PATCH', `/workers/${w.id}`, { emergencyContactName: 'Sam', emergencyContactPhone: '07700900001', payrollStatus: 'ACTIVE', roles: ['Bar staff'] }));
  ok(await admin('POST', `/workers/${w.id}/documents/pack`, {}), 201);
  const agreement = await prisma.workerDocument.findFirstOrThrow({ where: { userId: w.id, type: 'ZERO_HOURS_AGREEMENT', status: 'ISSUED' } });
  ok(await admin('POST', `/documents/${agreement.id}/accept`, { acceptedName: `${first} Test`, method: 'Signed copy emailed back' }));
  return w;
}

async function booking(inDays: number, quantity = 1) {
  n += 1;
  const c = ok(await admin('POST', '/clients', { companyName: 'Acme Events Ltd', contactName: 'Jo Bloggs', email: `client${n}@example.com`, clientType: 'BUSINESS_HIRER' }), 201);
  ok(await admin('POST', '/commercial-terms/review', { confirm: true }));
  const issued = ok(await admin('POST', `/clients/${c.id}/terms/issue`, {}), 201);
  ok(await admin('POST', `/client-terms/${issued.document.id}/accept`, {
    legalBusinessName: 'Acme Events Ltd', acceptedByName: 'Jo Bloggs', typedName: 'Jo Bloggs', method: 'Signed PDF by email', authorityConfirmed: true,
  }));
  return ok(await admin('POST', '/bookings', {
    clientId: c.id, status: 'CONFIRMED', eventType: 'Summer party', venue: 'The Hall', address: '1 Hall St, London',
    eventDate: daysFromToday(inDays), startTime: '18:00', expectedFinish: '23:00',
    requirement: { role: 'Bar staff', quantity, clientChargeRate: 22, workerPayRate: 14 },
  }), 201);
}

const offer = async (b: any, workerId: string, status = 'PENDING') =>
  ok(await admin('POST', `/bookings/${b.id}/assignments`, { requirementId: b.requirements[0].id, workerId, status }), 201);

test('documents issued: the worker is told they are waiting', async () => {
  n += 1;
  const w = ok(await admin('POST', '/workers', { firstName: 'Dee', lastName: 'Test', email: `dee${n}@example.com`, phone: '07700900000' }), 201);
  await prisma.pushToken.create({ data: { token: 'ExponentPushToken[dee]', platform: 'android', userId: w.id } });
  const pack = ok(await admin('POST', `/workers/${w.id}/documents/pack`, {}), 201);
  assert.deepEqual(pack.notified, { hasApp: true });
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].userId, w.id);
  assert.equal(pushes[0].data.type, 'documents');

  // Nothing new to issue: nothing sent.
  pushes = [];
  const again = ok(await admin('POST', `/workers/${w.id}/documents/pack`, {}), 201);
  assert.equal(again.notified, null);
  assert.equal(pushes.length, 0);
});

test('an offer, then the office books it, moves it, and cancels it', async () => {
  const ana = await readyWorker('Ana');
  const b = await booking(4);
  pushes = [];

  const offered = await offer(b, ana.id);
  assert.deepEqual(offered.notified, { hasApp: true });
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].title, 'New shift offer');
  assert.deepEqual(pushes[0].data, { type: 'shift_request', bookingId: offered.assignmentId, notice: 'offered' });
  assert.match(pushes[0].body, /^Bar staff, \w{3} \d{1,2} \w{3} 18:00–23:00 at The Hall\. Tap to accept or decline\.$/);

  // She said yes on the phone; the office records it.
  pushes = [];
  const booked = ok(await admin('PATCH', `/assignments/${offered.assignmentId}`, { status: 'CONFIRMED' }));
  assert.deepEqual(booked.notified, { hasApp: true });
  assert.equal(pushes[0].title, 'You are booked');

  // The booking moves to a later start.
  pushes = [];
  ok(await admin('PATCH', `/bookings/${b.id}`, { startTime: '19:00' }));
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].title, 'Your shift has changed');
  assert.match(pushes[0].body, /19:00–23:00/);

  // Saving it unchanged tells nobody anything.
  pushes = [];
  ok(await admin('PATCH', `/bookings/${b.id}`, { startTime: '19:00' }));
  assert.equal(pushes.length, 0);

  // Cancelled.
  ok(await admin('PATCH', `/bookings/${b.id}`, { status: 'CANCELLED' }));
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].title, 'Shift cancelled');
  assert.match(pushes[0].body, /no longer going ahead/);
});

test('replacing a worker tells both; a recorded no tells nobody', async () => {
  const ana = await readyWorker('Ana');
  const ben = await readyWorker('Ben');
  const b = await booking(6);
  const first = await offer(b, ana.id);
  pushes = [];

  const replaced = ok(await admin('POST', `/assignments/${first.assignmentId}/replace`, { workerId: ben.id, reason: 'Ana is unwell' }));
  assert.deepEqual(replaced.notified, { hasApp: true });
  assert.deepEqual(pushes.map((p) => [p.userId, p.title]), [[ana.id, 'Shift cancelled'], [ben.id, 'New shift offer']]);

  // Ben says no by text; the office records it. He knows already.
  pushes = [];
  const bens = await prisma.booking.findFirstOrThrow({ where: { opsBookingId: b.id, staffId: ben.id } });
  const declined = ok(await admin('PATCH', `/assignments/${bens.id}`, { status: 'REJECTED' }));
  assert.equal(declined.notified, null);
  assert.equal(pushes.length, 0);
});

test('no app, or a shift in the past: nothing sent, and Ops is told', async () => {
  const cat = await readyWorker('Cat', { app: false });
  const ana = await readyWorker('Ana');
  pushes = [];

  const toCat = await offer(await booking(3), cat.id);
  assert.deepEqual(toCat.notified, { hasApp: false });
  assert.equal(pushes.length, 0);

  // A shift two days ago, entered after the event: Ana has the app, but there is nothing to tell her.
  const past = await offer(await booking(-2), ana.id, 'CONFIRMED');
  assert.deepEqual(past.notified, { hasApp: true });
  assert.equal(pushes.length, 0);
});
