/**
 * What the web Ops panel took over from the desktop VERGO Ops tool, against a
 * real database: importing one of its backups (twice, and with people added
 * offline later), usual rates, a booking on several dates, copying a booking,
 * and the open shifts on a worker's page.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import { prisma, resetDatabase, disconnect, csrfHeaders, inject } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ADMIN_TEST_SESSION_ID } = require('../testing/csrf');

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
  return app;
}

const app = createApp();
const admin = (method: string, url: string, body?: unknown) =>
  inject(app, { method, url: `/api/v1/ops${url}`, headers: { ...csrfHeaders(), 'x-test-as': 'admin' }, body });
const ok = (res: { statusCode: number; body: any }, status = 200) => {
  assert.equal(res.statusCode, status, JSON.stringify(res.body).slice(0, 500));
  return res.body.data;
};

test.beforeEach(async () => {
  await resetDatabase();
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "OpsLegacyImport", "OpsScheduleItem", "OpsBookingSeries", "OpsLead", "AuditLog", "OpsBooking", "OpsRequirement", "WorkerProfile", "Applicant", "RightToWorkCheck" RESTART IDENTITY CASCADE');
});

test.after(async () => {
  await disconnect();
});

const copy = (table: string, cols: string[], rows: string[][]) =>
  [`COPY public."${table}" (${cols.map((c) => (/[A-Z]/.test(c) ? `"${c}"` : c)).join(', ')}) FROM stdin;`, ...rows.map((r) => r.join('\t')), '\\.'];
const T = '2026-09-01 09:00:00';

/** A backup in the shape the desktop tool's backup.ps1 writes. */
function backup(extraAssignments: string[][] = []) {
  return [
    '-- PostgreSQL database dump',
    ...copy('AdminUser', ['id', 'username', 'passwordHash'], [['a1', 'will', '$2b$12$never-read']]),
    ...copy('Client', ['id', 'name', 'contactName', 'contactEmail', 'contactPhone', 'defaultChargeRate', 'notes', 'archived', 'createdAt', 'updatedAt'],
      [['c1', 'Popcorn', 'Jo', '\\N', '\\N', '15.00', '\\N', 'f', T, T]]),
    ...copy('Staff', ['id', 'firstName', 'lastName', 'email', 'phone', 'hourlyRate', 'status', 'notes', 'createdAt', 'updatedAt'], [
      ['s1', 'jada', 'smith', 'jada.desktop@example.com', '\\N', '12.71', 'ACTIVE', '\\N', T, T],
      ['s2', 'ridwan', 'khan', 'ridwan.desktop@example.com', '\\N', '13.50', 'ACTIVE', '\\N', T, T],
    ]),
    ...copy('Job', ['id', 'reference', 'clientId', 'title', 'venueName', 'date', 'startTime', 'endTime', 'breakMinutes', 'chargeRate', 'status', 'notes', 'createdAt', 'updatedAt', 'endDate', 'ongoing', 'repeatDays', 'seriesId', 'invoiceStatus', 'staffNeeded', 'roleNeeded'],
      [['j1', 'VJ-0001', 'c1', 'Studio lunch', 'Warner Bros Studio', '2026-12-01', '07:00', '17:00', '30', '15.00', 'CONFIRMED', '\\N', T, T, '\\N', 'f', '{}', '\\N', 'NOT_INVOICED', '1', 'Kitchen porter']]),
    ...copy('Assignment', ['id', 'jobId', 'staffId', 'hours', 'rateOverride', 'notes', 'createdAt', 'updatedAt'],
      [['as1', 'j1', 's1', '9.5', '\\N', '\\N', T, T], ...extraAssignments]),
  ].join('\n');
}

test('a desktop backup imports once, with usual rates, and people added offline later come across', async () => {
  const preview = ok(await admin('POST', '/legacy-import', { sql: backup() }));
  assert.equal(preview.committed, false);
  assert.equal(preview.counts.Job.created, 1);
  assert.equal(await prisma.opsBooking.count(), 0, 'a preview writes nothing');

  const done = ok(await admin('POST', '/legacy-import', { sql: backup(), commit: true }));
  assert.equal(done.counts.Client.created, 1);
  assert.equal(done.counts.Staff.created, 2);
  assert.equal(done.counts.Assignment.created, 1);
  const client = await prisma.client.findFirstOrThrow({ where: { companyName: 'Popcorn Catering' } });
  assert.equal(Number(client.defaultChargeRate), 15);
  const ridwan = await prisma.user.findUniqueOrThrow({ where: { email: 'ridwan.desktop@example.com' }, include: { workerProfile: true } });
  assert.equal(Number(ridwan.workerProfile!.defaultPayRate), 13.5);
  assert.equal(await prisma.adminUser.count({ where: { username: 'will' } }), 0, 'the desktop login is never read');

  const again = ok(await admin('POST', '/legacy-import', { sql: backup(), commit: true }));
  assert.deepEqual(Object.values(again.counts).map((c: any) => c.created + c.linked), [0, 0, 0]);
  assert.equal(await prisma.opsBooking.count(), 1);

  // Ridwan put on the same job in the desktop tool after the import.
  const later = ok(await admin('POST', '/legacy-import', { sql: backup([['as2', 'j1', 's2', '9.5', '\\N', '\\N', T, T]]), commit: true }));
  assert.equal(later.counts.Assignment.created, 1);
  const booking = await prisma.opsBooking.findFirstOrThrow({ include: { requirements: true, assignments: true } });
  assert.equal(booking.assignments.length, 2);
  assert.equal(booking.requirements[0].quantity, 2, 'headcount follows the people on it');
  assert.equal(Number(booking.assignments.find((a) => a.staffId === ridwan.id)!.staffPayRate), 13.5);

  const summary = ok(await admin('GET', '/legacy-import'));
  assert.equal(summary.find((x: any) => x.entity === 'Assignment').count, 2);
});

