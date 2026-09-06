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
const { Prisma } = require('@prisma/client');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require('../prisma');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mobileShifts = require('../routes/mobileShifts').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { signAccessToken } = require('../utils/jwt');

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
  if (body.length && !req.headers['content-length']) req.headers['content-length'] = String(body.length);

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

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/mobile/shifts', mobileShifts);
  return app;
}

function userToken(userId = 'staff-1') {
  return signAccessToken({ sub: userId, type: 'user', email: 'staff@example.com' });
}

test('mobile shifts require a worker token', async () => {
  const app = createApp();
  const clientToken = signAccessToken({ sub: 'client-1', type: 'client', email: 'client@example.com' });
  const res = await inject(app, {
    method: 'GET',
    url: '/api/v1/mobile/shifts',
    headers: { authorization: `Bearer ${clientToken}` },
  });

  assert.equal(res.statusCode, 401);
  assert.equal(JSON.parse(res.body).ok, false);
});

test('mobile shifts honour status pagination and return pagination metadata', async () => {
  const app = createApp();
  const prismaAny = prisma as any;
  const originalFindMany = prismaAny.booking.findMany;
  const originalCount = prismaAny.booking.count;
  let findManyArgs: any;
  prismaAny.booking.findMany = async (args: any) => {
    findManyArgs = args;
    return [];
  };
  prismaAny.booking.count = async () => 21;

  try {
    const res = await inject(app, {
      method: 'GET',
      url: '/api/v1/mobile/shifts?status=CONFIRMED&page=2&limit=20',
      headers: { authorization: `Bearer ${userToken()}` },
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(findManyArgs.where, { staffId: 'staff-1', status: 'CONFIRMED' });
    assert.equal(findManyArgs.skip, 20);
    assert.equal(findManyArgs.take, 20);
    const body = JSON.parse(res.body);
    assert.deepEqual(body.data.pagination, {
      page: 2,
      limit: 20,
      total: 21,
      totalPages: 2,
      hasMore: false,
    });
  } finally {
    prismaAny.booking.findMany = originalFindMany;
    prismaAny.booking.count = originalCount;
  }
});

test('mobile shifts history view keeps terminal and past shifts together in reverse date order', async () => {
  const app = createApp();
  const prismaAny = prisma as any;
  const originalFindMany = prismaAny.booking.findMany;
  const originalCount = prismaAny.booking.count;
  let findManyArgs: any;
  prismaAny.booking.findMany = async (args: any) => {
    findManyArgs = args;
    return [];
  };
  prismaAny.booking.count = async () => 0;

  try {
    const res = await inject(app, {
      method: 'GET',
      url: '/api/v1/mobile/shifts?view=history',
      headers: { authorization: `Bearer ${userToken()}` },
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(findManyArgs.orderBy, [{ eventDate: 'desc' }, { shiftStart: 'desc' }]);
    assert.equal(findManyArgs.where.staffId, 'staff-1');
    assert.equal(findManyArgs.where.OR.length, 2);
    assert.deepEqual(findManyArgs.where.OR[1], {
      status: { in: ['REJECTED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'] },
    });
  } finally {
    prismaAny.booking.findMany = originalFindMany;
    prismaAny.booking.count = originalCount;
  }
});

test('a worker cannot confirm another worker\'s shift', async () => {
  const app = createApp();
  const prismaAny = prisma as any;
  const originalFindFirst = prismaAny.booking.findFirst;
  const originalUpdate = prismaAny.booking.update;
  prismaAny.booking.findFirst = async () => null;
  let updateCalled = false;
  prismaAny.booking.update = async () => { updateCalled = true; };

  try {
    const res = await inject(app, {
      method: 'POST',
      url: '/api/v1/mobile/shifts/another-workers-shift/confirm',
      headers: { authorization: `Bearer ${userToken()}` },
      body: JSON.stringify({ acceptedTerms: true }),
    });
    assert.equal(res.statusCode, 404);
    assert.equal(updateCalled, false);
  } finally {
    prismaAny.booking.findFirst = originalFindFirst;
    prismaAny.booking.update = originalUpdate;
  }
});

test('a worker must explicitly accept terms before confirming a shift', async () => {
  const app = createApp();
  const prismaAny = prisma as any;
  const originalFindFirst = prismaAny.booking.findFirst;
  let lookupCalled = false;
  prismaAny.booking.findFirst = async () => { lookupCalled = true; return null; };

  try {
    const res = await inject(app, {
      method: 'POST',
      url: '/api/v1/mobile/shifts/shift-1/confirm',
      headers: { authorization: `Bearer ${userToken()}` },
      body: JSON.stringify({ acceptedTerms: false }),
    });
    assert.equal(res.statusCode, 400);
    assert.equal(lookupCalled, false);
  } finally {
    prismaAny.booking.findFirst = originalFindFirst;
  }
});

test('confirming an owned pending shift records terms and returns worker-safe shift data', async () => {
  const app = createApp();
  const prismaAny = prisma as any;
  const originalFindFirst = prismaAny.booking.findFirst;
  const originalUpdate = prismaAny.booking.update;
  const originalTerms = prismaAny.termsVersion.findFirst;
  const originalTokens = prismaAny.pushToken.findMany;
  const confirmedAt = new Date('2026-08-29T12:00:00.000Z');
  let updateData: any;

  prismaAny.booking.findFirst = async () => ({
    id: 'shift-1', status: 'PENDING', clientId: 'client-1', eventName: 'Summer Festival', eventDate: new Date('2026-09-01'),
  });
  prismaAny.termsVersion.findFirst = async () => ({ version: '2026-08' });
  prismaAny.pushToken.findMany = async () => [];
  prismaAny.booking.update = async ({ data }: any) => {
    updateData = data;
    return {
      id: 'shift-1', status: data.status, eventName: 'Summer Festival', eventDate: new Date('2026-09-01T00:00:00.000Z'),
      eventEndDate: null, location: 'London', venue: 'Victoria Park', shiftStart: '09:00', shiftEnd: '17:00',
      hoursEstimated: new Prisma.Decimal(8), staffPayRate: new Prisma.Decimal(15), clientNotes: 'Report to the site manager.',
      rejectionReason: null, confirmedAt, completedAt: null, createdAt: confirmedAt, updatedAt: confirmedAt,
      client: { id: 'client-1', companyName: 'Event Co', contactName: 'Jamie Smith' },
    };
  };

  try {
    const res = await inject(app, {
      method: 'POST',
      url: '/api/v1/mobile/shifts/shift-1/confirm',
      headers: { authorization: `Bearer ${userToken()}` },
      body: JSON.stringify({ acceptedTerms: true }),
    });
    assert.equal(res.statusCode, 200);
    assert.equal(updateData.status, 'CONFIRMED');
    assert.equal(updateData.confirmedBy, 'staff:staff-1');
    assert.equal(updateData.termsVersionAtConfirmation, '2026-08');
    const body = JSON.parse(res.body);
    assert.equal(body.data.expectedPay, 120);
    assert.equal(body.data.client.companyName, 'Event Co');
    assert.equal(body.data.staff, undefined);
  } finally {
    prismaAny.booking.findFirst = originalFindFirst;
    prismaAny.booking.update = originalUpdate;
    prismaAny.termsVersion.findFirst = originalTerms;
    prismaAny.pushToken.findMany = originalTokens;
  }
});

test('a worker can decline their pending shift with an optional client-facing reason', async () => {
  const app = createApp();
  const prismaAny = prisma as any;
  const originalFindFirst = prismaAny.booking.findFirst;
  const originalUpdate = prismaAny.booking.update;
  const originalTokens = prismaAny.pushToken.findMany;
  const updatedAt = new Date('2026-08-29T12:00:00.000Z');
  let updateData: any;

  prismaAny.booking.findFirst = async () => ({
    id: 'shift-1', status: 'PENDING', clientId: 'client-1', eventName: 'Summer Festival',
  });
  prismaAny.pushToken.findMany = async () => [];
  prismaAny.booking.update = async ({ data }: any) => {
    updateData = data;
    return {
      id: 'shift-1', status: data.status, eventName: 'Summer Festival', eventDate: new Date('2026-09-01T00:00:00.000Z'),
      eventEndDate: null, location: 'London', venue: 'Victoria Park', shiftStart: '09:00', shiftEnd: '17:00',
      hoursEstimated: new Prisma.Decimal(8), staffPayRate: new Prisma.Decimal(15), clientNotes: null,
      rejectionReason: data.rejectionReason, confirmedAt: null, completedAt: null, createdAt: updatedAt, updatedAt,
      client: { id: 'client-1', companyName: 'Event Co', contactName: 'Jamie Smith' },
    };
  };

  try {
    const res = await inject(app, {
      method: 'POST',
      url: '/api/v1/mobile/shifts/shift-1/decline',
      headers: { authorization: `Bearer ${userToken()}` },
      body: JSON.stringify({ reason: 'I am unavailable that day.' }),
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(updateData, { status: 'REJECTED', rejectionReason: 'I am unavailable that day.' });
    const body = JSON.parse(res.body);
    assert.equal(body.data.status, 'REJECTED');
    assert.equal(body.data.rejectionReason, 'I am unavailable that day.');
  } finally {
    prismaAny.booking.findFirst = originalFindFirst;
    prismaAny.booking.update = originalUpdate;
    prismaAny.pushToken.findMany = originalTokens;
  }
});
