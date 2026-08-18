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
  process.env.WEB_ORIGIN = process.env.WEB_ORIGIN || 'http://localhost:8080';
}

setRequiredEnv();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require('express');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require('../prisma');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const adminBookingsModule = require('../routes/adminBookings');
const adminBookings = adminBookingsModule.default;
const { buildQueue, STATUS_TRANSITIONS, isoWeekday, datesForWeekdays } = adminBookingsModule;

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
  if (body.length && !req.headers['content-length']) {
    req.headers['content-length'] = String(body.length);
  }

  const res = new http.ServerResponse(req);
  res.assignSocket(socket as any);

  return await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
    res.on('finish', () => {
      const raw = Buffer.concat(socket.chunks).toString('utf8');
      const parsedBody = raw.includes('\r\n\r\n') ? raw.split('\r\n\r\n').slice(1).join('\r\n\r\n') : raw;
      resolve({ statusCode: res.statusCode, body: parsedBody });
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

function createAdminApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    req.session = {
      isAdmin: true,
      username: 'admin',
      loginTime: Date.now(),
      lastActivity: Date.now(),
      destroy(callback: () => void) { callback(); },
    };
    next();
  });
  app.use('/api/v1/admin/bookings', adminBookings);
  return app;
}

test('buildQueue orders sections and omits empty ones', () => {
  const now = new Date('2026-08-18T12:00:00Z');
  const bookings = [
    { id: 'pending-1', status: 'PENDING', eventDate: new Date('2026-08-20'), invoicedAt: null, clientPaidAt: null, staffPaidAt: null },
    { id: 'confirmed-past', status: 'CONFIRMED', eventDate: new Date('2026-08-01'), invoicedAt: null, clientPaidAt: null, staffPaidAt: null },
    { id: 'confirmed-future', status: 'CONFIRMED', eventDate: new Date('2026-09-01'), invoicedAt: null, clientPaidAt: null, staffPaidAt: null },
    { id: 'completed-uninvoiced', status: 'COMPLETED', eventDate: new Date('2026-08-01'), invoicedAt: null, clientPaidAt: null, staffPaidAt: null },
    { id: 'invoiced-unpaid', status: 'COMPLETED', eventDate: new Date('2026-07-01'), invoicedAt: new Date('2026-07-15'), clientPaidAt: null, staffPaidAt: null },
    { id: 'client-paid', status: 'COMPLETED', eventDate: new Date('2026-06-01'), invoicedAt: new Date('2026-06-15'), clientPaidAt: new Date('2026-06-20'), staffPaidAt: null },
    { id: 'fully-settled', status: 'COMPLETED', eventDate: new Date('2026-05-01'), invoicedAt: new Date('2026-05-15'), clientPaidAt: new Date('2026-05-20'), staffPaidAt: new Date('2026-06-01') },
  ];

  const sections = buildQueue(bookings, [], now);
  const keys = sections.map((s: any) => s.key);

  assert.deepEqual(keys, ['staffNotConfirmed', 'logHours', 'sendInvoice', 'chasePayment', 'runPayroll']);
  assert.deepEqual(sections.find((s: any) => s.key === 'staffNotConfirmed')!.items.map((i: any) => i.id), ['pending-1']);
  assert.deepEqual(sections.find((s: any) => s.key === 'logHours')!.items.map((i: any) => i.id), ['confirmed-past']);
  assert.deepEqual(sections.find((s: any) => s.key === 'sendInvoice')!.items.map((i: any) => i.id), ['completed-uninvoiced']);
  assert.deepEqual(sections.find((s: any) => s.key === 'chasePayment')!.items.map((i: any) => i.id), ['invoiced-unpaid']);
  assert.deepEqual(sections.find((s: any) => s.key === 'runPayroll')!.items.map((i: any) => i.id), ['client-paid']);
  // fully-settled shows up nowhere, needsStaff/omitted entirely when empty
  assert.ok(!keys.includes('needsStaff'));
  for (const section of sections) {
    assert.ok(!section.items.some((i: any) => i.id === 'fully-settled'));
  }
});

test('buildQueue includes needsStaff only when a quote is understaffed', () => {
  const sections = buildQueue([], [
    { quoteRequestId: 'q1', eventType: 'Wedding', eventDate: null, staffed: 2, staffCount: 5 },
    { quoteRequestId: 'q2', eventType: 'Corporate', eventDate: null, staffed: 3, staffCount: 3 },
  ]);
  const needsStaff = sections.find((s: any) => s.key === 'needsStaff');
  assert.ok(needsStaff);
  assert.deepEqual(needsStaff!.items.map((i: any) => i.quoteRequestId), ['q1']);
});