test('VERGO Scheduling comes across into Ops once, without doubling what a backup already brought', async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE sched_job_schedule_item, sched_assignment, sched_lead, sched_job, sched_staff, sched_client CASCADE');
  assert.equal(ok(await admin('GET', '/legacy-import/scheduling')).rows, 0);
  ok(await admin('POST', '/legacy-import', { sql: backup(), commit: true }));

  // Scheduling restored the same backup (same ids), then a new client, person
  // and two-day run were made on the web.
  const at = new Date('2026-09-01T09:00:00Z');
  await prisma.schedClient.createMany({ data: [
    { id: 'c1', name: 'Popcorn', contactName: 'Jo', defaultChargeRate: '15.00', createdAt: at },
    { id: 'web-c', name: 'Hackney Hall', contactEmail: 'events@hackneyhall.example.com', defaultChargeRate: '18.00' },
  ] });
  await prisma.schedStaff.createMany({ data: [
    { id: 's1', firstName: 'jada', lastName: 'smith', email: 'jada.desktop@example.com', hourlyRate: '12.71', createdAt: at },
    { id: 'web-s', firstName: 'Ola', lastName: 'Ade', email: 'ola.web@example.com', hourlyRate: '14.00' },
  ] });
  await prisma.schedJob.createMany({ data: [
    { id: 'j1', reference: 'VJ-0001', clientId: 'c1', title: 'Studio lunch', venueName: 'Warner Bros Studio', date: new Date('2026-12-01T00:00:00Z'), startTime: '07:00', endTime: '17:00', breakMinutes: 30, chargeRate: '15.00', staffNeeded: 1, roleNeeded: 'Kitchen porter', createdAt: at },
    { id: 'web-j1', reference: 'VJ-0002', clientId: 'web-c', title: 'Gala', venueName: 'Hackney Hall', date: new Date('2026-12-12T00:00:00Z'), startTime: '18:00', endTime: '01:00', chargeRate: '18.00', staffNeeded: 1, roleNeeded: 'Bartender', seriesId: 'run1', endDate: new Date('2026-12-13T00:00:00Z') },
    { id: 'web-j2', reference: 'VJ-0003', clientId: 'web-c', title: 'Gala', venueName: 'Hackney Hall', date: new Date('2026-12-13T00:00:00Z'), startTime: '18:00', endTime: '01:00', chargeRate: '18.00', staffNeeded: 1, roleNeeded: 'Bartender', seriesId: 'run1', endDate: new Date('2026-12-13T00:00:00Z') },
  ] });
  await prisma.schedAssignment.createMany({ data: [
    { id: 'as1', jobId: 'j1', staffId: 's1', hours: '9.5', createdAt: at },
    { id: 'web-a', jobId: 'web-j1', staffId: 'web-s', hours: '7', rateOverride: '15.00' },
  ] });
  await prisma.schedLead.create({ data: { id: 'web-l', company: 'Shoreditch Arts', contactedOn: new Date('2026-10-02T00:00:00Z'), stage: 'REPLIED' } });
  await prisma.schedJobScheduleItem.create({ data: { jobId: 'web-j1', time: '17:30', title: 'Staff arrive' } });

  assert.equal(ok(await admin('GET', '/legacy-import/scheduling')).rows, 5, 'web client, person, two jobs and the lead');
  const preview = ok(await admin('POST', '/legacy-import', { source: 'scheduling' }));
  assert.equal(preview.committed, false);
  assert.equal(preview.counts.Job.created, 2);
  assert.equal(preview.counts.Job.skipped, 1, 'the job the backup already brought');
  assert.equal(await prisma.opsBooking.count(), 1, 'a preview writes nothing');

  const done = ok(await admin('POST', '/legacy-import', { source: 'scheduling', commit: true }));
  assert.equal(done.counts.Client.created, 1);
  assert.equal(done.counts.Staff.created, 1);
  assert.equal(done.counts.Assignment.created, 1);
  assert.equal(done.counts.Lead.created, 1);
  assert.equal(done.counts['Running order line'].created, 1);
  assert.equal(await prisma.opsBooking.count(), 3);
  const gala = await prisma.opsBooking.findFirstOrThrow({ where: { venue: 'Hackney Hall', eventDate: new Date('2026-12-12T00:00:00Z') }, include: { assignments: true, requirements: true } });
  assert.equal(gala.startTime, '18:00');
  assert.equal(Number(gala.requirements[0].clientChargeRate), 18);
  assert.equal(Number(gala.assignments[0].staffPayRate), 15, 'the rate the person was on');
  assert.equal(await prisma.auditLog.count({ where: { action: 'LEGACY_IMPORT', entityId: 'vergo_scheduling' } }), 1);

  assert.equal(ok(await admin('GET', '/legacy-import/scheduling')).rows, 0, 'nothing left to bring across');
  const again = ok(await admin('POST', '/legacy-import', { source: 'scheduling', commit: true }));
  assert.equal(Object.values(again.counts).reduce((n: number, c: any) => n + c.created + c.linked, 0), 0);
  assert.equal(await prisma.opsBooking.count(), 3);
});

