/**
 * The worker shift lifecycle, end to end, against a real database.
 *
 * This is the journey the whole MVP rests on: a worker is offered a shift,
 * confirms it, turns up, checks in, checks out, and the office sees the hours
 * and completes the booking. Every assertion here reads state back out of
 * Postgres rather than out of a mock.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  prisma,
  Prisma,
  resetDatabase,
  disconnect,
  createClient,
  createWorker,
  createBooking,
  createWorkerApp,
  createAdminApp,
  csrfHeaders,
  inject,
  workerToken,
} from './helpers';

const workerApp = createWorkerApp();
const adminApp = createAdminApp();

/** Today at midnight, so the shift sits inside the check-in window. */
function today(): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

async function seedShift(overrides: Record<string, unknown> = {}) {
  const client = await createClient();
  const worker = await createWorker();
  const booking = await createBooking({
    clientId: client.id,
    staffId: worker.id,
    eventDate: today(),
    ...overrides,
  });
  return { client, worker, booking };
}

test.beforeEach(async () => {
  await resetDatabase();
});

test.after(async () => {
  await disconnect();
});

test('a worker walks a shift from offer to recorded hours', async () => {
  const { worker, booking } = await seedShift();
  const auth = { authorization: `Bearer ${workerToken(worker.id)}` };

  // It shows up in the worker's upcoming list.
  const list = await inject(workerApp, {
    method: 'GET',
    url: '/api/v1/mobile/shifts?view=upcoming',
    headers: auth,
  });
  assert.equal(list.statusCode, 200);
  assert.equal(list.body.data.shifts.length, 1);
  assert.equal(list.body.data.shifts[0].id, booking.id);
  assert.equal(list.body.data.shifts[0].status, 'PENDING');

  // Confirming records the acceptance against the row.
  const confirm = await inject(workerApp, {
    method: 'POST',
    url: `/api/v1/mobile/shifts/${booking.id}/confirm`,
    headers: auth,
    body: { acceptedTerms: true },
  });
  assert.equal(confirm.statusCode, 200);

  const afterConfirm = await prisma.booking.findUnique({ where: { id: booking.id } });
  assert.equal(afterConfirm.status, 'CONFIRMED');
  assert.ok(afterConfirm.confirmedAt instanceof Date);
  assert.equal(afterConfirm.confirmedBy, `staff:${worker.id}`);

  // Check in.
  const checkIn = await inject(workerApp, {
    method: 'POST',
    url: `/api/v1/mobile/shifts/${booking.id}/check-in`,
    headers: auth,
  });
  assert.equal(checkIn.statusCode, 200);

  const afterCheckIn = await prisma.booking.findUnique({ where: { id: booking.id } });
  assert.ok(afterCheckIn.checkedInAt instanceof Date, 'checkedInAt must persist');
  assert.equal(afterCheckIn.checkedOutAt, null);
  assert.equal(afterCheckIn.status, 'CONFIRMED', 'check-in must not change status');

  // Pretend eight hours passed, so check-out has something to measure.
  const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000);
  await prisma.booking.update({
    where: { id: booking.id },
    data: { checkedInAt: eightHoursAgo },
  });

  const checkOut = await inject(workerApp, {
    method: 'POST',
    url: `/api/v1/mobile/shifts/${booking.id}/check-out`,
    headers: auth,
    body: { notes: 'Service overran by twenty minutes.' },
  });
  assert.equal(checkOut.statusCode, 200);

  const afterCheckOut = await prisma.booking.findUnique({ where: { id: booking.id } });
  assert.ok(afterCheckOut.checkedOutAt instanceof Date);
  // The Decimal(5,2) column must survive the round trip as a real number.
  assert.equal(Number(afterCheckOut.hoursWorked), 8);
  assert.equal(afterCheckOut.workerShiftNotes, 'Service overran by twenty minutes.');
  assert.equal(afterCheckOut.status, 'CONFIRMED', 'completion is the office\'s call');
  assert.equal(afterCheckOut.completedAt, null);
});

