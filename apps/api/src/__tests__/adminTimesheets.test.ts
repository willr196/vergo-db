import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Duplex } from 'node:stream';

function setRequiredEnv() {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '0';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/vergo_test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-please-change-123456';
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-secret-please-change-123456';
}

setRequiredEnv();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require('express');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cookieParser = require('cookie-parser');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ADMIN_TEST_SESSION_ID, csrfHeaders } = require('./helpers/csrf');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Prisma } = require('@prisma/client');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require('../prisma');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const adminBookings = require('../routes/adminBookings').default;

class MockSocket extends Duplex {
  public chunks: Buffer[] = [];
  public remoteAddress = '127.0.0.1';
  public encrypted = false;
  _read() {}
  _write(chunk: any, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    callback(null);
  }
}

async function inject(app: any, opts: { method: string; url: string; headers?: Record<string, string>; body?: string }) {
  const socket = new MockSocket();
  const req = new http.IncomingMessage(socket as any);
  req.method = opts.method;
  req.url = opts.url;
  req.headers = { 'content-type': 'application/json', ...opts.headers };
  const body = Buffer.from(opts.body || '', 'utf8');
  if (body.length) req.headers['content-length'] = String(body.length);

  const res = new http.ServerResponse(req);
  res.assignSocket(socket as any);
  return await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
    res.on('finish', () => {
      const raw = Buffer.concat(socket.chunks).toString('utf8');
      resolve({ statusCode: res.statusCode, body: raw.split('\r\n\r\n').slice(1).join('\r\n\r\n') });
      socket.destroy();
    });
    res.on('error', reject);
    app.handle(req, res);
    process.nextTick(() => {
      if (body.length) req.emit('data', body);
      req.emit('end');
    });
  });
}

// adminAuth reads the session, so the test app supplies an authenticated one
// rather than exercising the login flow.
function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use((req: any, _res: any, next: any) => {
    req.session = { id: ADMIN_TEST_SESSION_ID, adminId: 'admin-1', adminEmail: 'admin@vergoltd.com', isAdmin: true };
    next();
  });
  app.use('/api/v1/admin/bookings', adminBookings);
  return app;
}

function bookingRow(overrides: any = {}) {
  const eventDate = new Date('2026-09-01T00:00:00.000Z');
  return {
    id: 'booking-1', status: 'CONFIRMED', bookingLane: 'FLEX', eventName: 'Summer Festival',
    eventDate, eventEndDate: null, location: 'London', venue: 'Victoria Park',
    shiftStart: '09:00', shiftEnd: '17:00',
    hoursEstimated: new Prisma.Decimal(8), clientTierAtBooking: 'STANDARD', staffTierAtBooking: 'STANDARD',
    hourlyRateCharged: new Prisma.Decimal(19), staffPayRate: new Prisma.Decimal(13),
    totalEstimated: new Prisma.Decimal(152), clientNotes: null, adminNotes: null, rejectionReason: null,
    confirmedAt: eventDate, confirmedBy: 'staff:staff-1', completedAt: null,
    checkedInAt: new Date('2026-09-01T09:00:00.000Z'),
    checkedOutAt: new Date('2026-09-01T17:00:00.000Z'),
    hoursWorked: new Prisma.Decimal(8), workerShiftNotes: null,
    quoteRequestId: null, createdAt: eventDate, updatedAt: eventDate,
    client: {
      id: 'client-1', companyName: 'Event Co', contactName: 'Jamie Smith',
      email: 'jamie@example.com', subscriptionTier: 'STANDARD', subscriptionStatus: 'ACTIVE',
    },
    staff: {
      id: 'staff-1', firstName: 'Alex', lastName: 'Doe', email: 'alex@example.com', phone: null,
      staffTier: 'STANDARD', staffAvailable: true, staffRating: null, staffReviewCount: 0,
      staffBio: null, staffHighlights: [], niLiable: false, pensionEnrolled: false,
    },
    ...overrides,
  };
}

