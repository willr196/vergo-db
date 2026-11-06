/**
 * Staff logins on the website, against a real database: Ops invites a worker,
 * the worker chooses a password through the one-time link, signs in with a
 * session cookie, and keeps their own details up to date.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import bcrypt from 'bcrypt';

import { prisma, resetDatabase, disconnect, csrfHeaders, inject } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ADMIN_TEST_SESSION_ID } = require('../testing/csrf');

const onError = (err: any, _req: any, res: any, _next: any) => res.status(500).json({ ok: false, error: String(err?.message ?? err) });

/** Ops, with the admin session supplied directly (as the other Ops tests do). */
function createAdminApp() {
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
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  app.use('/api/v1/applications', require('../routes/applications').default);
  app.use(onError);
  return app;
}

/** The worker's side: real sessions and the site's vergo.sid cookie, in memory. */
function createUserApp() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const userAuth = require('../routes/userAuth').default;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const session = require('express-session');
  const app = express();
  app.use(express.json());
  app.use(session({ name: 'vergo.sid', secret: 'staff-login-test-secret', resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'strict' } }));
  // Mounted as index.ts mounts them: the staff routes ahead of the user router.
  app.use('/api/v1/user/shifts', require('../routes/mobileShifts').default);
  app.use('/api/v1/user/documents', require('../routes/mobileDocuments').default);
  app.use('/api/v1/user/readiness', require('../routes/staffReadiness').default);
  app.use('/api/v1/user', userAuth);
  app.use('/api/v1/web', require('../routes/webAuth').default);
  app.use(onError);
  return app;
}

/** Any URL on the worker's side, on their session cookie. */
const asWorker = (method: string, url: string, body: unknown, cookie: string) =>
  inject(userApp, { method, url, headers: { cookie }, body });

const adminApp = createAdminApp();
const userApp = createUserApp();
const admin = (method: string, url: string, body?: unknown) =>
  inject(adminApp, { method, url: `/api/v1/ops${url}`, headers: { ...csrfHeaders() }, body });
const asUser = (method: string, url: string, body?: unknown, cookie?: string) =>
  inject(userApp, { method, url: `/api/v1/user${url}`, headers: cookie ? { cookie } : {}, body });

function sessionCookie(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  const found = list.find((c: string) => c.startsWith('vergo.sid='));
  assert.ok(found, 'login sets the vergo.sid cookie');
  return found!.split(';')[0];
}

function tokenFrom(path: string): string {
  const token = new URL(path, 'http://x').searchParams.get('token');
  assert.ok(token && /^[a-f0-9]{64}$/.test(token), 'the link carries a 64-character token');
  return token!;
}

test.before(async () => { await resetDatabase(); });
test.after(async () => { await disconnect(); });