test('the office sees the shift in the timesheet queue and completes it', async () => {
  const { worker, booking } = await seedShift({ status: 'CONFIRMED' });
  const auth = { authorization: `Bearer ${workerToken(worker.id)}` };

  await inject(workerApp, {
    method: 'POST',
    url: `/api/v1/mobile/shifts/${booking.id}/check-in`,
    headers: auth,
  });
  await prisma.booking.update({
    where: { id: booking.id },
    data: { checkedInAt: new Date(Date.now() - 9.5 * 60 * 60 * 1000) },
  });
  await inject(workerApp, {
    method: 'POST',
    url: `/api/v1/mobile/shifts/${booking.id}/check-out`,
    headers: auth,
  });

  // Ready to complete: checked out, still CONFIRMED.
  const ready = await inject(adminApp, {
    method: 'GET',
    url: '/api/v1/admin/bookings/timesheets?filter=ready',
  });
  assert.equal(ready.statusCode, 200);
  assert.equal(ready.body.data.timesheets.length, 1);

  const row = ready.body.data.timesheets[0];
  assert.equal(row.id, booking.id);
  assert.equal(row.hoursWorked, 9.5);
  assert.equal(row.hoursEstimated, 8);
  assert.equal(row.hoursVariance, 1.5);
  assert.equal(row.needsReview, true, '1.5h over scheduled is worth a look');
  assert.equal(ready.body.data.summary.totalHoursWorked, 9.5);

  // Completing it writes the worked hours through to the invoice figures.
  const complete = await inject(adminApp, {
    method: 'POST',
    headers: csrfHeaders(),
    url: `/api/v1/admin/bookings/${booking.id}/complete`,
    body: {},
  });
  assert.equal(complete.statusCode, 200);

  const completed = await prisma.booking.findUnique({ where: { id: booking.id } });
  assert.equal(completed.status, 'COMPLETED');
  assert.ok(completed.completedAt instanceof Date);
  assert.equal(Number(completed.hoursEstimated), 9.5, 'worked hours become the billed hours');
  assert.equal(Number(completed.totalEstimated), 180.5, '9.5h at 19.00');
});

test('a short shift is invoiced at the four-hour minimum', async () => {
  const { worker, booking } = await seedShift({ status: 'CONFIRMED', hoursEstimated: 3 });
  const auth = { authorization: `Bearer ${workerToken(worker.id)}` };

  await inject(workerApp, {
    method: 'POST',
    url: `/api/v1/mobile/shifts/${booking.id}/check-in`,
    headers: auth,
  });
  await prisma.booking.update({
    where: { id: booking.id },
    data: { checkedInAt: new Date(Date.now() - 2.5 * 60 * 60 * 1000) },
  });
  await inject(workerApp, {
    method: 'POST',
    url: `/api/v1/mobile/shifts/${booking.id}/check-out`,
    headers: auth,
  });

  const completed = await inject(adminApp, {
    method: 'POST',
    headers: csrfHeaders(),
    url: `/api/v1/admin/bookings/${booking.id}/complete`,
    body: {},
  });
  assert.equal(completed.statusCode, 200);

  const row = await prisma.booking.findUnique({ where: { id: booking.id } });
  // The real hours are kept, so the timesheet still tells the truth.
  assert.equal(Number(row.hoursWorked), 2.5);
  assert.equal(Number(row.hoursEstimated), 2.5);
  // The money is floored at four hours: 4 x 19.00.
  assert.equal(Number(row.totalEstimated), 76);

  // And the money view agrees, on both sides of the transaction.
  const dashboard = await inject(adminApp, { method: 'GET', url: '/api/v1/admin/bookings/dashboard' });
  assert.equal(dashboard.statusCode, 200);
  const shaped = dashboard.body.data.bookings.find((b: any) => b.id === booking.id);
  assert.ok(shaped, 'the completed booking must appear in the dashboard');
  assert.equal(shaped.money.billableHours, 4);
  assert.equal(shaped.money.revenuePence, 7600);
  assert.equal(shaped.money.wagePence, 5200, '4h at 13.00, not 2.5h');
  // Holiday accrual is 12.07% of the floored wage, not of 2.5 hours' pay.
  assert.equal(shaped.money.onCostBreakdown.holidayPence, 628);
});

