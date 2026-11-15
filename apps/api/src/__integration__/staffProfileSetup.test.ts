/**
 * Staff profile setup (/staff/profile) against a real database: the cases
 * where a worker's first save could go wrong. Old role names, details Ops typed
 * in, photos that are not photos, and a worker Ops added by hand.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import bcrypt from 'bcrypt';

import { prisma, resetDatabase, disconnect, inject } from './helpers';

function createUserApp() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const userAuth = require('../routes/userAuth').default;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const session = require('express-session');
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(session({ name: 'vergo.sid', secret: 'profile-setup-test-secret', resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'strict' } }));
  app.use('/api/v1/user', userAuth);
  app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ ok: false, error: String(err?.message ?? err) }));
  return app;
}

const app = createUserApp();
const call = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  inject(app, { method, url, headers, body });

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

async function worker(email: string, extra: Record<string, unknown> = {}, roles: string[] = []) {
  return prisma.user.create({
    data: {
      email, firstName: 'Sam', lastName: 'Setup', userType: 'JOB_SEEKER', staffTier: 'STANDARD',
      passwordHash: await bcrypt.hash('Sam-Pass-123', 4), emailVerified: true,
      workerProfile: { create: { roles } },
      ...extra,
    },
  });
}

async function login(email: string): Promise<string> {
  const res = await call('POST', '/api/v1/user/login', { email, password: 'Sam-Pass-123' });
  assert.equal(res.statusCode, 200, res.raw);
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : [String(raw)];
  return list.find((c) => c.startsWith('vergo.sid='))!.split(';')[0];
}

/** What staff-account.js sends for a staff member pressing save unchanged. */
function pageSave(p: any, roles: string[]) {
  return {
    firstName: p.firstName, lastName: p.lastName, phone: p.phone, postcode: p.postcode,
    experienceSummary: p.experienceSummary, roles,
    emergencyContactName: p.emergencyContactName, emergencyContactPhone: p.emergencyContactPhone,
    availability: p.availability,
  };
}

test.before(async () => { await resetDatabase(); });
test.after(async () => { await disconnect(); });

test('old role names tick the right boxes, and unticking one really takes it away', async () => {
  // Hired before the apply form was reworded: "Bartender" on the staff record,
  // "Waiter" on the application, plus a role only Ops gives.
  const waiter = await prisma.role.upsert({ where: { name: 'Waiter' }, create: { name: 'Waiter' }, update: {} });
  const email = `legacy.roles.${Date.now()}@example.com`; // applicants can outlive resetDatabase
  const applicant = await prisma.applicant.create({
    data: {
      firstName: 'Sam', lastName: 'Setup', email,
      applications: { create: { cvKey: 'cv/legacy.pdf', roles: { create: [{ roleId: waiter.id, experienceLevel: '3-5 years' }] } } },
    },
  });
  await worker(email, { applicantId: applicant.id }, ['Bartender', 'Supervisor']);
  const cookie = await login(email);

  const got = await call('GET', '/api/v1/user/profile', undefined, { cookie });
  assert.equal(got.statusCode, 200, got.raw);
  const p = got.body.data;
  assert.ok(p.roles.includes('Bar staff'), `"Bartender" shows as Bar staff: ${JSON.stringify(p.roles)}`);
  assert.equal(p.roleExperience['Waiting staff'], '3-5 years', 'the experience they gave as "Waiter" sits by Waiting staff');

  // They untick Bar staff and tick Waiting staff.
  const saved = await call('PUT', '/api/v1/user/profile', pageSave(p, ['Waiting staff']), { cookie });
  assert.equal(saved.statusCode, 200, saved.raw);
  const record = await prisma.workerProfile.findFirst({ where: { user: { email } } });
  assert.deepEqual(record!.roles.sort(), ['Supervisor', 'Waiting staff'], 'Bartender gone, Supervisor kept, no duplicates');
});