test('a file that is not a desktop backup is refused', async () => {
  const res = await admin('POST', '/legacy-import', { sql: 'DROP TABLE "User";' });
  assert.equal(res.statusCode, 400);
});

test('a new booking with staff needed and more dates, then copied to another day', async () => {
  const client = ok(await admin('POST', '/clients', { companyName: 'Acme Events Ltd', contactName: 'Jo', email: 'acme@example.com', clientType: 'BUSINESS_HIRER', defaultChargeRate: 19.5 }), 201);
  assert.equal(Number(client.defaultChargeRate), 19.5);

  const created = ok(await admin('POST', '/bookings', {
    clientId: client.id, status: 'CONFIRMED', eventDate: '2026-11-06', startTime: '17:00', expectedFinish: '23:30', venue: 'Hall',
    requirement: { role: 'Waiting staff', quantity: 3, clientChargeRate: 19.5, workerPayRate: 13 },
    extraDates: ['2026-11-13', '2026-11-06', '2026-11-20'],
  }), 201);
  assert.deepEqual(created.copies.map((c: any) => c.eventDate), ['2026-11-13', '2026-11-20'], 'the first date is not doubled');
  const days = await prisma.opsBooking.findMany({ orderBy: { eventDate: 'asc' }, include: { requirements: true } });
  assert.equal(days.length, 3);
  for (const d of days) {
    assert.equal(d.status, 'CONFIRMED');
    assert.equal(d.requirements.length, 1);
    assert.equal(d.requirements[0].role, 'Waiting staff');
    assert.equal(Number(d.requirements[0].workerPayRate), 13);
    assert.equal(d.seriesId, null);
  }

  const copied = ok(await admin('POST', `/bookings/${created.id}/copy`, { dates: ['2026-11-27'] }), 201);
  assert.equal(copied.copies.length, 1);
  const copy = await prisma.opsBooking.findUniqueOrThrow({ where: { id: copied.copies[0].id }, include: { requirements: true, assignments: true } });
  assert.equal(copy.venue, 'Hall');
  assert.equal(copy.requirements[0].quantity, 3);
  assert.equal(copy.assignments.length, 0, 'staff are never copied');
});

test("a worker's page lists upcoming places still to fill, and their usual pay rate", async () => {
  const worker = ok(await admin('POST', '/workers', { firstName: 'Ana', lastName: 'Silva', email: 'ana@example.com', phone: '07700900000' }), 201);
  const updated = ok(await admin('PATCH', `/workers/${worker.id}`, { defaultPayRate: 14 }));
  assert.equal(updated.defaultPayRate, 14);

  const client = ok(await admin('POST', '/clients', { companyName: 'Acme Events Ltd', contactName: 'Jo', email: 'acme@example.com', clientType: 'BUSINESS_HIRER' }), 201);
  ok(await admin('POST', '/bookings', {
    clientId: client.id, status: 'CONFIRMED', eventDate: '2099-01-10', startTime: '09:00', expectedFinish: '17:00',
    requirement: { role: 'Bar staff', quantity: 2, clientChargeRate: 20, workerPayRate: 13 },
  }), 201);
  ok(await admin('POST', '/bookings', {
    clientId: client.id, status: 'CANCELLED', eventDate: '2099-01-11', startTime: '09:00', expectedFinish: '17:00',
    requirement: { role: 'Bar staff', quantity: 2, clientChargeRate: 20, workerPayRate: 13 },
  }), 201);

  const open = ok(await admin('GET', `/workers/${worker.id}/open-shifts`));
  assert.equal(open.length, 1, 'cancelled bookings are not offered');
  assert.equal(open[0].role, 'Bar staff');
  assert.equal(open[0].unfilled, 2);
});