test('the office can correct a forgotten check-out without completing the booking', async () => {
  const { worker, booking } = await seedShift({ status: 'CONFIRMED' });
  const auth = { authorization: `Bearer ${workerToken(worker.id)}` };

  await inject(workerApp, {
    method: 'POST',
    url: `/api/v1/mobile/shifts/${booking.id}/check-in`,
    headers: auth,
  });

  // Still on site, which after the event date means a forgotten check-out.
  const open = await inject(adminApp, {
    method: 'GET',
    url: '/api/v1/admin/bookings/timesheets?filter=open',
  });
  assert.equal(open.body.data.timesheets.length, 1);
  assert.equal(open.body.data.timesheets[0].checkedOutAt, null);
  assert.equal(open.body.data.timesheets[0].needsReview, true);

  const checkedInAt = new Date(Date.now() - 8 * 60 * 60 * 1000);
  const checkedOutAt = new Date();
  const corrected = await inject(adminApp, {
    method: 'PATCH',
    headers: csrfHeaders(),
    url: `/api/v1/admin/bookings/${booking.id}/timesheet`,
    body: {
      checkedInAt: checkedInAt.toISOString(),
      checkedOutAt: checkedOutAt.toISOString(),
      hoursWorked: 7.75,
      adminNotes: 'Worker forgot to check out; times confirmed by phone.',
    },
  });
  assert.equal(corrected.statusCode, 200);

  const row = await prisma.booking.findUnique({ where: { id: booking.id } });
  assert.equal(Number(row.hoursWorked), 7.75);
  assert.ok(row.checkedOutAt instanceof Date);
  assert.equal(row.status, 'CONFIRMED', 'a correction must not complete the booking');
  assert.equal(row.completedAt, null);
  assert.match(row.adminNotes, /forgot to check out/);
});

test('a worker cannot touch another worker\'s shift', async () => {
  const { booking } = await seedShift({ status: 'CONFIRMED' });
  const intruder = await createWorker();
  const auth = { authorization: `Bearer ${workerToken(intruder.id)}` };

  for (const path of ['confirm', 'decline', 'check-in', 'check-out']) {
    const res = await inject(workerApp, {
      method: 'POST',
      url: `/api/v1/mobile/shifts/${booking.id}/${path}`,
      headers: auth,
      body: path === 'confirm' ? { acceptedTerms: true } : {},
    });
    assert.equal(res.statusCode, 404, `${path} must not leak another worker's shift`);
  }

  const list = await inject(workerApp, {
    method: 'GET',
    url: '/api/v1/mobile/shifts',
    headers: auth,
  });
  assert.equal(list.body.data.shifts.length, 0);

  const untouched = await prisma.booking.findUnique({ where: { id: booking.id } });
  assert.equal(untouched.checkedInAt, null);
  assert.equal(untouched.status, 'CONFIRMED');
});

test('check-in and check-out refuse to run twice or out of order', async () => {
  const { worker, booking } = await seedShift({ status: 'CONFIRMED' });
  const auth = { authorization: `Bearer ${workerToken(worker.id)}` };

  const outFirst = await inject(workerApp, {
    method: 'POST',
    url: `/api/v1/mobile/shifts/${booking.id}/check-out`,
    headers: auth,
  });
  assert.equal(outFirst.statusCode, 409);
  assert.match(outFirst.body.error, /check in before/);

  await inject(workerApp, {
    method: 'POST',
    url: `/api/v1/mobile/shifts/${booking.id}/check-in`,
    headers: auth,
  });
  const inAgain = await inject(workerApp, {
    method: 'POST',
    url: `/api/v1/mobile/shifts/${booking.id}/check-in`,
    headers: auth,
  });
  assert.equal(inAgain.statusCode, 409);
  assert.match(inAgain.body.error, /already checked in/);

  await inject(workerApp, {
    method: 'POST',
    url: `/api/v1/mobile/shifts/${booking.id}/check-out`,
    headers: auth,
  });
  const outAgain = await inject(workerApp, {
    method: 'POST',
    url: `/api/v1/mobile/shifts/${booking.id}/check-out`,
    headers: auth,
  });
  assert.equal(outAgain.statusCode, 409);
  assert.match(outAgain.body.error, /already checked out/);

  const row = await prisma.booking.findUnique({ where: { id: booking.id } });
  assert.ok(row.checkedInAt instanceof Date);
  assert.ok(row.checkedOutAt instanceof Date);
});

