/**
 * VERGO Scheduling and Admin > Jobs as one set of jobs, against a real
 * database: a run booked on the board becomes one draft listing whose days,
 * times and crew follow the board; people added from Admin land on the board
 * (with or without an app account); an internal job made in Admin goes onto
 * the board; and Admin cannot change what the board owns.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import { prisma, resetDatabase, disconnect, csrfHeaders, inject, createWorker } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ADMIN_TEST_SESSION_ID } = require('../testing/csrf');

function createApp() {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const scheduling = require('../scheduling').default;
  const jobs = require('../routes/jobs').default;
  const jobApplications = require('../routes/jobApplications').default;
  const cookieParser = require('cookie-parser');
  /* eslint-enable @typescript-eslint/no-var-requires */
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use((req: any, _res: any, next: any) => {
    req.session = { id: ADMIN_TEST_SESSION_ID, username: 'will', isAdmin: true };
    next();
  });
  app.use('/api/v1/scheduling', scheduling);
  app.use('/api/v1/jobs', jobs);
  app.use('/api/v1/job-applications', jobApplications);
  return app;
}

const app = createApp();
const call = (method: string, url: string, body?: unknown) =>
  inject(app, { method, url, headers: csrfHeaders(), body });
const ok = (res: { statusCode: number; body: any }, status = 200) => {
  assert.equal(res.statusCode, status, JSON.stringify(res.body).slice(0, 800));
  return res.body;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
const inDays = (n: number) => { const d = new Date(today); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

/** The Admin list, which brings itself up to date with the board first. */
async function adminJobs() {
  return ok(await call('GET', '/api/v1/jobs/admin/list?limit=100')).jobs as any[];
}

test.beforeEach(async () => {
  await resetDatabase();
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "sched_lead", "sched_job_schedule_item", "sched_assignment", "sched_job", "sched_staff", "sched_client" RESTART IDENTITY CASCADE');
  await prisma.role.upsert({ where: { name: 'Kitchen Porter' }, update: {}, create: { name: 'Kitchen Porter' } });
  await prisma.role.upsert({ where: { name: 'Bartender' }, update: {}, create: { name: 'Bartender' } });
});

test.after(async () => {
  await disconnect();
});

test('a run on the board is one draft listing that follows it, crew included', async () => {
  const client = ok(await call('POST', '/api/v1/scheduling/clients', { name: 'Popcorn Catering', defaultChargeRate: 18 }), 201);
  const worker = await createWorker({ firstName: 'Ana', lastName: 'Smith', email: 'ana@example.com' });
  const ana = ok(await call('POST', '/api/v1/scheduling/staff', { firstName: 'Ana', lastName: 'Smith', email: 'ANA@example.com', hourlyRate: '13.50' }), 201);

  const run = ok(await call('POST', '/api/v1/scheduling/jobs', {
    clientId: client.id, title: 'Studio lunch', venueName: 'Warner Bros Studio', date: inDays(2), endDate: inDays(4),
    startTime: '09:00', endTime: '17:00', chargeRate: '18.00', staffNeeded: 2, roleNeeded: 'kitchen porter',
  }), 201);
  assert.equal(run.run.created, 3);

  let [job, ...others] = await adminJobs();
  assert.equal(others.length, 0, 'one listing per run, not one per day');
  assert.equal(job.status, 'DRAFT', 'nothing reaches the app until it is published');
  assert.equal(job.schedSynced, true);
  assert.equal(job.title, 'Studio lunch');
  assert.equal(job.venue, 'Warner Bros Studio');
  assert.equal(job.companyName, 'Popcorn Catering');
  assert.equal(job.shiftStart, '09:00');
  assert.equal(job.role.name, 'Kitchen Porter', 'the free-text role finds its app role');
  assert.equal(job.staffing.dayCount, 3);
  assert.equal(job.staffing.slots, 6);
  assert.equal(job.scheduling.reference, run.reference);

  // Crew on the board: the person with a worker account is rostered in the app.
  const days = await prisma.schedJob.findMany({ where: { seriesId: run.run.seriesId }, orderBy: { date: 'asc' } });
  ok(await call('POST', `/api/v1/scheduling/jobs/${days[0].id}/crew`, { staffId: ana.id }), 201);
  await adminJobs();
  const rostered = await prisma.jobAssignment.findMany({ where: { userId: worker.id }, include: { jobDay: true } });
  assert.deepEqual(rostered.map((a) => iso(a.jobDay.date)), [inDays(2)]);

  // Re-timing the run and dropping a day both follow through.
  ok(await call('PATCH', `/api/v1/scheduling/jobs/${days[0].id}?applyToRun=true`, { startTime: '08:00' }));
  ok(await call('DELETE', `/api/v1/scheduling/jobs/${days[2].id}`));
  [job] = await adminJobs();
  assert.equal(job.shiftStart, '08:00');
  assert.equal(job.staffing.dayCount, 2);
  assert.equal(iso(new Date(job.eventEndDate)), inDays(3));

  // Taking them off the board takes them off the app.
  const crew = await prisma.schedAssignment.findFirstOrThrow({ where: { staffId: ana.id } });
  ok(await call('DELETE', `/api/v1/scheduling/crew/${crew.id}`));
  await adminJobs();
  assert.equal(await prisma.jobAssignment.count({ where: { userId: worker.id } }), 0);

  // Cancelling the rest of the run closes the listing.
  ok(await call('DELETE', `/api/v1/scheduling/jobs/${days[0].id}/run`));
  [job] = await adminJobs();
  assert.equal(job.status, 'CLOSED');
});

test('a run wholly in the past is history, not a listing', async () => {
  ok(await call('POST', '/api/v1/scheduling/jobs', {
    title: 'Last month', date: inDays(-30), startTime: '09:00', endTime: '17:00', chargeRate: '18',
  }), 201);
  assert.equal((await adminJobs()).length, 0);
});

test('Admin adds anyone: a worker, a Scheduling person, or a name typed in', async () => {
  const run = ok(await call('POST', '/api/v1/scheduling/jobs', {
    title: 'Gala', date: inDays(1), endDate: inDays(2), startTime: '18:00', endTime: '23:30', breakMinutes: 30, chargeRate: '22', staffNeeded: 3,
  }), 201);
  const [listing] = await adminJobs();

  // A typed-in person with no rate is refused, as on the board.
  const noRate = await call('POST', `/api/v1/jobs/admin/${listing.id}/people`, { firstName: 'Cal', lastName: 'Byrne' });
  assert.equal(noRate.statusCode, 422);
  assert.match(noRate.body.error, /no hourly rate/);

  assert.equal(await prisma.schedStaff.count({ where: { firstName: 'Cal' } }), 0, 'a refused person is not left behind');

  const cal = ok(await call('POST', `/api/v1/jobs/admin/${listing.id}/people`, { firstName: 'Cal', lastName: 'Byrne', hourlyRate: 14 }));
  assert.equal(await prisma.schedStaff.count({ where: { firstName: 'Cal' } }), 1, 'made once, when the rate came');
  assert.equal(cal.added, 2, 'every day to come');
  const onBoard = await prisma.schedAssignment.findMany({ where: { staffId: cal.staffId } });
  assert.equal(onBoard.length, 2);
  assert.equal(onBoard[0].hours.toString(), '5', 'hours from the board times, less the break');
  const calDay = cal.days.find((d: any) => d.date === inDays(1));
  assert.equal(calDay.assignments[0].userId, null, 'no app account needed');

  // A worker account on one day, at the job's hourly pay.
  ok(await call('PATCH', `/api/v1/jobs/${listing.id}`, { payRate: 15, payType: 'HOURLY' }));
  const worker = await createWorker({ firstName: 'Dee', lastName: 'Kaur' });
  ok(await call('POST', `/api/v1/jobs/admin/${listing.id}/people`, { userId: worker.id, dates: [inDays(2)] }));
  const dee = await prisma.schedStaff.findFirstOrThrow({ where: { email: worker.email } });
  assert.equal(dee.hourlyRate?.toString(), '15');
  assert.equal(await prisma.jobAssignment.count({ where: { userId: worker.id } }), 1);

  // The old per-day roster buttons go through the board too.
  const day1 = (await prisma.jobDay.findFirstOrThrow({ where: { jobId: listing.id, date: new Date(`${inDays(1)}T00:00:00Z`) } })).id;
  ok(await call('POST', `/api/v1/jobs/admin/${listing.id}/days/${day1}/assignments`, { userId: worker.id }));
  assert.equal(await prisma.schedAssignment.count({ where: { staffId: dee.id } }), 2);
  ok(await call('DELETE', `/api/v1/jobs/admin/${listing.id}/days/${day1}/assignments/${worker.id}`));
  assert.equal(await prisma.schedAssignment.count({ where: { staffId: dee.id } }), 1);

  // Removing from one day leaves the other.
  ok(await call('DELETE', `/api/v1/jobs/admin/${listing.id}/people/${cal.staffId}?date=${inDays(1)}`));
  assert.equal(await prisma.schedAssignment.count({ where: { staffId: cal.staffId } }), 1);

  // Search finds both kinds, once each.
  const found = ok(await call('GET', '/api/v1/jobs/admin/people/search?q=kaur')).people;
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, 'worker');

  // Headcount from the staffing screen lands on the board.
  ok(await call('PUT', `/api/v1/jobs/admin/${listing.id}/days`, { days: [{ date: inDays(1), staffNeeded: 4 }, { date: inDays(2), staffNeeded: 3 }] }));
  const first = await prisma.schedJob.findFirstOrThrow({ where: { seriesId: run.run.seriesId }, orderBy: { date: 'asc' } });
  assert.equal(first.staffNeeded, 4);
  const addDay = await call('PUT', `/api/v1/jobs/admin/${listing.id}/days`, { days: [{ date: inDays(9), staffNeeded: 1 }] });
  assert.equal(addDay.statusCode, 409, 'days come and go on the board');
});

test('Admin keeps the listing, the board keeps the work', async () => {
  ok(await call('POST', '/api/v1/scheduling/jobs', {
    title: 'Board title', venueName: 'Somewhere', date: inDays(5), startTime: '10:00', endTime: '16:00', chargeRate: '20',
  }), 201);
  const [listing] = await adminJobs();

  ok(await call('PATCH', `/api/v1/jobs/${listing.id}`, {
    title: 'Changed in Admin', venue: 'Elsewhere', shiftStart: '07:00',
    description: 'Serve lunch to the studio crew.', payRate: 14.5, payType: 'HOURLY',
  }));
  const [after] = await adminJobs();
  assert.equal(after.title, 'Board title', 'the board owns the title');
  assert.equal(after.venue, 'Somewhere');
  assert.equal(after.shiftStart, '10:00');
  assert.equal(after.description, 'Serve lunch to the studio crew.', 'Admin owns what workers read');
  assert.equal(Number(after.payRate), 14.5);

  ok(await call('PATCH', `/api/v1/jobs/${listing.id}/status`, { status: 'OPEN' }));
  assert.equal((await adminJobs())[0].status, 'OPEN', 'publishing is Admin\'s, and a sync leaves it be');

  const del = await call('DELETE', `/api/v1/jobs/${listing.id}`);
  assert.equal(del.statusCode, 409, 'it would only come back on the next sync');
});

test('an internal job made in Admin goes onto the board; an external one does not', async () => {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: 'Bartender' } });
  const worker = await createWorker({ firstName: 'Eli', lastName: 'Moss' });

  const internal = ok(await call('POST', '/api/v1/jobs', {
    title: 'Wedding bar', description: 'Bar service for a wedding of 120.', type: 'INTERNAL', status: 'DRAFT',
    location: 'Surrey', venue: 'Barn', eventDate: inDays(6), eventEndDate: inDays(7), shiftStart: '14:00', shiftEnd: '23:00',
    staffNeeded: 2, payRate: 13, payType: 'HOURLY', companyName: 'Happy Couple Ltd', roleId: role.id,
  }), 201).job;
  ok(await call('POST', '/api/v1/jobs', {
    title: 'Someone else\'s job', description: 'Listed for another company.', type: 'EXTERNAL', status: 'OPEN',
    location: 'London', eventDate: inDays(6), staffNeeded: 1, roleId: role.id,
  }), 201);

  const board = await prisma.schedJob.findMany({ where: { appJobId: internal.id }, include: { client: true }, orderBy: { date: 'asc' } });
  assert.equal(board.length, 2, 'one board day per job day');
  assert.equal(board[0].startTime, '14:00');
  assert.equal(board[0].client?.name, 'Happy Couple Ltd', 'the client is made on the board');
  assert.equal(board[0].chargeRate.toString(), '0');
  assert.match(board[0].notes ?? '', /Charge rate needed/);
  assert.ok(board[0].seriesId && board[0].seriesId === board[1].seriesId);
  assert.equal(await prisma.schedJob.count({ where: { appJobId: { not: internal.id } } }), 0);

  // From here it follows the board like any other.
  ok(await call('POST', `/api/v1/jobs/admin/${internal.id}/people`, { userId: worker.id }));
  assert.equal(await prisma.jobAssignment.count({ where: { userId: worker.id } }), 2);
  const listings = await adminJobs();
  assert.equal(listings.length, 2, 'pushing it did not make a second listing');
});