test('STATUS_TRANSITIONS: PATCH /:id/status rejects an illegal transition with 409', async () => {
  const app = createAdminApp();
  const prismaAny = prisma as any;
  const originalFindUnique = prismaAny.booking.findUnique;
  prismaAny.booking.findUnique = async () => ({ id: 'b1', status: 'COMPLETED' });

  try {
    const res = await inject(app, {
      method: 'PATCH',
      url: '/api/v1/admin/bookings/b1/status',
      body: JSON.stringify({ status: 'CONFIRMED' }),
    });
    assert.equal(res.statusCode, 409);
    const body = JSON.parse(res.body);
    assert.equal(body.ok, false);
    assert.match(body.error, /Cannot move a booking from COMPLETED to CONFIRMED/);
  } finally {
    prismaAny.booking.findUnique = originalFindUnique;
  }
});

test('STATUS_TRANSITIONS: PATCH /:id/status allows a legal transition through', async () => {
  const app = createAdminApp();
  const prismaAny = prisma as any;
  const originalFindUnique = prismaAny.booking.findUnique;
  const originalUpdate = prismaAny.booking.update;
  const originalFindFirst = prismaAny.termsVersion.findFirst;

  prismaAny.booking.findUnique = async () => ({ id: 'b1', status: 'PENDING' });
  prismaAny.termsVersion.findFirst = async () => null;
  prismaAny.booking.update = async ({ data }: any) => ({
    id: 'b1',
    status: data.status,
    client: null,
    staff: { firstName: 'A', lastName: 'B' },
    quoteRequest: null,
  });

  try {
    const res = await inject(app, {
      method: 'PATCH',
      url: '/api/v1/admin/bookings/b1/status',
      body: JSON.stringify({ status: 'CONFIRMED' }),
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.ok, true);
    assert.equal(body.data.status, 'CONFIRMED');
  } finally {
    prismaAny.booking.findUnique = originalFindUnique;
    prismaAny.booking.update = originalUpdate;
    prismaAny.termsVersion.findFirst = originalFindFirst;
  }
});

test('POST / rejects a shift whose break is longer than the shift, before touching the database', async () => {
  const app = createAdminApp();
  const prismaAny = prisma as any;
  const originalFindUnique = prismaAny.client.findUnique;
  let clientLookupCalled = false;
  prismaAny.client.findUnique = async () => { clientLookupCalled = true; return null; };

  try {
    const res = await inject(app, {
      method: 'POST',
      url: '/api/v1/admin/bookings',
      body: JSON.stringify({
        clientId: 'c1', staffId: 's1', eventDate: '2026-09-01',
        location: 'Venue', shiftStart: '09:00', shiftEnd: '13:00', breakMins: 300,
        hourlyRateCharged: 19,
      }),
    });
    assert.equal(res.statusCode, 400);
    assert.match(res.body, /longer than the shift/);
    assert.equal(clientLookupCalled, false);
  } finally {
    prismaAny.client.findUnique = originalFindUnique;
  }
});

test('POST / falls back to the PricingTier rate when hourlyRateCharged is omitted', async () => {
  const app = createAdminApp();
  const prismaAny = prisma as any;
  const originalClient = prismaAny.client.findUnique;
  const originalUser = prismaAny.user.findUnique;
  const originalTier = prismaAny.pricingTier.findUnique;
  const originalCreate = prismaAny.booking.create;

  prismaAny.client.findUnique = async () => ({ id: 'c1', subscriptionTier: 'STANDARD' });
  prismaAny.user.findUnique = async () => ({ id: 's1', staffTier: 'STANDARD' });
  prismaAny.pricingTier.findUnique = async ({ where }: any) => {
    assert.deepEqual(where.clientTier_staffTier, { clientTier: 'STANDARD', staffTier: 'STANDARD' });
    return { hourlyRate: 19, staffPayRate: 12.5 };
  };
  let observedCreate: any = null;
  prismaAny.booking.create = async ({ data }: any) => {
    observedCreate = data;
    return { id: 'new-booking', ...data, client: null, staff: { firstName: 'A', lastName: 'B' } };
  };

  try {
    const res = await inject(app, {
      method: 'POST',
      url: '/api/v1/admin/bookings',
      body: JSON.stringify({
        clientId: 'c1', staffId: 's1', eventDate: '2026-09-01',
        location: 'Venue', shiftStart: '09:00', shiftEnd: '13:00',
      }),
    });
    assert.equal(res.statusCode, 201);
    assert.equal(Number(observedCreate.hourlyRateCharged), 19);
    assert.equal(Number(observedCreate.staffPayRate), 12.5);
    assert.equal(Number(observedCreate.hoursEstimated), 4);
  } finally {
    prismaAny.client.findUnique = originalClient;
    prismaAny.user.findUnique = originalUser;
    prismaAny.pricingTier.findUnique = originalTier;
    prismaAny.booking.create = originalCreate;
  }
});

test('isoWeekday maps Sunday to 7, not 0', () => {
  assert.equal(isoWeekday(new Date('2026-08-17T00:00:00Z')), 1); // Monday
  assert.equal(isoWeekday(new Date('2026-08-23T00:00:00Z')), 7); // Sunday
});

test('datesForWeekdays picks the matching days within a Mon-Sun window', () => {
  const weekStart = new Date('2026-08-17T00:00:00Z'); // a Monday
  const dates = datesForWeekdays(weekStart, [1, 3, 5]); // Mon, Wed, Fri
  assert.deepEqual(
    dates.map((d: Date) => d.toISOString().slice(0, 10)),
    ['2026-08-17', '2026-08-19', '2026-08-21']
  );
});

test('datesForWeekdays returns nothing for an empty weekday list', () => {
  assert.deepEqual(datesForWeekdays(new Date('2026-08-17'), []), []);
});

test('POST /templates/:id/generate is idempotent: re-running skips already-created days', async () => {
  const app = createAdminApp();
  const prismaAny = prisma as any;
  const originalFindUnique = prismaAny.bookingTemplate.findUnique;
  const originalTier = prismaAny.pricingTier.findUnique;
  const originalCreateMany = prismaAny.booking.createMany;

  prismaAny.bookingTemplate.findUnique = async () => ({
    id: 'tmpl-1',
    active: true,
    clientId: 'c1',
    staffId: 's1',
    name: 'Friday bar shift',
    role: 'Bartender',
    weekdays: [1, 5], // Mon, Fri
    shiftStart: '18:00',
    shiftEnd: '23:00',
    breakMins: 0,
    hourlyRateCharged: 19,
    staffPayRate: 12.5,
    bookingLane: 'FLEX',
    client: { id: 'c1', subscriptionTier: 'STANDARD' },
    staff: { id: 's1', staffTier: 'STANDARD' },
  });
  prismaAny.pricingTier.findUnique = async () => { throw new Error('should not be called — template has explicit rates'); };

  let observedRows: any[] = [];
  // First call: both days created. Second call: skipDuplicates means 0 created.
  let call = 0;
  prismaAny.booking.createMany = async ({ data }: any) => {
    call += 1;
    observedRows = data;
    return { count: call === 1 ? data.length : 0 };
  };

  try {
    const first = await inject(app, {
      method: 'POST',
      url: '/api/v1/admin/bookings/templates/tmpl-1/generate',
      body: JSON.stringify({ weekStarting: '2026-08-17' }),
    });
    assert.equal(first.statusCode, 200);
    const firstBody = JSON.parse(first.body);
    assert.equal(firstBody.data.requested, 2);
    assert.equal(firstBody.data.created, 2);
    assert.equal(firstBody.data.skippedAsAlreadyGenerated, 0);
    assert.equal(observedRows.length, 2);
    assert.equal(observedRows[0].templateId, 'tmpl-1');

    const second = await inject(app, {
      method: 'POST',
      url: '/api/v1/admin/bookings/templates/tmpl-1/generate',
      body: JSON.stringify({ weekStarting: '2026-08-17' }),
    });
    assert.equal(second.statusCode, 200);
    const secondBody = JSON.parse(second.body);
    assert.equal(secondBody.data.requested, 2);
    assert.equal(secondBody.data.created, 0);
    assert.equal(secondBody.data.skippedAsAlreadyGenerated, 2);
  } finally {
    prismaAny.bookingTemplate.findUnique = originalFindUnique;
    prismaAny.pricingTier.findUnique = originalTier;
    prismaAny.booking.createMany = originalCreateMany;
  }
});
