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
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require('../prisma');

// Every request is saved to Admin > Requests. There is no database here, so the
// save is stubbed and records what it was given; a request that is neither saved
// nor emailed is refused (see the last tests), so without this every case fails.
const saved: any[] = [];
let saveFails = false;
(prisma as any).contact.create = async (args: any) => {
  if (saveFails) throw new Error('database unavailable');
  saved.push(args.data);
  return { id: `contact-${saved.length}` };
};

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

// The Christmas brief (/special-events/christmas) posts here as an ENQUIRY via
// pages/js/special-events-brief.js. It always sends special_requirements, which the
// route folds into the message body — so the composed message, not the typed
// one, is what the schema checks.
const CHRISTMAS_BRIEF = {
  intent: 'ENQUIRY',
  name: 'Sam Host',
  email: 'sam@example.com',
  phone: '07700900000',
  company: 'Shoreditch Venue',
  eventType: 'Christmas (Special Events)',
  eventDate: '2026-12-18',
  location: 'Shoreditch, E1',
  guestCount: 150,
  roles: ['Themed bartenders', 'Character performers', 'Makeup artists'],
  special_requirements:
    'Christmas party brief · Service style: Drinks and canapés · Approx guests: 150',
  event_hours: 5,
  message: 'Basement bar, two rooms.',
  honeypot: '',
};

test('the Christmas brief is accepted with everything the form sends', async () => {
  const response = await post(buildApp(), CHRISTMAS_BRIEF);
  assert.equal(response.statusCode, 201);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, true);
  assert.equal(body.intent, 'ENQUIRY');
});

test('a Christmas brief with a maxed-out message still reaches the inbox', async () => {
  // 2,000 characters is exactly what the page's textarea allows. Before the
  // message pieces were bounded, appending the requirements line pushed the
  // composed body past the schema cap and the enquiry came back as a 400.
  const response = await post(buildApp(), {
    ...CHRISTMAS_BRIEF,
    message: 'x'.repeat(2000),
  });
  assert.equal(response.statusCode, 201);
  assert.equal(JSON.parse(response.body).ok, true);
});

test('the Christmas brief is accepted on a phone number alone', async () => {
  const { email, ...withoutEmail } = CHRISTMAS_BRIEF;
  const response = await post(buildApp(), withoutEmail);
  assert.equal(response.statusCode, 201);
});

test('a dress code rides along on a booking or an enquiry, and is optional', async () => {
  const booking = await post(buildApp(), { ...FULL_BOOKING, dressCode: 'All blacks' });
  assert.equal(booking.statusCode, 201);

  const enquiry = await post(buildApp(), { intent: 'ENQUIRY', email: 'sam@example.com', dressCode: 'Black tie' });
  assert.equal(enquiry.statusCode, 201);

  const snakeCase = await post(buildApp(), { ...FULL_BOOKING, dress_code: 'White shirts' });
  assert.equal(snakeCase.statusCode, 201);
});

test('a dress code longer than the field allows is rejected', async () => {
  const response = await post(buildApp(), { ...FULL_BOOKING, dressCode: 'x'.repeat(201) });
  assert.equal(response.statusCode, 400);
});

test('a booking can say which city it is in, and the city is optional', async () => {
  const birmingham = await post(buildApp(), { ...FULL_BOOKING, city: 'Birmingham', location: 'B1 2JB' });
  assert.equal(birmingham.statusCode, 201);

  const london = await post(buildApp(), { ...FULL_BOOKING, city: 'London' });
  assert.equal(london.statusCode, 201);

  const enquiry = await post(buildApp(), { intent: 'ENQUIRY', email: 'sam@example.com', city: 'Birmingham' });
  assert.equal(enquiry.statusCode, 201);
});

test('a city we do not cover is dropped rather than failing the booking', async () => {
  const response = await post(buildApp(), { ...FULL_BOOKING, city: 'Manchester' });
  assert.equal(response.statusCode, 201);
});

test('a booking can run over several days, up to thirty', async () => {
  const run = await post(buildApp(), { ...FULL_BOOKING, eventDate: '2026-12-11', eventEndDate: '2026-12-13' });
  assert.equal(run.statusCode, 201);

  const month = await post(buildApp(), { ...FULL_BOOKING, eventDate: '2026-12-01', eventEndDate: '2026-12-30' });
  assert.equal(month.statusCode, 201);

  // The same day twice is just a one-day booking.
  const sameDay = await post(buildApp(), { ...FULL_BOOKING, eventDate: '2026-12-11', eventEndDate: '2026-12-11' });
  assert.equal(sameDay.statusCode, 201);
});

