/**
 * The staff-area upgrades of November 2026, against a real database: login by
 * email link, "keep me logged in", signing out other devices, running late,
 * the calendar file, earnings, and the day-before reminder.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

import { prisma, resetDatabase, disconnect, inject, createClient, createWorker, createBooking } from './helpers';
import { sendDueShiftReminders, tomorrowInLondon } from '../ops/shiftReminders';

const onError = (err: any, _req: any, res: any, _next: any) => res.status(500).json({ ok: false, error: String(err?.message ?? err) });

function createUserApp() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const session = require('express-session');
  const app = express();
  app.use(express.json());
  app.use(session({ name: 'vergo.sid', secret: 'staff-upgrades-test', resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'strict' } }));
  app.use('/api/v1/user/shifts', require('../routes/mobileShifts').default);
  app.use('/api/v1/user', require('../routes/userAuth').default);
  // As index.ts does: an address with no route is a 404, not a hang.
  app.use((_req: any, res: any) => res.status(404).json({ ok: false, error: 'Not found' }));
  app.use(onError);
  return app;
}

const app = createUserApp();
const call = (method: string, url: string, body?: unknown, cookie?: string) =>
  inject(app, { method, url, headers: cookie ? { cookie } : {}, body });

function cookieOf(res: { headers: Record<string, unknown> }): { pair: string; raw: string } {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  const found = list.find((c: string) => c.startsWith('vergo.sid='));
  assert.ok(found, 'sets the vergo.sid cookie');
  return { pair: found!.split(';')[0], raw: found! };
}

const sha = (t: string) => `sha256:${crypto.createHash('sha256').update(t).digest('hex')}`;

async function verifiedWorker(overrides: Record<string, unknown> = {}) {
  return createWorker({ emailVerified: true, passwordHash: await bcrypt.hash('CorrectHorse9!', 4), ...overrides });
}

function day(offset: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
}

test.beforeEach(async () => { await resetDatabase(); });
test.after(async () => { await disconnect(); });

test('login link: asked for, used once, and gone', async () => {
  const worker = await verifiedWorker();
  const asked = await call('POST', '/api/v1/user/login-link', { email: worker.email });
  assert.equal(asked.statusCode, 200);
  const stored = await prisma.user.findUniqueOrThrow({ where: { id: worker.id } });
  assert.match(String(stored.loginLinkHash), /^sha256:/, 'only a hash is stored');
  assert.ok(stored.loginLinkExp && stored.loginLinkExp.getTime() > Date.now());

  // The same answer for an address with no account.
  const nobody = await call('POST', '/api/v1/user/login-link', { email: 'nobody@example.com' });
  assert.equal(nobody.statusCode, 200);
  assert.equal(nobody.body.message, asked.body.message);

  // Put a known token in place of the emailed one, and use it.
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.user.update({ where: { id: worker.id }, data: { loginLinkHash: sha(token) } });
  const used = await call('POST', '/api/v1/user/login-link/verify', { token, remember: true });
  assert.equal(used.statusCode, 200);
  const cookie = cookieOf(used);
  assert.match(cookie.raw, /Expires=/i, 'remember me gives a lasting cookie');

  const session = await call('GET', '/api/v1/user/session', undefined, cookie.pair);
  assert.equal(session.body.authenticated, true);

  const again = await call('POST', '/api/v1/user/login-link/verify', { token });
  assert.equal(again.statusCode, 400, 'a link works once');
  assert.equal(again.body.code, 'LINK_EXPIRED');
});

test('login link: an expired link does not sign in', async () => {
  const worker = await verifiedWorker();
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.user.update({ where: { id: worker.id }, data: { loginLinkHash: sha(token), loginLinkExp: new Date(Date.now() - 1000) } });
  const res = await call('POST', '/api/v1/user/login-link/verify', { token });
  assert.equal(res.statusCode, 400);
});

test('keep me logged in: unticked, the cookie ends with the browser session', async () => {
  const worker = await verifiedWorker();
  const res = await call('POST', '/api/v1/user/login', { email: worker.email, password: 'CorrectHorse9!' });
  assert.equal(res.statusCode, 200);
  assert.doesNotMatch(cookieOf(res).raw, /Expires=/i);
  const kept = await call('POST', '/api/v1/user/login', { email: worker.email, password: 'CorrectHorse9!', remember: true });
  const exp = /Expires=([^;]+)/i.exec(cookieOf(kept).raw);
  assert.ok(exp, 'remembered login sets an expiry');
  const days = (new Date(exp![1]).getTime() - Date.now()) / 86400000;
  assert.ok(days > 29 && days < 31, `about 30 days, got ${days}`);
});

test('sign out my other devices keeps this one', async () => {
  const worker = await verifiedWorker();
  const login = () => call('POST', '/api/v1/user/login', { email: worker.email, password: 'CorrectHorse9!' }).then(cookieOf);
  const phone = await login();
  const laptop = await login();
  const res = await call('POST', '/api/v1/user/sessions/sign-out-others', {}, laptop.pair);
  assert.equal(res.statusCode, 200);
  assert.equal((await call('GET', '/api/v1/user/profile', undefined, laptop.pair)).statusCode, 200, 'this device stays in');
  assert.equal((await call('GET', '/api/v1/user/profile', undefined, phone.pair)).statusCode, 401, 'the other is out');
});

test('running late, can\'t make it, calendar and earnings on a worker\'s shifts', async () => {
  const worker = await verifiedWorker();
  const client = await createClient();
  const cookie = cookieOf(await call('POST', '/api/v1/user/login', { email: worker.email, password: 'CorrectHorse9!' })).pair;
  const today = await createBooking({ clientId: client.id, staffId: worker.id, eventDate: day(0), status: 'CONFIRMED', staffPayRate: 15 });
  const later = await createBooking({ clientId: client.id, staffId: worker.id, eventDate: day(9), status: 'CONFIRMED', staffPayRate: 15 });
  await createBooking({ clientId: client.id, staffId: worker.id, eventDate: day(-3), status: 'COMPLETED', staffPayRate: 15 });

  const late = await call('POST', `/api/v1/user/shifts/${today.id}/running-late`, { minutes: 20, note: 'Train' }, cookie);
  assert.equal(late.statusCode, 200);
  const tooEarly = await call('POST', `/api/v1/user/shifts/${later.id}/running-late`, { minutes: 20 }, cookie);
  assert.equal(tooEarly.statusCode, 409, 'only on the day');

  const ics = await call('GET', `/api/v1/user/shifts/${later.id}/calendar.ics`, undefined, cookie);
  assert.equal(ics.statusCode, 200);
  assert.match(String(ics.headers['content-type']), /text\/calendar/);

  // A confirmed shift is never given up online: they text or call the office.
  const cant = await call('POST', `/api/v1/user/shifts/${later.id}/cant-make-it`, { reason: 'Family emergency' }, cookie);
  assert.equal(cant.statusCode, 404);
  assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: later.id } })).status, 'CONFIRMED');

  const earn = await call('GET', '/api/v1/user/shifts/earnings', undefined, cookie);
  assert.equal(earn.statusCode, 200);
  const d = earn.body.data;
  assert.equal(d.taxYear.shifts, 1);
  assert.equal(d.taxYear.basicPence + d.taxYear.holidayPence, d.taxYear.payPence);
  assert.equal(d.upcoming.shifts, 2, "today's and next week's confirmed shifts are both ahead");
});

test('day-before reminder: claimed once, never twice', async () => {
  const worker = await verifiedWorker();
  const client = await createClient();
  const tomorrow = new Date(`${tomorrowInLondon(new Date())}T00:00:00Z`);
  const shift = await createBooking({ clientId: client.id, staffId: worker.id, eventDate: tomorrow, status: 'CONFIRMED' });
  const offer = await createBooking({ clientId: client.id, staffId: worker.id, eventDate: tomorrow, status: 'PENDING' });

  // 11:00 London today.
  const eleven = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date())}T11:00:00Z`);
  await sendDueShiftReminders(eleven);
  const first = await prisma.booking.findUniqueOrThrow({ where: { id: shift.id } });
  assert.ok(first.reminderSentAt, 'the confirmed shift is claimed');
  assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: offer.id } })).reminderSentAt, null, 'an unanswered offer is not reminded');

  await sendDueShiftReminders(eleven);
  const second = await prisma.booking.findUniqueOrThrow({ where: { id: shift.id } });
  assert.equal(second.reminderSentAt?.getTime(), first.reminderSentAt?.getTime(), 'not sent again');
});

test('timesheet: agree the hours once, or query them; the bell counts what is waiting', async () => {
  const worker = await verifiedWorker();
  const client = await createClient();
  const cookie = cookieOf(await call('POST', '/api/v1/user/login', { email: worker.email, password: 'CorrectHorse9!' })).pair;
  const worked = await createBooking({ clientId: client.id, staffId: worker.id, eventDate: day(-2), status: 'COMPLETED' });
  const queried = await createBooking({ clientId: client.id, staffId: worker.id, eventDate: day(-3), status: 'COMPLETED' });
  const ahead = await createBooking({ clientId: client.id, staffId: worker.id, eventDate: day(4), status: 'CONFIRMED' });
  await createBooking({ clientId: client.id, staffId: worker.id, eventDate: day(1), status: 'PENDING' });

  const bell = await call('GET', '/api/v1/user/shifts/attention', undefined, cookie);
  assert.equal(bell.statusCode, 200);
  const kinds = bell.body.data.items.map((i: any) => i.kind).sort();
  assert.deepEqual(kinds, ['offer', 'timesheet']);
  assert.match(bell.body.data.items.find((i: any) => i.kind === 'timesheet').text, /2 shifts/);

  assert.equal((await call('POST', `/api/v1/user/shifts/${ahead.id}/timesheet`, { agree: true }, cookie)).statusCode, 409, 'not before it happens');
  assert.equal((await call('POST', `/api/v1/user/shifts/${worked.id}/timesheet`, { agree: true }, cookie)).statusCode, 200);
  assert.equal((await call('POST', `/api/v1/user/shifts/${worked.id}/timesheet`, { agree: true }, cookie)).statusCode, 409, 'once only');
  assert.equal((await call('POST', `/api/v1/user/shifts/${queried.id}/timesheet`, { agree: false }, cookie)).statusCode, 400, 'a query needs a note');
  assert.equal((await call('POST', `/api/v1/user/shifts/${queried.id}/timesheet`, { agree: false, note: 'Finished at 00:30' }, cookie)).statusCode, 200);

  const a = await prisma.booking.findUniqueOrThrow({ where: { id: worked.id } });
  const q = await prisma.booking.findUniqueOrThrow({ where: { id: queried.id } });
  assert.ok(a.timesheetConfirmedAt);
  assert.equal(q.timesheetQuery, 'Finished at 00:30');

  const after = await call('GET', '/api/v1/user/shifts/attention', undefined, cookie);
  assert.deepEqual(after.body.data.items.map((i: any) => i.kind), ['offer'], 'nothing left to confirm');
});

test('early pay and swap requests reach the office and change nothing', async () => {
  const worker = await verifiedWorker();
  const client = await createClient();
  const cookie = cookieOf(await call('POST', '/api/v1/user/login', { email: worker.email, password: 'CorrectHorse9!' })).pair;

  assert.equal((await call('POST', '/api/v1/user/shifts/early-pay', {}, cookie)).statusCode, 409, 'nothing worked yet');
  await createBooking({ clientId: client.id, staffId: worker.id, eventDate: day(-2), status: 'COMPLETED', staffPayRate: 15 });
  const first = await call('POST', '/api/v1/user/shifts/early-pay', { note: 'Rent due' }, cookie);
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.data.shifts, 1);
  assert.ok(first.body.data.estimatePence > 0);
  assert.equal((await call('POST', '/api/v1/user/shifts/early-pay', {}, cookie)).statusCode, 409, 'not twice in three days');

  const shift = await createBooking({ clientId: client.id, staffId: worker.id, eventDate: day(6), status: 'CONFIRMED' });
  assert.equal((await call('POST', `/api/v1/user/shifts/${shift.id}/swap-request`, {}, cookie)).statusCode, 400, 'needs a reason');
  const swap = await call('POST', `/api/v1/user/shifts/${shift.id}/swap-request`, { reason: 'Exam that day', colleague: 'Jo' }, cookie);
  assert.equal(swap.statusCode, 200);
  assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: shift.id } })).status, 'CONFIRMED', 'still booked until the office agrees');
});

test('selected staff only: the office picks who sees a job; nobody else can see, open or apply', async () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { ADMIN_TEST_SESSION_ID } = require('../testing/csrf');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { csrfHeaders } = require('./helpers');
  const adminApp = express();
  adminApp.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  adminApp.use(require('cookie-parser')());
  adminApp.use((req: any, _res: any, next: any) => { req.session = { id: ADMIN_TEST_SESSION_ID, username: 'will', isAdmin: true, adminLastActivity: Date.now(), adminLoginTime: Date.now() }; next(); });
  adminApp.use('/api/v1/admin/matching', require('../routes/adminMatching').default);
  adminApp.use(onError);
  const admin = (method: string, url: string, body?: unknown) => inject(adminApp, { method, url: `/api/v1/admin/matching${url}`, headers: { ...csrfHeaders() }, body });

  const role = await prisma.role.create({ data: { name: `Bar ${Date.now()}` } });
  const job = await prisma.job.create({ data: { title: 'Gala bar', description: 'x', location: 'London', roleId: role.id, status: 'OPEN', eventDate: day(5) } });
  const picked = await verifiedWorker();
  const other = await verifiedWorker();
  await prisma.workerProfile.create({ data: { userId: picked.id, roles: ['Bartender'] } });
  await prisma.workerProfile.create({ data: { userId: other.id, roles: ['Chef'] } });

  const list = await admin('GET', `/${job.id}/audience?role=Bartender`);
  assert.equal(list.statusCode, 200, JSON.stringify(list.body));
  assert.deepEqual(list.body.data.staff.map((s: any) => s.id), [picked.id], 'the role filter narrows the list');

  const set = await admin('PUT', `/${job.id}/audience`, { inviteOnly: true, userIds: [picked.id], notify: false });
  assert.equal(set.statusCode, 200, JSON.stringify(set.body));
  assert.equal(set.body.data.added, 1);

  // The website job board, on each worker's session.
  const boardApp = express();
  boardApp.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const session = require('express-session');
  const store = new session.MemoryStore();
  boardApp.use(session({ name: 'vergo.sid', secret: 'staff-upgrades-test', resave: false, saveUninitialized: false, store }));
  boardApp.use('/api/v1/jobs', require('../routes/jobs').default);
  boardApp.use('/api/v1/job-applications', require('../routes/jobApplications').default);
  boardApp.use('/api/v1/user', require('../routes/userAuth').default);
  boardApp.use(onError);
  const asBoard = async (w: any) => {
    const c = cookieOf(await inject(boardApp, { method: 'POST', url: '/api/v1/user/login', body: { email: w.email, password: 'CorrectHorse9!' } })).pair;
    return (method: string, url: string, body?: unknown) => inject(boardApp, { method, url, headers: { cookie: c }, body });
  };
  const mine = await asBoard(picked);
  const theirs = await asBoard(other);
  const ids = (r: any) => ((r.body.data && r.body.data.jobs) || r.body.jobs || []).map((j: any) => j.id);

  assert.ok(ids(await mine('GET', '/api/v1/jobs?limit=50')).includes(job.id), 'the picked worker sees it');
  assert.ok(!ids(await theirs('GET', '/api/v1/jobs?limit=50')).includes(job.id), 'nobody else does');
  assert.ok(!ids(await inject(boardApp, { method: 'GET', url: '/api/v1/jobs?limit=50' })).includes(job.id), 'nor the public');
  assert.equal((await theirs('GET', `/api/v1/jobs/${job.id}`)).statusCode, 404, 'nor can they open it');
  assert.equal((await theirs('POST', '/api/v1/job-applications', { jobId: job.id })).statusCode, 404, 'nor apply');

  // Back to everyone.
  const open = await admin('PUT', `/${job.id}/audience`, { inviteOnly: false, userIds: [picked.id] });
  assert.equal(open.statusCode, 200);
  assert.ok(ids(await theirs('GET', '/api/v1/jobs?limit=50')).includes(job.id), 'now everyone sees it');
});
