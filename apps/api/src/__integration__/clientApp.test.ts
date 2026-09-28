/**
 * The client side of the app, against a real database: request staff, see
 * the request, see a booking with the hours the worker recorded, and find
 * that changes go through the office rather than a cancel button.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  prisma,
  resetDatabase,
  disconnect,
  createClient,
  createWorker,
  createBooking,
  createClientApp,
  clientToken,
  inject,
} from './helpers';

const app = createClientApp();

test.beforeEach(async () => {
  await resetDatabase();
});

test.after(async () => {
  await disconnect();
});

test('a client request is saved with its date, and a nonsense date is a 400 not a 500', async () => {
  const client = await createClient();
  const auth = { authorization: `Bearer ${clientToken(client.id)}` };

  const created = await inject(app, {
    method: 'POST',
    url: '/api/v1/client/mobile/quotes',
    headers: auth,
    body: {
      eventType: 'Wedding',
      eventDate: '2026-11-14',
      location: 'Shoreditch',
      staffCount: 4,
      roles: 'Waiting staff, Bar staff',
      shiftStart: '17:00',
      shiftEnd: '23:30',
    },
  });
  assert.equal(created.statusCode, 201);

  const stored = await prisma.quoteRequest.findUniqueOrThrow({ where: { id: created.body.data.id } });
  assert.equal(stored.clientId, client.id);
  assert.equal(stored.status, 'NEW');
  assert.equal(stored.eventDate?.toISOString().slice(0, 10), '2026-11-14');

  const listed = await inject(app, { method: 'GET', url: '/api/v1/client/mobile/quotes', headers: auth });
  assert.equal(listed.statusCode, 200);
  assert.equal(listed.body.data.length, 1);

  const bad = await inject(app, {
    method: 'POST',
    url: '/api/v1/client/mobile/quotes',
    headers: auth,
    body: { eventType: 'Wedding', eventDate: 'next Saturday', location: 'Shoreditch', staffCount: 1, roles: 'Runners' },
  });
  assert.equal(bad.statusCode, 400);
  assert.equal(await prisma.quoteRequest.count(), 1);
});

test('a client sees the hours the worker recorded, and nothing of the worker\'s pay', async () => {
  const client = await createClient();
  const worker = await createWorker();
  const checkedInAt = new Date('2026-09-20T17:00:00Z');
  const checkedOutAt = new Date('2026-09-20T22:30:00Z');
  const booking = await createBooking({
    clientId: client.id,
    staffId: worker.id,
    status: 'CONFIRMED',
    checkedInAt,
    checkedOutAt,
    hoursWorked: 5.5,
  });

  const res = await inject(app, {
    method: 'GET',
    url: `/api/v1/client/mobile/bookings/${booking.id}`,
    headers: { authorization: `Bearer ${clientToken(client.id)}` },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.hoursWorked, 5.5);
  assert.equal(res.body.data.checkedInAt, checkedInAt.toISOString());
  assert.equal(res.body.data.checkedOutAt, checkedOutAt.toISOString());
  assert.equal(res.raw.includes('staffPayRate'), false);
});

test('cancelling from the app is refused and leaves the booking alone', async () => {
  const client = await createClient();
  const worker = await createWorker();
  const booking = await createBooking({ clientId: client.id, staffId: worker.id, status: 'CONFIRMED' });

  const res = await inject(app, {
    method: 'POST',
    url: `/api/v1/client/mobile/bookings/${booking.id}/cancel`,
    headers: { authorization: `Bearer ${clientToken(client.id)}` },
    body: { reason: 'Changed our minds' },
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'CANCEL_BY_CONTACT');

  const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
  assert.equal(after.status, 'CONFIRMED');
});

test('the app reads contact details, rates and terms from the site config', async () => {
  const client = await createClient();
  const res = await inject(app, {
    method: 'GET',
    url: '/api/v1/client/mobile/info',
    headers: { authorization: `Bearer ${clientToken(client.id)}` },
  });
  assert.equal(res.statusCode, 200);
  const { contact, rates, terms } = res.body.data;
  assert.match(contact.phone, /^\+44/);
  assert.match(contact.email, /@/);
  assert.match(rates.headline, /£/);
  assert.equal(typeof rates.minimumHours, 'number');
  assert.ok(terms.cancellation.length > 0);
  assert.ok(terms.confirmationPromise.length > 0);
});

test('the client routes refuse a request with no token', async () => {
  const res = await inject(app, { method: 'GET', url: '/api/v1/client/mobile/info', headers: {} });
  assert.equal(res.statusCode, 401);
});