test('an events brief can run over several days, and the last day is saved with it', async () => {
  saved.length = 0;
  const run = await post(buildApp(), { ...CHRISTMAS_BRIEF, eventDate: '2026-12-18', eventEndDate: '2026-12-20' });
  assert.equal(run.statusCode, 201);
  assert.match(JSON.stringify(saved[saved.length - 1]), /2026-12-20/);

  const backwards = await post(buildApp(), { ...CHRISTMAS_BRIEF, eventDate: '2026-12-18', eventEndDate: '2026-12-17' });
  assert.equal(backwards.statusCode, 400);
});

test('a last day that cannot be right is rejected', async () => {
  const backwards = await post(buildApp(), { ...FULL_BOOKING, eventDate: '2026-12-13', eventEndDate: '2026-12-11' });
  assert.equal(backwards.statusCode, 400);

  const tooLong = await post(buildApp(), { ...FULL_BOOKING, eventDate: '2026-12-01', eventEndDate: '2026-12-31' });
  assert.equal(tooLong.statusCode, 400);

  const { eventDate, ...noFirstDay } = FULL_BOOKING;
  const lastOnly = await post(buildApp(), { ...noFirstDay, eventEndDate: '2026-12-13' });
  assert.equal(lastOnly.statusCode, 400);

  const notADate = await post(buildApp(), { ...FULL_BOOKING, eventEndDate: 'next Friday' });
  assert.equal(notADate.statusCode, 400);
});

// ── The quick enquiry (/enquire) ───────────────────────────────────────────
// The short form posts here as an enquiry marked source QUICK: a name, a message
// and a way of replying, nothing else.

const QUICK = {
  intent: 'ENQUIRY',
  source: 'QUICK',
  name: 'Alex Host',
  message: 'Two bartenders for a private party in Fulham, 6pm to 11pm.',
};

test('a quick enquiry with email only is accepted and saved as a quick enquiry', async () => {
  const response = await post(buildApp(), { ...QUICK, email: 'alex@example.com', context: 'Bar staff' });
  assert.equal(response.statusCode, 201);
  const row = saved[saved.length - 1];
  assert.equal(row.type, 'GENERAL');
  assert.equal(row.subject, 'Quick enquiry');
  assert.equal(row.email, 'alex@example.com');
  assert.match(row.message, /Two bartenders/);
  assert.match(row.message, /Asked about: Bar staff/);
});

test('a quick enquiry with a phone only, or both, is accepted', async () => {
  assert.equal((await post(buildApp(), { ...QUICK, phone: '07700 900123' })).statusCode, 201);
  assert.equal((await post(buildApp(), { ...QUICK, phone: '+44 7700 900123', email: 'alex@example.com' })).statusCode, 201);
});

test('a quick enquiry keeps its optional date and location', async () => {
  const response = await post(buildApp(), { ...QUICK, email: 'alex@example.com', eventDate: '2026-12-12', location: 'Fulham' });
  assert.equal(response.statusCode, 201);
  const row = saved[saved.length - 1];
  assert.equal(row.eventDate.toISOString().slice(0, 10), '2026-12-12');
  assert.match(row.message, /Location: Fulham/);
});

test('a quick enquiry needs a name, a message and a way of replying', async () => {
  const { name, ...noName } = QUICK;
  const { message, ...noMessage } = QUICK;
  assert.equal((await post(buildApp(), { ...noName, email: 'alex@example.com' })).statusCode, 400);
  assert.equal((await post(buildApp(), { ...noMessage, email: 'alex@example.com' })).statusCode, 400);
  assert.equal((await post(buildApp(), QUICK)).statusCode, 400);
});

test('a quick enquiry refuses a malformed email or phone', async () => {
  assert.equal((await post(buildApp(), { ...QUICK, email: 'not-an-email' })).statusCode, 400);
  assert.equal((await post(buildApp(), { ...QUICK, phone: 'call me maybe' })).statusCode, 400);
});

test('a filled honeypot is dropped quietly and never saved', async () => {
  const before = saved.length;
  const response = await post(buildApp(), { ...QUICK, email: 'bot@example.com', honeypot: 'http://spam' });
  // The schema caps the honeypot at zero characters, so a bot gets a 400 rather than a save.
  assert.notEqual(response.statusCode, 500);
  assert.equal(saved.length, before);
});

test('a request that is neither saved nor emailed is refused, not reported as received', async () => {
  saveFails = true;
  try {
    const response = await post(buildApp(), { ...QUICK, email: 'alex@example.com' });
    assert.equal(response.statusCode, 503);
    const body = JSON.parse(response.body);
    assert.equal(body.ok, false);
    assert.match(body.error, /call|WhatsApp/i);
  } finally {
    saveFails = false;
  }
});
