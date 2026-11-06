/**
 * Admin > Board > Jobs lists jobs closest date first, against a real database:
 * still to come (or running now) soonest first, then undated, then past jobs
 * most recent first. Filters keep that order, and pages are slices of it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import { prisma, resetDatabase, disconnect, inject } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ADMIN_TEST_SESSION_ID } = require('../testing/csrf');

function createApp() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const jobs = require('../routes/jobs').default;
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    req.session = { id: ADMIN_TEST_SESSION_ID, isAdmin: true, username: 'will', loginTime: Date.now(), lastActivity: Date.now(), destroy: (cb: () => void) => cb() };
    next();
  });
  app.use('/api/v1/jobs', jobs);
  app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ ok: false, error: String(err?.message ?? err) }));
  return app;
}

const app = createApp();
const day = (n: number) => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + n); return d; };

test.before(async () => { await resetDatabase(); });
test.after(async () => { await disconnect(); });

test('admin jobs come closest date first: upcoming and running, then undated, then past', async () => {
  const role = await prisma.role.upsert({ where: { name: 'Waiting staff' }, create: { name: 'Waiting staff' }, update: {} });
  const make = (title: string, eventDate: Date | null, extra: Record<string, unknown> = {}) =>
    prisma.job.create({ data: { title, description: 'x', location: 'London', roleId: role.id, status: 'OPEN', eventDate, ...extra } });

  // Created in a jumbled order, so creation time can't be what sorts them.
  await make('Past, last month', day(-30));
  await make('In five days', day(5));
  await make('No date yet', null);
  await make('Tomorrow', day(1));
  await make('Past, last week', day(-7), { status: 'CLOSED' });
  await make('Running now (started yesterday, ends in two days)', day(-1), { eventEndDate: day(2) });
  await make('Today', day(0));

  const list = await inject(app, { method: 'GET', url: '/api/v1/jobs/admin/list?limit=50' });
  assert.equal(list.statusCode, 200, list.raw);
  assert.deepEqual(list.body.data.jobs.map((j: any) => j.title), [
    'Running now (started yesterday, ends in two days)',
    'Today',
    'Tomorrow',
    'In five days',
    'No date yet',
    'Past, last week',
    'Past, last month',
  ]);

  // A filter keeps the order.
  const open = await inject(app, { method: 'GET', url: '/api/v1/jobs/admin/list?status=OPEN&limit=50' });
  assert.deepEqual(open.body.data.jobs.map((j: any) => j.title), [
    'Running now (started yesterday, ends in two days)', 'Today', 'Tomorrow', 'In five days', 'No date yet', 'Past, last month',
  ]);
  assert.equal(open.body.data.pagination.total, 6);

  // Pages are slices of the same order.
  const page2 = await inject(app, { method: 'GET', url: '/api/v1/jobs/admin/list?limit=3&page=2' });
  assert.deepEqual(page2.body.data.jobs.map((j: any) => j.title), ['In five days', 'No date yet', 'Past, last week']);
  assert.equal(page2.body.data.pagination.total, 7);
});