test('a phone number Ops typed in (up to 40 characters) saves back unchanged', async () => {
  const longPhone = '07700 900123 / 020 7946 0000'; // 28 characters
  await worker('long.phone@example.com', { phone: longPhone }, ['Bar staff']);
  const cookie = await login('long.phone@example.com');
  const p = (await call('GET', '/api/v1/user/profile', undefined, { cookie })).body.data;
  assert.equal(p.phone, longPhone);

  const saved = await call('PUT', '/api/v1/user/profile', pageSave(p, p.roles), { cookie });
  assert.equal(saved.statusCode, 200, saved.raw);
  assert.equal(saved.body.data.phone, longPhone);
});

test('a save the API refuses says which field, in words', async () => {
  await worker('messages@example.com', {}, ['Bar staff']);
  const cookie = await login('messages@example.com');
  const p = (await call('GET', '/api/v1/user/profile', undefined, { cookie })).body.data;

  const blankName = await call('PUT', '/api/v1/user/profile', { ...pageSave(p, p.roles), firstName: '   ' }, { cookie });
  assert.equal(blankName.statusCode, 400, 'a name of spaces is no name');
  assert.equal(blankName.body.details[0], 'Add your first name.');

  const longPhone = await call('PUT', '/api/v1/user/profile', { ...pageSave(p, p.roles), phone: '0'.repeat(41) }, { cookie });
  assert.equal(longPhone.statusCode, 400);
  assert.match(longPhone.body.details[0], /phone number is too long/);
});

test('only a real photo is kept: SVG, text and crafted strings are refused', async () => {
  await worker('photo.checks@example.com', {}, ['Bar staff']);
  const cookie = await login('photo.checks@example.com');
  const upload = (dataUrl: unknown) => call('POST', '/api/v1/user/profile/avatar', { dataUrl }, { cookie });

  const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>').toString('base64');
  for (const bad of [
    svg,
    'data:image/jpeg;base64,' + Buffer.from('not a photo at all').toString('base64'),
    'data:image/png" onerror="alert(1)',
    'data:image/png;base64,' + PNG + '" onerror="alert(1)',
    '',
    42,
  ]) {
    const res = await upload(bad);
    assert.equal(res.statusCode, 400, `refused: ${String(bad).slice(0, 40)}`);
  }
  assert.equal((await prisma.user.findUnique({ where: { email: 'photo.checks@example.com' } }))!.staffAvatar, null, 'nothing stored');

  // A PNG labelled as a JPEG is stored under its real type.
  const ok = await upload('data:image/jpeg;base64,' + PNG);
  assert.equal(ok.statusCode, 200, ok.raw);
  assert.equal(ok.body.data.profileImage, 'data:image/png;base64,' + PNG);

  const huge = await upload('data:image/png;base64,' + Buffer.alloc(1024 * 1024 + 10).toString('base64'));
  assert.equal(huge.statusCode, 413);
});

test('a worker Ops added by hand (no application) can finish setup', async () => {
  await worker('ops.added@example.com', {}, []);
  const cookie = await login('ops.added@example.com');
  const p = (await call('GET', '/api/v1/user/profile', undefined, { cookie })).body.data;
  assert.equal(p.isStaff, true);
  assert.deepEqual(p.roles, [], 'nothing to pre-tick');

  assert.equal((await call('POST', '/api/v1/user/profile/avatar', { dataUrl: 'data:image/png;base64,' + PNG }, { cookie })).statusCode, 200);
  const saved = await call('PUT', '/api/v1/user/profile', { ...pageSave(p, ['Runners']), postcode: 'SE1 7PB', emergencyContactName: 'Alex', emergencyContactPhone: '07700 900456' }, { cookie });
  assert.equal(saved.statusCode, 200, saved.raw);
  assert.deepEqual(saved.body.data.roles, ['Runners']);
  assert.equal(saved.body.data.postcode, 'SE1 7PB');
  assert.ok(saved.body.data.profileImage);
});

// ── Admin sees the photos ──────────────────────────────────────────────────