test('an Ops worker is invited, sets a password, signs in and updates their own details', async () => {
  const created = await admin('POST', '/workers', { email: 'sam.staff@example.com', firstName: 'Sam', lastName: 'Staff' });
  assert.equal(created.statusCode, 201, created.raw);
  const workerId = created.body.data.id;

  // Added in Ops, nobody knows the password: no way in yet.
  const before = await asUser('POST', '/login', { email: 'sam.staff@example.com', password: 'anything-at-all' });
  assert.equal(before.statusCode, 401);

  // No email key in tests, so the invite hands back the link to pass on.
  const first = await admin('POST', `/workers/${workerId}/login-invite`);
  assert.equal(first.statusCode, 200, first.raw);
  assert.equal(first.body.data.emailSent, false);
  assert.match(first.body.data.path, /^\/staff\/set-password\?token=[a-f0-9]{64}&invite=1$/);
  const staleToken = tokenFrom(first.body.data.path);

  // Sending again replaces the link: only the newest one works.
  const second = await admin('POST', `/workers/${workerId}/login-invite`);
  const token = tokenFrom(second.body.data.path);
  assert.notEqual(token, staleToken);
  const stale = await asUser('POST', '/reset-password', { token: staleToken, password: 'Chosen-Pass-1' });
  assert.equal(stale.statusCode, 400);

  const audit = await prisma.auditLog.findMany({ where: { entityId: workerId, action: 'STAFF_LOGIN_INVITE_SENT' } });
  assert.equal(audit.length, 2, 'each invite is in the audit log');

  const set = await asUser('POST', '/reset-password', { token, password: 'Chosen-Pass-1' });
  assert.equal(set.statusCode, 200, set.raw);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: workerId } });
  assert.equal(user.emailVerified, true, 'using the emailed link proves the address');
  assert.equal(user.resetToken, null);

  const reused = await asUser('POST', '/reset-password', { token, password: 'Another-Pass-2' });
  assert.equal(reused.statusCode, 400, 'the link works once');

  const login = await asUser('POST', '/login', { email: 'sam.staff@example.com', password: 'Chosen-Pass-1' });
  assert.equal(login.statusCode, 200, login.raw);
  const cookie = sessionCookie(login);

  const profile = await asUser('GET', '/profile', undefined, cookie);
  assert.equal(profile.statusCode, 200);
  assert.equal(profile.body.data.isStaff, true);
  assert.equal(profile.body.data.email, 'sam.staff@example.com');
  assert.deepEqual(profile.body.data.roles, [], 'no roles on record and no application yet');
  assert.ok(profile.body.data.roleOptions.includes('Waiting staff'));

  // Ops gave them a role the website doesn't offer; it must survive their edits.
  await prisma.workerProfile.update({ where: { userId: workerId }, data: { roles: ['Waiting staff', 'Supervisor'] } });

  const saved = await asUser('PUT', '/profile', {
    phone: '07700900456', postcode: 'E1 6AN', roles: ['Runners', 'Bar staff'],
    emergencyContactName: 'Jo Staff', emergencyContactPhone: '07700900789',
  }, cookie);
  assert.equal(saved.statusCode, 200, saved.raw);
  assert.equal(saved.body.data.emergencyContactName, 'Jo Staff');
  assert.deepEqual(saved.body.data.roles, ['Bar staff', 'Runners', 'Supervisor'], 'ticked roles in page order, Ops-only roles kept');

  const notARole = await asUser('PUT', '/profile', { roles: ['Astronaut'] }, cookie);
  assert.equal(notARole.statusCode, 400);

  // What they saved is what Ops sees.
  const inOps = await admin('GET', `/workers/${workerId}`);
  assert.deepEqual(inOps.body.data.roles, ['Bar staff', 'Runners', 'Supervisor']);
  assert.equal(inOps.body.data.emergencyContactName, 'Jo Staff');
  assert.equal(inOps.body.data.emergencyContactPhone, '07700900789');
  assert.equal(inOps.body.data.phone, '07700900456');

  const changed = await asUser('PUT', '/change-password', { currentPassword: 'Chosen-Pass-1', newPassword: 'Newer-Pass-3' }, cookie);
  assert.equal(changed.statusCode, 200, changed.raw);

  const out = await asUser('POST', '/logout', undefined, cookie);
  assert.equal(out.statusCode, 200);
  const after = await asUser('GET', '/profile', undefined, cookie);
  assert.equal(after.statusCode, 401, 'logged out means logged out');
});

test('someone with a login but no staff record cannot make themselves staff through their profile', async () => {

  const user = await prisma.user.create({
    data: {
      email: 'app.only@example.com', firstName: 'App', lastName: 'Only', userType: 'JOB_SEEKER',
      passwordHash: await bcrypt.hash('App-Only-Pass-1', 4), emailVerified: true,
    },
  });
  const login = await asUser('POST', '/login', { email: 'app.only@example.com', password: 'App-Only-Pass-1' });
  assert.equal(login.statusCode, 200, login.raw);
  const cookie = sessionCookie(login);

  const saved = await asUser('PUT', '/profile', { emergencyContactName: 'Someone', emergencyContactPhone: '07700900000' }, cookie);
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.body.data.isStaff, false);
  assert.equal(await prisma.workerProfile.count({ where: { userId: user.id } }), 0, 'no WorkerProfile, so not on the Ops staff list');
});

test('an invite needs a worker that exists', async () => {
  const missing = await admin('POST', '/workers/not-a-worker/login-invite');
  assert.equal(missing.statusCode, 404);
});

