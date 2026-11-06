/**
 * The signed-in staff area on the website, against a real database: a worker
 * sees their own shifts on the website session (and the app's token still
 * works), answers an offer, and applies for a job.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import bcrypt from 'bcrypt';

import { prisma, resetDatabase, disconnect, inject, createClient, createBooking, workerToken } from './helpers';

function createUserApp() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const userAuth = require('../routes/userAuth').default;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mobileShifts = require('../routes/mobileShifts').default;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const jobApplications = require('../routes/jobApplications').default;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const session = require('express-session');
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(session({ name: 'vergo.sid', secret: 'staff-area-test-secret', resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'strict' } }));
  // Mounted as index.ts mounts them: shifts ahead of the user router.
  app.use('/api/v1/user/shifts', mobileShifts);
  app.use('/api/v1/mobile/shifts', mobileShifts);
  app.use('/api/v1/user', userAuth);
  app.use('/api/v1/job-applications', jobApplications);
  app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ ok: false, error: String(err?.message ?? err) }));
  return app;
}

const app = createUserApp();
const call = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  inject(app, { method, url, headers, body });

async function staffMember(email: string) {
  return prisma.user.create({
    data: {
      email, firstName: 'Pat', lastName: 'Worker', userType: 'JOB_SEEKER', staffTier: 'STANDARD',
      passwordHash: await bcrypt.hash('Pat-Pass-123', 4), emailVerified: true,
      workerProfile: { create: {} },
    },
  });
}

async function login(email: string): Promise<string> {
  const res = await call('POST', '/api/v1/user/login', { email, password: 'Pat-Pass-123' });
  assert.equal(res.statusCode, 200, res.raw);
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : [String(raw)];
  return list.find((c) => c.startsWith('vergo.sid='))!.split(';')[0];
}

const daysFromNow = (n: number) => new Date(Date.now() + n * 86400000);

test.before(async () => { await resetDatabase(); });
test.after(async () => { await disconnect(); });

test('a worker sees and answers their own shifts on the website, and the app token still works', async () => {
  const pat = await staffMember('pat.worker@example.com');
  const other = await staffMember('other.worker@example.com');
  const client = await createClient({ companyName: 'Riverside Weddings' });
  const offer = await createBooking({ clientId: client.id, staffId: pat.id, eventDate: daysFromNow(3), status: 'PENDING' });
  await createBooking({ clientId: client.id, staffId: pat.id, eventDate: daysFromNow(-7), status: 'COMPLETED' });
  await createBooking({ clientId: client.id, staffId: other.id, eventDate: daysFromNow(3), status: 'PENDING' });

  const signedOut = await call('GET', '/api/v1/user/shifts?view=upcoming');
  assert.equal(signedOut.statusCode, 401, 'no session, no shifts');

  const cookie = await login('pat.worker@example.com');
  const upcoming = await call('GET', '/api/v1/user/shifts?view=upcoming', undefined, { cookie });
  assert.equal(upcoming.statusCode, 200, upcoming.raw);
  assert.deepEqual(upcoming.body.data.shifts.map((s: any) => s.id), [offer.id], 'only their own shift');
  assert.equal(upcoming.body.data.shifts[0].client.companyName, 'Riverside Weddings');

  const history = await call('GET', '/api/v1/user/shifts?view=history', undefined, { cookie });
  assert.equal(history.body.data.shifts.length, 1);
  assert.equal(history.body.data.shifts[0].status, 'COMPLETED');

  const noTerms = await call('POST', `/api/v1/user/shifts/${offer.id}/confirm`, {}, { cookie });
  assert.equal(noTerms.statusCode, 400, 'accepting needs the terms ticked');
  const accepted = await call('POST', `/api/v1/user/shifts/${offer.id}/confirm`, { acceptedTerms: true }, { cookie });
  assert.equal(accepted.statusCode, 200, accepted.raw);
  assert.equal(accepted.body.data.status, 'CONFIRMED');

  // The app is unchanged: a bearer token, no cookie.
  const app = await call('GET', '/api/v1/mobile/shifts?view=upcoming', undefined, { authorization: `Bearer ${workerToken(pat.id)}` });
  assert.equal(app.statusCode, 200);
  assert.equal(app.body.data.shifts[0].status, 'CONFIRMED');
});

test('staff apply for jobs on the board; the photo is asked for once, at profile setup, not here', async () => {
  await staffMember('photo.worker@example.com');
  // Roles are reference data and survive resetDatabase, so this may exist already.
  const role = await prisma.role.upsert({ where: { name: 'Waiting staff' }, create: { name: 'Waiting staff' }, update: {} });
  const job = await prisma.job.create({
    data: { title: 'Wedding waiting staff', description: 'Silver service for 120 guests', location: 'Surrey', roleId: role.id, status: 'OPEN', staffNeeded: 4, eventDate: daysFromNow(10) },
  });
  const cookie = await login('photo.worker@example.com');

  // Profile setup: the photo goes on first, as the staff pages require.
  const photo = 'data:image/jpeg;base64,' + Buffer.from('a tiny stand-in for a photo').toString('base64');
  const uploaded = await call('POST', '/api/v1/user/profile/avatar', { dataUrl: photo }, { cookie });
  assert.equal(uploaded.statusCode, 200, uploaded.raw);
  const profile = await call('GET', '/api/v1/user/profile', undefined, { cookie });
  assert.equal(profile.body.data.profileImage, photo);

  const applied = await call('POST', '/api/v1/job-applications', { jobId: job.id }, { cookie });
  assert.equal(applied.statusCode, 201, applied.raw);
  const mine = await call('GET', '/api/v1/job-applications/mine', undefined, { cookie });
  assert.equal(mine.body.applications.length, 1);
  assert.equal(mine.body.applications[0].job.title, 'Wedding waiting staff');

  const withdrawn = await call('POST', `/api/v1/job-applications/${mine.body.applications[0].id}/withdraw`, undefined, { cookie });
  assert.equal(withdrawn.statusCode, 200);
});