function createAdminApp() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { ADMIN_TEST_SESSION_ID } = require('../testing/csrf');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const opsApi = require('../routes/ops').default;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const applications = require('../routes/applications').default;
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
  app.use('/api/v1/applications', applications);
  app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ ok: false, error: String(err?.message ?? err) }));
  return app;
}

test('admin sees each worker\'s photo on Ops and People > Staff, and can remove a bad one', async () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { csrfHeaders } = require('./helpers');
  const adminApp = createAdminApp();
  const admin = (method: string, url: string) => inject(adminApp, { method, url, headers: { ...csrfHeaders(), 'x-test-as': 'admin' } });

  const email = `photo.admin.${Date.now()}@example.com`;
  const role = await prisma.role.upsert({ where: { name: 'Bar staff' }, create: { name: 'Bar staff' }, update: {} });
  const applicant = await prisma.applicant.create({
    data: { firstName: 'Pia', lastName: 'Photo', email, applications: { create: { cvKey: 'cv/pia.pdf', status: 'HIRED', roles: { create: [{ roleId: role.id, experienceLevel: '1-2 years' }] } } } },
  });
  const pia = await worker(email, { applicantId: applicant.id, firstName: 'Pia', lastName: 'Photo' }, ['Bar staff']);
  const noPhoto = await worker(`no.photo.${Date.now()}@example.com`, {}, ['Runners']);

  const cookie = await login(email);
  assert.equal((await call('POST', '/api/v1/user/profile/avatar', { dataUrl: 'data:image/png;base64,' + PNG }, { cookie })).statusCode, 200);

  // Ops > Workers and the worker page carry a photo URL; no photo, no URL.
  const list = await admin('GET', '/api/v1/ops/workers');
  assert.equal(list.statusCode, 200, list.raw);
  const rows = list.body.data ?? list.body;
  const piaRow = rows.find((w: any) => w.id === pia.id);
  assert.ok(piaRow.photoUrl.startsWith(`/api/v1/ops/workers/${pia.id}/photo?v=`), piaRow.photoUrl);
  assert.equal(rows.find((w: any) => w.id === noPhoto.id).photoUrl, null);
  assert.ok(!JSON.stringify(rows).includes(PNG), 'the photo itself is not in the list JSON');

  // The URL serves the image, to an admin only.
  const img = await admin('GET', piaRow.photoUrl);
  assert.equal(img.statusCode, 200);
  assert.match(String(img.headers['content-type']), /^image\/png/);
  assert.equal(Number(img.headers['content-length']), Buffer.from(PNG, 'base64').length);
  const anon = await inject(adminApp, { method: 'GET', url: piaRow.photoUrl });
  assert.equal(anon.statusCode, 401, 'no admin session, no photo');
  assert.equal((await admin('GET', `/api/v1/ops/workers/${noPhoto.id}/photo`)).statusCode, 404);

  // People > Staff (hired applicants) and the drawer show it too.
  const staff = await admin('GET', '/api/v1/applications?status=HIRED&limit=50&search=Photo');
  assert.equal(staff.statusCode, 200, staff.raw);
  const staffRow = staff.body.applications.find((a: any) => a.email === email);
  assert.equal(staffRow.photoUrl, piaRow.photoUrl);
  const drawer = await admin('GET', `/api/v1/applications/${staffRow.id}`);
  assert.equal(drawer.body.data.photoUrl, piaRow.photoUrl);

  // Removing it: recorded, and the worker is back to setting up their profile.
  const removed = await admin('DELETE', `/api/v1/ops/workers/${pia.id}/photo`);
  assert.equal(removed.statusCode, 200, removed.raw);
  assert.equal((await admin('GET', piaRow.photoUrl)).statusCode, 404);
  assert.equal((await call('GET', '/api/v1/user/profile', undefined, { cookie })).body.data.profileImage, null);
  assert.ok(await prisma.auditLog.findFirst({ where: { action: 'WORKER_PHOTO_REMOVED', entityId: pia.id } }));
});
