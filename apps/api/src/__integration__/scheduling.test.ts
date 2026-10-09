/**
 * VERGO Scheduling (the desktop admin tool on the web) against a real
 * database: the desktop's own behaviour through the ported routes, its
 * responses as the desktop screens expect them, the admin-only guard, and
 * restoring a desktop backup row for row.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import { prisma, resetDatabase, disconnect, csrfHeaders, inject } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ADMIN_TEST_SESSION_ID } = require('../testing/csrf');

function createApp() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const scheduling = require('../scheduling').default;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cookieParser = require('cookie-parser');
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());
  app.use((req: any, _res: any, next: any) => {
    req.session = req.headers['x-test-as'] === 'admin' ? { id: ADMIN_TEST_SESSION_ID, username: 'will', isAdmin: true } : undefined;
    next();
  });
  app.use('/api/v1/scheduling', scheduling);
  return app;
}

const app = createApp();
const call = (method: string, url: string, body?: unknown) =>
  inject(app, { method, url: `/api/v1/scheduling${url}`, headers: { ...csrfHeaders(), 'x-test-as': 'admin' }, body });
const ok = (res: { statusCode: number; body: any }, status = 200) => {
  assert.equal(res.statusCode, status, JSON.stringify(res.body).slice(0, 800));
  return res.body;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
const inDays = (n: number) => { const d = new Date(today); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

test.beforeEach(async () => {
  await resetDatabase();
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "sched_lead", "sched_job_schedule_item", "sched_assignment", "sched_job", "sched_staff", "sched_client" RESTART IDENTITY CASCADE');
});

test.after(async () => {
  await disconnect();
});

test('nothing answers without an admin session', async () => {
  for (const [method, url] of [['GET', '/me'], ['GET', '/jobs'], ['GET', '/dashboard'], ['POST', '/clients'], ['POST', '/restore']]) {
    const res = await inject(app, { method, url: `/api/v1/scheduling${url}`, headers: csrfHeaders(), body: {} });
    assert.equal(res.statusCode, 401, `${method} ${url}`);
  }
  assert.equal(ok(await call('GET', '/me')).username, 'will');
});

test('the desktop day: client, people, a job, crew, margin, rota and dashboard', async () => {
  const client = ok(await call('POST', '/clients', { name: 'Popcorn Catering', defaultChargeRate: 18 }), 201);
  assert.equal(client.defaultChargeRate, '18', 'money comes back as a string, as the desktop screens expect');
  const ana = ok(await call('POST', '/staff', { firstName: 'Ana', lastName: 'Smith', hourlyRate: '13.50' }), 201);
  const noRate = ok(await call('POST', '/staff', { firstName: 'Ben', lastName: 'Jones' }), 201);

  const job = ok(await call('POST', '/jobs', {
    clientId: client.id, title: 'Studio lunch', venueName: 'Warner Bros Studio', date: inDays(3),
    startTime: '09:00', endTime: '17:30', breakMinutes: 30, chargeRate: '18.00', staffNeeded: 2, roleNeeded: 'Kitchen porter',
  }), 201);
  assert.match(job.reference, /^VJ-0001$/);

  // Rates are never assumed.
  const refused = await call('POST', `/jobs/${job.id}/crew`, { staffId: noRate.id });
  assert.equal(refused.statusCode, 422);
  assert.match(refused.body.error, /no hourly rate/);

  const crew = ok(await call('POST', `/jobs/${job.id}/crew`, { staffId: ana.id }), 201);
  assert.equal(crew.hours, '8', 'the job length less the break');
  assert.equal((await call('POST', `/jobs/${job.id}/crew`, { staffId: ana.id })).statusCode, 409);

  const detail = ok(await call('GET', `/jobs/${job.id}`));
  assert.equal(detail.crew[0].basePay, '108.00');
  assert.equal(detail.crew[0].holidayPay, '13.04');
  assert.equal(detail.margin.charged, '144.00');
  assert.equal(detail.margin.staffCost, '121.04');
  assert.equal(detail.margin.margin, '22.96');
  assert.equal(detail.margin.thin, false);

  // Short-staffed filter, roles, rota, dashboard.
  assert.equal(ok(await call('GET', '/jobs?crew=short')).length, 1);
  assert.deepEqual(ok(await call('GET', '/jobs/roles')), ['Kitchen porter']);
  const monday = (() => { const d = new Date(`${inDays(3)}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return iso(d); })();
  const rota = ok(await call('GET', `/rota?weekStart=${monday}`));
  assert.equal(rota.jobs.length, 1);
  assert.equal(rota.staff.find((s: any) => s.id === ana.id).weeklyHours, '8.00');
  const dash = ok(await call('GET', '/dashboard'));
  assert.equal(dash.jobsThisWeek, 1);
  assert.equal(dash.committedWageCost, '121.04');
  assert.deepEqual(dash.staffWithoutRate.map((s: any) => s.name), ['Ben Jones']);

  // A clash on the same day is a warning, not a block.
  const second = ok(await call('POST', '/jobs', { title: 'Evening bar', date: inDays(3), startTime: '18:00', endTime: '23:00', chargeRate: 20 }), 201);
  assert.equal(second.reference, 'VJ-0002');
  const clash = ok(await call('POST', `/jobs/${second.id}/crew`, { staffId: ana.id }), 201);
  assert.match(clash.clash, /Also on VJ-0001/);

  // Running order, duplicate with crew, invoice status.
  ok(await call('POST', `/jobs/${job.id}/schedule-items`, { time: '08:30', title: 'Briefing' }), 201);
  assert.equal(ok(await call('GET', `/jobs/${job.id}/schedule`)).scheduleItems[0].title, 'Briefing');
  const copy = ok(await call('POST', `/jobs/${job.id}/duplicate`, { date: inDays(10) }), 201);
  assert.equal(copy.crewCopied, 1);
  ok(await call('PATCH', `/jobs/${job.id}`, { status: 'COMPLETED', invoiceStatus: 'INVOICED' }));
  assert.equal(ok(await call('GET', '/jobs?status=COMPLETED&invoiceStatus=NOT_INVOICED,INVOICED')).length, 1);

  // Deleting someone on jobs makes them inactive instead.
  assert.equal(ok(await call('DELETE', `/staff/${ana.id}`)).archived, true);
});

test('runs and picked dates are one job per day', async () => {
  const run = ok(await call('POST', '/jobs', { title: 'Weekday lunches', date: inDays(1), endDate: inDays(14), repeatDays: [1, 2, 3, 4, 5], startTime: '11:00', endTime: '15:00', chargeRate: 17 }), 201);
  assert.ok(run.run.created >= 9 && run.run.created <= 10);
  const days = ok(await call('GET', `/jobs?from=${inDays(1)}&to=${inDays(14)}`));
  assert.ok(days.every((j: any) => ![0, 6].includes(new Date(j.date).getUTCDay())), 'weekdays only');
  ok(await call('PATCH', `/jobs/${run.id}?applyToRun=true`, { startTime: '11:30' }));
  assert.ok(ok(await call('GET', `/jobs?from=${inDays(1)}&to=${inDays(14)}`)).every((j: any) => j.startTime === '11:30'));
  assert.equal(ok(await call('DELETE', `/jobs/${run.id}/run`)).cancelled, run.run.created);

  const picked = ok(await call('POST', '/jobs', {
    title: 'Three-date festival', date: inDays(20), startTime: '10:00', endTime: '18:00', chargeRate: 19,
    selectedDates: [{ date: inDays(22) }, { date: inDays(20), notes: 'Load-in day' }, { date: inDays(27) }],
  }), 201);
  assert.equal(picked.run.created, 3);
  assert.equal(picked.notes, 'Load-in day', 'the first date, in date order, with its own note');
  // A weekend-only run over a single Monday has no days. (Not "tomorrow",
  // which is a Saturday one day in seven.)
  const monday = inDays(((8 - today.getUTCDay()) % 7) || 7);
  assert.equal((await call('POST', '/jobs', { title: 'x', date: monday, startTime: '10:00', endTime: '11:00', chargeRate: 1, endDate: monday, repeatDays: [6, 7] })).statusCode, 400);
});

test('outreach converts to a client once', async () => {
  const lead = ok(await call('POST', '/leads', { company: 'Riverside Venue', contactedOn: inDays(-2), channel: 'PHONE' }), 201);
  const won = ok(await call('POST', `/leads/${lead.id}/convert`), 201);
  assert.equal(won.stage, 'WON');
  assert.equal(won.client.name, 'Riverside Venue');
  assert.equal((await call('POST', `/leads/${lead.id}/convert`)).statusCode, 409);
});

// ── Restoring a desktop backup ────────────────────────────────────────────

const copyBlock = (table: string, cols: string[], rows: string[][]) =>
  [`COPY public."${table}" (${cols.map((c) => (/[A-Z]/.test(c) ? `"${c}"` : c)).join(', ')}) FROM stdin;`, ...rows.map((r) => r.join('\t')), '\\.'];
const T = '2026-09-01 09:00:00';

function backup(opts: { jobTitle?: string; jobUpdated?: string } = {}) {
  return [
    '-- PostgreSQL database dump',
    ...copyBlock('AdminUser', ['id', 'username', 'passwordHash'], [['a1', 'will', '$argon2id$never-read']]),
    ...copyBlock('Client', ['id', 'name', 'contactName', 'contactEmail', 'contactPhone', 'defaultChargeRate', 'notes', 'archived', 'createdAt', 'updatedAt'],
      [['c1', 'Popcorn', 'Jo', '\\N', '\\N', '15.00', '\\N', 'f', T, T]]),
    ...copyBlock('Staff', ['id', 'firstName', 'lastName', 'email', 'phone', 'hourlyRate', 'status', 'notes', 'createdAt', 'updatedAt'],
      [['s1', 'Jada', 'Smith', 'jada@example.com', '\\N', '12.71', 'ACTIVE', '\\N', T, T]]),
    ...copyBlock('Job', ['id', 'reference', 'clientId', 'title', 'venueName', 'date', 'startTime', 'endTime', 'breakMinutes', 'chargeRate', 'status', 'notes', 'createdAt', 'updatedAt', 'endDate', 'ongoing', 'repeatDays', 'seriesId', 'invoiceStatus', 'staffNeeded', 'roleNeeded'],
      [['j1', 'VJ-0001', 'c1', opts.jobTitle ?? 'Studio lunch', 'Warner Bros Studio', '2026-12-01', '07:00', '17:00', '30', '15.00', 'CONFIRMED', 'Line one\\nline two', T, opts.jobUpdated ?? T, '\\N', 'f', '{1,3}', '\\N', 'NOT_INVOICED', '1', 'Kitchen porter'],
        // From before the desktop had runs: no repeat days at all (NULL).
        ['j0', 'VJ-0000', 'c1', 'Old job', '\\N', '2026-08-29', '07:00', '15:00', '0', '15.00', 'COMPLETED', '\\N', T, T, '\\N', 'f', '\\N', '\\N', 'PAID', '\\N', '\\N']]),
    ...copyBlock('Assignment', ['id', 'jobId', 'staffId', 'hours', 'rateOverride', 'notes', 'createdAt', 'updatedAt'],
      [['as1', 'j1', 's1', '9.5', '\\N', '\\N', T, T]]),
    ...copyBlock('JobScheduleItem', ['id', 'jobId', 'time', 'title', 'assignee', 'notes', 'createdAt', 'updatedAt'],
      [['si1', 'j1', '06:45', 'Arrive', 'Jada', '\\N', T, T]]),
    ...copyBlock('Lead', ['id', 'company', 'contactName', 'contactEmail', 'contactPhone', 'contactedOn', 'channel', 'stage', 'notes', 'clientId', 'createdAt', 'updatedAt'],
      [['l1', 'Popcorn', '\\N', '\\N', '\\N', '2026-08-20', 'EMAIL', 'WON', '\\N', 'c1', T, T]]),
  ].join('\n');
}

test('a desktop backup restores row for row, once, and newer desktop edits come across', async () => {
  const preview = ok(await call('POST', '/restore', { sql: backup() }));
  assert.equal(preview.committed, false);
  assert.deepEqual(preview.tables.map((t: any) => [t.key, t.add]), [['clients', 1], ['staff', 1], ['jobs', 2], ['assignments', 1], ['scheduleItems', 1], ['leads', 1]]);
  assert.equal(await prisma.schedJob.count(), 0, 'a preview writes nothing');

  ok(await call('POST', '/restore', { sql: backup(), commit: true }));
  const job = ok(await call('GET', '/jobs/j1'));
  assert.equal(job.reference, 'VJ-0001');
  assert.equal(job.notes, 'Line one\nline two');
  assert.deepEqual(job.repeatDays, [1, 3]);
  assert.deepEqual(ok(await call('GET', '/jobs/j0')).repeatDays, [], 'a NULL list from an old backup is the empty one');
  assert.equal(job.crew[0].name, 'Jada Smith');
  assert.equal(job.crew[0].hours, '9.50');
  assert.equal(job.date.slice(0, 10), '2026-12-01');
  assert.equal((await prisma.schedJob.findUniqueOrThrow({ where: { id: 'j1' } })).updatedAt.toISOString(), '2026-09-01T09:00:00.000Z', 'timestamps kept');

  // Again: nothing to do.
  const again = ok(await call('POST', '/restore', { sql: backup() }));
  assert.ok(again.tables.every((t: any) => t.add === 0 && t.update === 0));

  // Edited here after the backup: kept. Edited on the desktop later still: replaced.
  ok(await call('PATCH', '/jobs/j1', { title: 'Edited on the web' }));
  const older = ok(await call('POST', '/restore', { sql: backup({ jobTitle: 'Desktop title' }), commit: true }));
  assert.equal(older.tables.find((t: any) => t.key === 'jobs').keep, 2);
  assert.equal(ok(await call('GET', '/jobs/j1')).title, 'Edited on the web');
  const later = new Date(Date.now() + 60_000).toISOString().replace('T', ' ').slice(0, 19);
  ok(await call('POST', '/restore', { sql: backup({ jobTitle: 'Desktop title', jobUpdated: later }), commit: true }));
  assert.equal(ok(await call('GET', '/jobs/j1')).title, 'Desktop title');
});

test('a restore that clashes on a reference writes nothing', async () => {
  ok(await call('POST', '/jobs', { title: 'Made on the web', date: '2026-12-02', startTime: '10:00', endTime: '12:00', chargeRate: 15 }), 201); // VJ-0001
  const res = await call('POST', '/restore', { sql: backup(), commit: true });
  assert.equal(res.statusCode, 409);
  assert.match(res.body.conflicts[0], /VJ-0001/);
  assert.equal(await prisma.schedClient.count(), 0);
  assert.equal((await call('POST', '/restore', { sql: 'not a backup' })).statusCode, 400);
});