test('a forgotten check-out spanning a day is refused rather than written down', async () => {
  const { worker, booking } = await seedShift({ status: 'CONFIRMED' });
  const auth = { authorization: `Bearer ${workerToken(worker.id)}` };

  await inject(workerApp, {
    method: 'POST',
    url: `/api/v1/mobile/shifts/${booking.id}/check-in`,
    headers: auth,
  });
  await prisma.booking.update({
    where: { id: booking.id },
    data: { checkedInAt: new Date(Date.now() - 30 * 60 * 60 * 1000) },
  });

  const res = await inject(workerApp, {
    method: 'POST',
    url: `/api/v1/mobile/shifts/${booking.id}/check-out`,
    headers: auth,
  });
  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /Contact the office/);

  const row = await prisma.booking.findUnique({ where: { id: booking.id } });
  assert.equal(row.hoursWorked, null, 'nothing implausible reaches the timesheet');
  assert.equal(row.checkedOutAt, null);
});

test('a shift weeks away is not open for check-in', async () => {
  const future = new Date();
  future.setUTCDate(future.getUTCDate() + 21);
  future.setUTCHours(0, 0, 0, 0);

  const { worker, booking } = await seedShift({ status: 'CONFIRMED', eventDate: future });
  const auth = { authorization: `Bearer ${workerToken(worker.id)}` };

  const res = await inject(workerApp, {
    method: 'POST',
    url: `/api/v1/mobile/shifts/${booking.id}/check-in`,
    headers: auth,
  });
  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /not open for check-in/);

  const row = await prisma.booking.findUnique({ where: { id: booking.id } });
  assert.equal(row.checkedInAt, null);
});

test('declining a shift keeps the reason and leaves attendance untouched', async () => {
  const { worker, booking } = await seedShift();
  const auth = { authorization: `Bearer ${workerToken(worker.id)}` };

  const res = await inject(workerApp, {
    method: 'POST',
    url: `/api/v1/mobile/shifts/${booking.id}/decline`,
    headers: auth,
    body: { reason: 'I am unavailable that day.' },
  });
  assert.equal(res.statusCode, 200);

  const row = await prisma.booking.findUnique({ where: { id: booking.id } });
  assert.equal(row.status, 'REJECTED');
  assert.equal(row.rejectionReason, 'I am unavailable that day.');
  assert.equal(row.checkedInAt, null);

  // A declined shift is history, not upcoming.
  const upcoming = await inject(workerApp, {
    method: 'GET',
    url: '/api/v1/mobile/shifts?view=upcoming',
    headers: auth,
  });
  assert.equal(upcoming.body.data.shifts.length, 0);

  const history = await inject(workerApp, {
    method: 'GET',
    url: '/api/v1/mobile/shifts?view=history',
    headers: auth,
  });
  assert.equal(history.body.data.shifts.length, 1);
});

test('the timesheet variance filter only returns shifts worth a second look', async () => {
  const client = await createClient();
  const onTime = await createWorker();
  const overran = await createWorker();

  const a = await createBooking({
    clientId: client.id, staffId: onTime.id, eventDate: today(), status: 'CONFIRMED', hoursEstimated: 8,
  });
  const b = await createBooking({
    clientId: client.id, staffId: overran.id, eventDate: today(), status: 'CONFIRMED', hoursEstimated: 8,
  });

  await prisma.booking.update({
    where: { id: a.id },
    data: { checkedInAt: new Date(), checkedOutAt: new Date(), hoursWorked: new Prisma.Decimal(8.25) },
  });
  await prisma.booking.update({
    where: { id: b.id },
    data: { checkedInAt: new Date(), checkedOutAt: new Date(), hoursWorked: new Prisma.Decimal(12) },
  });

  const res = await inject(adminApp, {
    method: 'GET',
    url: '/api/v1/admin/bookings/timesheets?filter=variance',
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.timesheets.length, 1);
  assert.equal(res.body.data.timesheets[0].id, b.id);
  assert.equal(res.body.data.timesheets[0].hoursVariance, 4);
});