test('a hired applicant sent their roster login lands on the Ops staff list with the roles they applied for', async () => {
  // Applicants survive resetDatabase, so a fixed address would collide with an earlier run.
  const ROWAN = `rowan.hired.${Date.now()}@example.com`;
  const waiting = await prisma.role.upsert({ where: { name: 'Waiting staff' }, create: { name: 'Waiting staff' }, update: {} });
  const bar = await prisma.role.upsert({ where: { name: 'Bar staff' }, create: { name: 'Bar staff' }, update: {} });
  // What the apply form collects.
  const applicant = await prisma.applicant.create({
    data: {
      firstName: 'Rowan', lastName: 'Hired', email: ROWAN, phone: '07700900111',
      postcode: 'N1 9GU', availability: 'Weekends and weekday evenings', bio: 'Two years in a hotel bar.',
    },
  });
  const application = await prisma.application.create({
    data: {
      applicantId: applicant.id, cvKey: 'none', status: 'HIRED',
      roles: { create: [{ roleId: waiting.id, experienceLevel: 'Entry level' }, { roleId: bar.id, experienceLevel: '1-2 years' }] },
    },
  });

  // No email key in tests: the account and link are made, the send fails.
  const res = await inject(adminApp, { method: 'POST', url: `/api/v1/applications/${application.id}/roster-approval-email`, headers: { ...csrfHeaders() } });
  assert.equal(res.statusCode, 502, res.raw);

  const user = await prisma.user.findUniqueOrThrow({ where: { email: ROWAN }, include: { workerProfile: true } });
  assert.ok(user.workerProfile, 'a staff record was made');
  assert.deepEqual([...user.workerProfile!.roles].sort(), ['Bar staff', 'Waiting staff']);
  assert.ok(user.resetToken && user.resetTokenExp && user.resetTokenExp > new Date(Date.now() + 6 * 86400000), 'a 7-day set-password link is live');

  const workers = await admin('GET', '/workers?search=rowan');
  assert.equal(workers.statusCode, 200, workers.raw);
  assert.ok(JSON.stringify(workers.body.data).includes(ROWAN), 'they appear in Ops > Workers');
  assert.equal(user.workerProfile!.availabilityNotes, 'Weekends and weekday evenings', 'Ops sees their availability straight away');

  // First sign-in (password set directly; the link flow has its own test above).
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash('Rowan-Pass-1', 4), mustChangePassword: false, resetToken: null, resetTokenExp: null } });
  const login = await asUser('POST', '/login', { email: ROWAN, password: 'Rowan-Pass-1' });
  assert.equal(login.statusCode, 200, login.raw);
  const cookie = sessionCookie(login);

  // Profile setup starts from everything they gave on the application, with no photo yet.
  const setup = await asUser('GET', '/profile', undefined, cookie);
  const p = setup.body.data;
  assert.equal(p.isStaff, true);
  assert.equal(p.profileImage, null, 'no photo yet, so the page is in setup mode');
  assert.equal(p.firstName, 'Rowan');
  assert.equal(p.phone, '07700900111');
  assert.equal(p.postcode, 'N1 9GU');
  assert.equal(p.experienceSummary, 'Two years in a hotel bar.');
  assert.equal(p.availability, 'Weekends and weekday evenings');
  assert.deepEqual([...p.roles].sort(), ['Bar staff', 'Waiting staff']);
  assert.deepEqual(p.roleExperience, { 'Waiting staff': 'Entry level', 'Bar staff': '1-2 years' });

  // Changing their availability updates what Ops sees.
  const saved = await asUser('PUT', '/profile', { availability: 'Weekends only' }, cookie);
  assert.equal(saved.statusCode, 200, saved.raw);
  assert.equal(saved.body.data.availability, 'Weekends only');
  assert.equal((await prisma.workerProfile.findUniqueOrThrow({ where: { userId: user.id } })).availabilityNotes, 'Weekends only');

  // Sending it again leaves their staff record alone.
  await prisma.workerProfile.update({ where: { userId: user.id }, data: { roles: ['Supervisor'] } });
  await inject(adminApp, { method: 'POST', url: `/api/v1/applications/${application.id}/roster-approval-email`, headers: { ...csrfHeaders() } });
  const again = await prisma.workerProfile.findUniqueOrThrow({ where: { userId: user.id } });
  assert.deepEqual(again.roles, ['Supervisor']);
});