test('the timesheet list only returns shifts with a check-in', async () => {
  const app = createApp();
  const prismaAny = prisma as any;
  const original = prismaAny.booking.findMany;
  let findManyArgs: any;
  prismaAny.booking.findMany = async (args: any) => { findManyArgs = args; return []; };

  try {
    const res = await inject(app, { method: 'GET', url: '/api/v1/admin/bookings/timesheets' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(findManyArgs.where.checkedInAt, { not: null });
  } finally {
    prismaAny.booking.findMany = original;
  }
});

test('the open filter finds workers still checked in', async () => {
  const app = createApp();
  const prismaAny = prisma as any;
  const original = prismaAny.booking.findMany;
  let findManyArgs: any;
  prismaAny.booking.findMany = async (args: any) => { findManyArgs = args; return []; };

  try {
    await inject(app, { method: 'GET', url: '/api/v1/admin/bookings/timesheets?filter=open' });
    assert.equal(findManyArgs.where.checkedOutAt, null);
  } finally {
    prismaAny.booking.findMany = original;
  }
});

test('the ready filter finds checked-out shifts still waiting to be completed', async () => {
  const app = createApp();
  const prismaAny = prisma as any;
  const original = prismaAny.booking.findMany;
  let findManyArgs: any;
  prismaAny.booking.findMany = async (args: any) => { findManyArgs = args; return []; };

  try {
    await inject(app, { method: 'GET', url: '/api/v1/admin/bookings/timesheets?filter=ready' });
    assert.deepEqual(findManyArgs.where.checkedOutAt, { not: null });
    assert.equal(findManyArgs.where.status, 'CONFIRMED');
  } finally {
    prismaAny.booking.findMany = original;
  }
});

test('variance is computed against the scheduled hours and flags the material ones', async () => {
  const app = createApp();
  const prismaAny = prisma as any;
  const original = prismaAny.booking.findMany;
  prismaAny.booking.findMany = async () => [
    bookingRow({ id: 'on-time', hoursWorked: new Prisma.Decimal(8) }),
    bookingRow({ id: 'overran', hoursWorked: new Prisma.Decimal(10.5) }),
    bookingRow({ id: 'short', hoursWorked: new Prisma.Decimal(7.75) }),
  ];

  try {
    const res = await inject(app, { method: 'GET', url: '/api/v1/admin/bookings/timesheets' });
    const body = JSON.parse(res.body);
    const rows = body.data.timesheets;
    assert.equal(rows.find((r: any) => r.id === 'on-time').hoursVariance, 0);
    assert.equal(rows.find((r: any) => r.id === 'overran').hoursVariance, 2.5);
    assert.equal(rows.find((r: any) => r.id === 'short').hoursVariance, -0.25);
    assert.equal(rows.find((r: any) => r.id === 'overran').needsReview, true);
    assert.equal(rows.find((r: any) => r.id === 'short').needsReview, false);
    assert.equal(body.data.summary.varianceCount, 1);
    assert.equal(body.data.summary.totalHoursWorked, 26.25);
  } finally {
    prismaAny.booking.findMany = original;
  }
});

test('the variance filter returns only the shifts worth a second look', async () => {
  const app = createApp();
  const prismaAny = prisma as any;
  const original = prismaAny.booking.findMany;
  prismaAny.booking.findMany = async () => [
    bookingRow({ id: 'on-time', hoursWorked: new Prisma.Decimal(8) }),
    bookingRow({ id: 'overran', hoursWorked: new Prisma.Decimal(12) }),
  ];

  try {
    const res = await inject(app, { method: 'GET', url: '/api/v1/admin/bookings/timesheets?filter=variance' });
    const rows = JSON.parse(res.body).data.timesheets;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'overran');
  } finally {
    prismaAny.booking.findMany = original;
  }
});

test('a correction cannot put check-out before check-in', async () => {
  const app = createApp();
  const prismaAny = prisma as any;
  const original = prismaAny.booking.findUnique;
  prismaAny.booking.findUnique = async () => ({
    id: 'booking-1',
    checkedInAt: new Date('2026-09-01T09:00:00.000Z'),
    checkedOutAt: new Date('2026-09-01T17:00:00.000Z'),
  });

  try {
    const res = await inject(app, {
      method: 'PATCH',
      headers: csrfHeaders(),
      url: '/api/v1/admin/bookings/booking-1/timesheet',
      body: JSON.stringify({ checkedOutAt: '2026-09-01T08:00:00.000Z' }),
    });
    assert.equal(res.statusCode, 400);
    assert.match(JSON.parse(res.body).error, /cannot be before/);
  } finally {
    prismaAny.booking.findUnique = original;
  }
});

test('a correction writes attendance without completing the booking or touching the money', async () => {
  const app = createApp();
  const prismaAny = prisma as any;
  const originalFind = prismaAny.booking.findUnique;
  const originalUpdate = prismaAny.booking.update;
  let updateData: any;

  prismaAny.booking.findUnique = async () => ({
    id: 'booking-1',
    checkedInAt: new Date('2026-09-01T09:00:00.000Z'),
    checkedOutAt: null,
  });
  prismaAny.booking.update = async ({ data }: any) => {
    updateData = data;
    return bookingRow({ hoursWorked: data.hoursWorked, checkedOutAt: data.checkedOutAt });
  };

  try {
    const res = await inject(app, {
      method: 'PATCH',
      headers: csrfHeaders(),
      url: '/api/v1/admin/bookings/booking-1/timesheet',
      body: JSON.stringify({ checkedOutAt: '2026-09-01T18:30:00.000Z', hoursWorked: 9.5 }),
    });
    assert.equal(res.statusCode, 200);
    assert.equal(Number(updateData.hoursWorked), 9.5);
    assert.equal(updateData.status, undefined);
    assert.equal(updateData.completedAt, undefined);
    assert.equal(updateData.totalEstimated, undefined);
    assert.equal(updateData.hoursEstimated, undefined);
  } finally {
    prismaAny.booking.findUnique = originalFind;
    prismaAny.booking.update = originalUpdate;
  }
});

// The suites above all send a valid token, which would pass just as happily if the
// middleware were inert. Pin the negative case so a regression that drops CSRF is loud.
test('an admin write without a CSRF token is rejected with 403', async () => {
  const res = await inject(createApp(), {
    method: 'PATCH',
    url: '/api/v1/admin/bookings/booking-1/attendance',
    body: JSON.stringify({ checkInAt: '2026-09-01T09:00:00.000Z' }),
  });

  assert.equal(res.statusCode, 403);
  assert.equal(JSON.parse(res.body).code, 'CSRF_TOKEN_INVALID');
});
