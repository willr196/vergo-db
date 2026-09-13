import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Duplex } from 'node:stream';

function setRequiredEnv() {
  process.env.NODE_ENV = 'test';
  // Must happen before the route module is required — it builds its Resend
  // client at import time. Without this a developer with a live key exported in
  // their shell mails the real VERGO inbox every time they run the suite.
  delete process.env.RESEND_API_KEY;
  process.env.PORT = '0';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/vergo_test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-please-change';
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-secret-please-change';
  process.env.WEB_ORIGIN = process.env.WEB_ORIGIN || 'http://localhost:8080';
}

setRequiredEnv();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require('express');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const quotes = require('../routes/quotes').default;

class MockSocket extends Duplex {
  public chunks: Buffer[] = [];
  public encrypted = false;

  constructor(public remoteAddress = '127.0.0.1') {
    super();
  }

  _read() {}

  _write(chunk: any, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    callback(null);
  }
}

async function inject(
  app: any,
  opts: { method: string; url: string; headers?: Record<string, string>; body?: string; ip?: string }
) {
  const socket = new MockSocket(opts.ip);
  const req = new http.IncomingMessage(socket as any);
  req.method = opts.method;
  req.url = opts.url;
  req.headers = {};
  for (const [k, v] of Object.entries(opts.headers || {})) {
    req.headers[k.toLowerCase()] = v;
  }

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
      if (body.length) {
        req.emit('data', body);
      }
      req.emit('end');
    });
  });
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/quotes', quotes);
  return app;
}

// The route rate-limits to five submissions per IP, so each case posts from its
// own address rather than burning through one bucket across the file.
let nextIp = 0;
function post(app: any, payload: Record<string, unknown>) {
  nextIp += 1;
  return inject(app, {
    method: 'POST',
    url: '/api/v1/quotes',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    ip: `10.0.0.${nextIp}`,
  });
}

const FULL_BOOKING = {
  intent: 'BOOKING',
  name: 'Sam Client',
  email: 'sam@example.com',
  phone: '07700900000',
  eventType: 'Wedding',
  eventDate: '2026-11-02',
  location: 'E1 6AN',
  shiftStart: '18:00',
  shiftEnd: '23:00',
  staffNeeded: 4,
  roles: ['Waiting staff'],
  estimatedTotal: 380,
};

test('a booking carrying the full brief is accepted', async () => {
  const response = await post(buildApp(), FULL_BOOKING);
  assert.equal(response.statusCode, 201);
  assert.equal(JSON.parse(response.body).ok, true);
});

test('a booking missing the contact details it needs to be staffed is rejected', async () => {
  const { name, email, ...withoutContact } = FULL_BOOKING;
  const response = await post(buildApp(), withoutContact);
  assert.equal(response.statusCode, 400);
});

test('an enquiry is accepted with nothing but an email address', async () => {
  const response = await post(buildApp(), {
    intent: 'ENQUIRY',
    email: 'curious@example.com',
    message: 'Do you cover Brighton?',
  });
  assert.equal(response.statusCode, 201);
  assert.equal(JSON.parse(response.body).ok, true);
});

test('an enquiry is accepted with nothing but a phone number', async () => {
  const response = await post(buildApp(), {
    intent: 'ENQUIRY',
    phone: '07700900123',
  });
  assert.equal(response.statusCode, 201);
});

test('an enquiry with no way of replying to it is rejected', async () => {
  const response = await post(buildApp(), {
    intent: 'ENQUIRY',
    message: 'Call me',
  });
  assert.equal(response.statusCode, 400);
});

test('a payload with no intent is still held to the booking rules', async () => {
  const response = await post(buildApp(), {
    name: 'Legacy Integration',
    email: 'legacy@example.com',
    phone: '07700900456',
    eventType: 'Corporate function',
    staffNeeded: 3,
  });
  assert.equal(response.statusCode, 201);

  const missingStaffCount = await post(buildApp(), {
    name: 'Legacy Integration',
    email: 'legacy@example.com',
    phone: '07700900456',
    eventType: 'Corporate function',
  });
  assert.equal(missingStaffCount.statusCode, 400);
});

test('a booking priced by role is accepted and totals its own headcount', async () => {
  const { staffNeeded, roles, ...withoutTotals } = FULL_BOOKING;
  const response = await post(buildApp(), {
    ...withoutTotals,
    staffByRole: [
      { role: 'Waiting staff', count: 3 },
      { role: 'Bar staff', count: 2 },
    ],
  });
  assert.equal(response.statusCode, 201);
  assert.equal(JSON.parse(response.body).ok, true);
});

test('a role breakdown with nothing usable in it leaves the booking short a headcount', async () => {
  const { staffNeeded, ...withoutCount } = FULL_BOOKING;
  const response = await post(buildApp(), {
    ...withoutCount,
    staffByRole: [{ role: '', count: 0 }],
  });
  assert.equal(response.statusCode, 400);
});

test('an overnight booking carries its next-day finish through', async () => {
  const response = await post(buildApp(), {
    ...FULL_BOOKING,
    shiftStart: '22:00',
    shiftEnd: '03:00',
    shiftEndsNextDay: true,
  });
  assert.equal(response.statusCode, 201);
  assert.equal(JSON.parse(response.body).ok, true);
});

test('the next-day flag is optional, and only a boolean will do', async () => {
  const sameDay = await post(buildApp(), FULL_BOOKING);
  assert.equal(sameDay.statusCode, 201);

  // The form sends a real boolean; a string sneaking in from an older
  // integration should not quietly read as "overnight".
  const stringly = await post(buildApp(), { ...FULL_BOOKING, shiftEndsNextDay: 'yes' });
  assert.equal(stringly.statusCode, 201);
});