test('a worker gets ready to work on the website: checklist, documents agreed and recorded as on the website, availability', async () => {
  const daysFromToday = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const created = await admin('POST', '/workers', { email: 'ready.worker@example.com', firstName: 'Remy', lastName: 'Ready', phone: '07700900555' });
  assert.equal(created.statusCode, 201, created.raw);
  const workerId = created.body.data.id;
  const rtw = await admin('POST', `/workers/${workerId}/rtw-checks`, {
    method: 'SHARE_CODE', performedOn: daysFromToday(-10), performedBy: 'Will', outcome: 'PASS', prescribedCheckConfirmed: true,
    validUntil: daysFromToday(300), followUpDue: daysFromToday(270), evidenceReference: 'Share code PDF',
  });
  assert.equal(rtw.statusCode, 201, rtw.raw);
  assert.equal((await admin('PATCH', `/workers/${workerId}`, { emergencyContactName: 'Sam', emergencyContactPhone: '07700900556', payrollStatus: 'ACTIVE' })).statusCode, 200);
  const pack = await admin('POST', `/workers/${workerId}/documents/pack`, {});
  assert.equal(pack.statusCode, 201, pack.raw);

  await prisma.user.update({ where: { id: workerId }, data: { passwordHash: await bcrypt.hash('Remy-Pass-1', 4), emailVerified: true } });
  const login = await asUser('POST', '/login', { email: 'ready.worker@example.com', password: 'Remy-Pass-1' });
  assert.equal(login.statusCode, 200, login.raw);
  const cookie = sessionCookie(login);

  // Before: photo and both documents are theirs to do; right to work and payroll are done.
  const before = await asWorker('GET', '/api/v1/user/readiness', undefined, cookie);
  assert.equal(before.statusCode, 200, before.raw);
  const state = (body: any) => Object.fromEntries(body.data.steps.map((s: any) => [s.key, s.state]));
  assert.equal(before.body.data.ready, false);
  assert.deepEqual(state(before.body), { photo: 'todo', phone: 'done', emergency: 'done', kid: 'todo', agreement: 'todo', rtw: 'done', payroll: 'done' });

  const photo = 'data:image/jpeg;base64,' + Buffer.from('stand-in photo').toString('base64');
  assert.equal((await asWorker('POST', '/api/v1/user/profile/avatar', { dataUrl: photo }, cookie)).statusCode, 200);

  const docs = await asWorker('GET', '/api/v1/user/documents', undefined, cookie);
  assert.equal(docs.statusCode, 200, docs.raw);
  const { kid, agreement } = docs.body.data;
  const tooEarly = await asWorker('POST', `/api/v1/user/documents/agreement/${agreement.id}/accept`, { agree: true, typedName: 'Remy Ready' }, cookie);
  assert.equal(tooEarly.statusCode, 409, 'the KID is confirmed first');
  assert.equal((await asWorker('POST', `/api/v1/user/documents/kid/${kid.id}/acknowledge`, { acknowledged: true }, cookie)).statusCode, 200);
  const signed = await asWorker('POST', `/api/v1/user/documents/agreement/${agreement.id}/accept`, { agree: true, typedName: 'Remy Ready' }, cookie);
  assert.equal(signed.statusCode, 200, signed.raw);

  // The record says where it happened.
  const doc = await prisma.workerDocument.findUniqueOrThrow({ where: { id: agreement.id } });
  assert.equal(doc.status, 'ACCEPTED');
  assert.equal(doc.acceptedName, 'Remy Ready');
  assert.match(String(doc.acceptanceMethod), /on the VERGO website/);
  const audit = await prisma.auditLog.findMany({ where: { actor: { contains: 'Remy Ready' } } });
  assert.ok(audit.length > 0 && audit.every((a) => a.actor.includes('(worker, on the website)')), 'audit rows name the website');

  const after = await asWorker('GET', '/api/v1/user/readiness', undefined, cookie);
  assert.equal(after.body.data.ready, true, 'the same answer Ops gives: ready to book');
  assert.ok(after.body.data.steps.every((s: any) => s.state === 'done'));
  assert.equal((await admin('GET', `/workers/${workerId}`)).body.data.readiness.ready, true);

  // Availability: the status switch and a run of dates, both seen by Ops.
  const status = await asWorker('PUT', '/api/v1/user/profile', { availabilityStatus: 'LIMITED' }, cookie);
  assert.equal(status.statusCode, 200, status.raw);
  assert.equal(status.body.data.availabilityStatus, 'LIMITED');
  const u = await prisma.user.findUniqueOrThrow({ where: { id: workerId } });
  assert.equal(u.availabilityStatus, 'LIMITED');
  assert.equal(u.staffAvailable, false, 'the old switch follows, as in the app');
  const added = await asWorker('POST', '/api/v1/web/worker/availability', { dateFrom: daysFromToday(20), dateTo: daysFromToday(23), notes: 'Evenings only' }, cookie);
  assert.equal(added.statusCode, 201, added.raw);
  const listed = await asWorker('GET', '/api/v1/web/worker/availability', undefined, cookie);
  assert.equal(listed.body.data.length, 1);
  const inOps = await admin('GET', `/workers/${workerId}`);
  assert.equal(inOps.body.data.availabilityStatus, 'LIMITED');
  assert.ok(JSON.stringify(inOps.body.data.availabilityWindows ?? inOps.body.data).includes(daysFromToday(20)), 'Ops sees the dates');

  // Signed out, none of it is reachable.
  for (const url of ['/api/v1/user/readiness', '/api/v1/user/documents', '/api/v1/web/worker/availability']) {
    assert.equal((await inject(userApp, { method: 'GET', url })).statusCode, 401, url);
  }
});