/** A worker who has passed vetting and a right-to-work check, as confirming requires. */
async function vettedWorker(firstName: string) {
  const email = `${firstName.toLowerCase()}-${Date.now()}@example.com`;
  const applicant = await prisma.applicant.create({
    data: {
      firstName, lastName: 'Vetted', email,
      applications: { create: { status: 'HIRED', cvKey: 'cv/test.pdf' } },
      rightToWorkChecks: { create: { method: 'DOCUMENT', outcome: 'PASS', checkedBy: 'will' } },
    },
  });
  return createWorker({ firstName, lastName: 'Vetted', email, applicantId: applicant.id });
}

test('confirming an application puts the worker on the board; un-confirming takes them off', async () => {
  const run = ok(await call('POST', '/api/v1/scheduling/jobs', {
    title: 'Conference', date: inDays(-1), endDate: inDays(2), startTime: '08:00', endTime: '16:00', chargeRate: '20', staffNeeded: 3,
  }), 201);
  const [listing] = await adminJobs();
  ok(await call('PATCH', `/api/v1/jobs/${listing.id}`, { payRate: 13.5, payType: 'HOURLY' }));

  const fay = await vettedWorker('Fay');
  const application = await prisma.jobApplication.create({ data: { jobId: listing.id, userId: fay.id } });
  const confirmed = ok(await call('PATCH', `/api/v1/job-applications/${application.id}/status`, { status: 'CONFIRMED', notifyApplicant: false }));
  assert.equal(confirmed.crewWarning, null);

  const staff = await prisma.schedStaff.findFirstOrThrow({ where: { email: fay.email } });
  assert.equal(staff.hourlyRate?.toString(), '13.5', "the job's hourly pay");
  const onDays = await prisma.schedAssignment.findMany({ where: { staffId: staff.id }, include: { job: true } });
  assert.deepEqual(onDays.map((a) => iso(a.job.date)).sort(), [inDays(0), inDays(1), inDays(2)], 'every day to come, not yesterday');
  assert.equal(await prisma.jobAssignment.count({ where: { userId: fay.id } }), 3);

  ok(await call('PATCH', `/api/v1/job-applications/${application.id}/status`, { status: 'REVIEWED', notifyApplicant: false }));
  assert.equal(await prisma.schedAssignment.count({ where: { staffId: staff.id } }), 0);
  assert.equal(await prisma.jobAssignment.count({ where: { userId: fay.id } }), 0);
  assert.equal(run.run.created, 4);
});

test('a confirm the board cannot take still stands, and says why', async () => {
  ok(await call('POST', '/api/v1/scheduling/jobs', {
    title: 'No pay set', date: inDays(3), startTime: '08:00', endTime: '16:00', chargeRate: '20', staffNeeded: 2,
  }), 201);
  const [listing] = await adminJobs();
  const gus = await vettedWorker('Gus');
  const application = await prisma.jobApplication.create({ data: { jobId: listing.id, userId: gus.id } });

  const res = ok(await call('PATCH', `/api/v1/job-applications/${application.id}/status`, { status: 'CONFIRMED', notifyApplicant: false }));
  assert.match(res.crewWarning, /no hourly rate/);
  assert.equal((await prisma.jobApplication.findUniqueOrThrow({ where: { id: application.id } })).status, 'CONFIRMED');
  assert.equal(await prisma.schedStaff.count({ where: { email: gus.email } }), 0, 'nobody half-made on the board');
});
