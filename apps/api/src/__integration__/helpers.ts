/**
 * Integration test harness.
 *
 * Unlike the tests in src/__tests__, these run real Prisma queries against a
 * real Postgres. They exist because the mocked tests prove handler logic but
 * never prove that a query compiles, that a column exists, or that a Decimal
 * survives a round trip.
 *
 * The database is truncated between tests, so this must never be pointed at
 * anything but a throwaway. assertTestDatabase() enforces that.
 *
 *   docker compose -f infra/docker-compose.yml up -d db-test
 *   npm run test:integration
 */

const TEST_DB_URL = process.env.TEST_DATABASE_URL
  || 'postgresql://testuser:testpass@localhost:5434/vergo_test';

/**
 * Refuses to run against anything that is not an obviously disposable local
 * database. These tests truncate every table; being wrong here would be
 * expensive, and the cost of being wrong is what this whole file is about.
 */
export function assertTestDatabase(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`TEST_DATABASE_URL is not a URL: ${url}`);
  }

  const host = parsed.hostname;
  const database = parsed.pathname.replace(/^\//, '');
  const localHost = host === 'localhost' || host === '127.0.0.1' || host === '::1'
    || host === 'db-test' || /^172\.(1[6-9]|2\d|3[01])\./.test(host);

  if (!localHost) {
    throw new Error(`Refusing to run integration tests against a non-local host: ${host}`);
  }
  if (!/test/i.test(database)) {
    throw new Error(
      `Refusing to run integration tests against a database whose name does not contain "test": ${database}`
    );
  }
}

assertTestDatabase(TEST_DB_URL);

// Must be set before anything imports src/prisma.ts, which constructs the
// client at module load.
process.env.DATABASE_URL = TEST_DB_URL;
process.env.DIRECT_DATABASE_URL = TEST_DB_URL;
process.env.NODE_ENV = 'test';
process.env.PORT = process.env.PORT || '0';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-please-change-123456';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-secret-please-change-123456';

// Completing a booking fires a review-request email. Blanking the key makes the
// sender a no-op, so a test run cannot reach Resend. dotenv will not overwrite a
// key that is already present, even when it is empty, so setting it here wins
// over the value in .env.
process.env.RESEND_API_KEY = '';

import http from 'node:http';
import { Duplex } from 'node:stream';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require('express');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Prisma } = require('@prisma/client');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require('../prisma');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { signAccessToken } = require('../utils/jwt');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ADMIN_TEST_SESSION_ID, csrfHeaders } = require('../testing/csrf');
export { csrfHeaders };

export { prisma, Prisma, signAccessToken };

// Order matters: children before parents, so foreign keys never block a wipe.
const TABLES_IN_WIPE_ORDER = [
  'JobAssignment',
  'JobDay',
  'BookingReview',
  'Booking',
  'BookingTemplate',
  'SavedJob',
  'JobInvite',
  'JobApplication',
  'Job',
  'QuoteRequest',
  'PushToken',
  'RefreshToken',
  'Availability',
  'User',
  'Client',
];

export async function resetDatabase(): Promise<void> {
  const quoted = TABLES_IN_WIPE_ORDER.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}

// --- fixtures -------------------------------------------------------------

let counter = 0;
function unique(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

export async function createClient(overrides: Record<string, unknown> = {}) {
  return prisma.client.create({
    data: {
      companyName: 'Event Co',
      contactName: 'Jamie Smith',
      email: `${unique('client')}@example.com`,
      passwordHash: 'not-a-real-hash',
      status: 'APPROVED',
      subscriptionTier: 'STANDARD',
      subscriptionStatus: 'ACTIVE',
      ...overrides,
    },
  });
}

export async function createWorker(overrides: Record<string, unknown> = {}) {
  return prisma.user.create({
    data: {
      email: `${unique('worker')}@example.com`,
      passwordHash: 'not-a-real-hash',
      firstName: 'Alex',
      lastName: 'Doe',
      userType: 'JOB_SEEKER',
      staffTier: 'STANDARD',
      staffAvailable: true,
      niLiable: false,
      pensionEnrolled: false,
      ...overrides,
    },
  });
}

export interface BookingFixtureOptions {
  clientId: string;
  staffId: string;
  eventDate?: Date;
  status?: string;
  hoursEstimated?: number;
  hourlyRateCharged?: number;
  staffPayRate?: number;
  [key: string]: unknown;
}

export async function createBooking(options: BookingFixtureOptions) {
  const {
    clientId,
    staffId,
    eventDate = new Date(),
    status = 'PENDING',
    hoursEstimated = 8,
    hourlyRateCharged = 18.5,
    staffPayRate = 13,
    ...rest
  } = options;

  return prisma.booking.create({
    data: {
      status,
      eventName: 'Summer Festival',
      eventDate,
      location: 'London',
      venue: 'Victoria Park',
      shiftStart: '09:00',
      shiftEnd: '17:00',
      hoursEstimated: new Prisma.Decimal(hoursEstimated),
      clientTierAtBooking: 'STANDARD',
      staffTierAtBooking: 'STANDARD',
      hourlyRateCharged: new Prisma.Decimal(hourlyRateCharged),
      staffPayRate: new Prisma.Decimal(staffPayRate),
      totalEstimated: new Prisma.Decimal(hourlyRateCharged * hoursEstimated),
      clientId,
      staffId,
      ...rest,
    },
  });
}

// --- http -----------------------------------------------------------------

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

export interface InjectOptions {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface InjectResult {
  statusCode: number;
  body: any;
  raw: string;
}

export async function inject(app: any, opts: InjectOptions): Promise<InjectResult> {
  const socket = new MockSocket();
  const req = new http.IncomingMessage(socket as any);
  req.method = opts.method;
  req.url = opts.url;
  req.headers = { 'content-type': 'application/json', ...opts.headers };

  const bodyText = opts.body === undefined ? '' : JSON.stringify(opts.body);
  const bodyBuffer = Buffer.from(bodyText, 'utf8');
  if (bodyBuffer.length) req.headers['content-length'] = String(bodyBuffer.length);

  const res = new http.ServerResponse(req);
  res.assignSocket(socket as any);

  return await new Promise<InjectResult>((resolve, reject) => {
    res.on('finish', () => {
      const raw = Buffer.concat(socket.chunks).toString('utf8');
      const payload = raw.split('\r\n\r\n').slice(1).join('\r\n\r\n');
      let parsed: any = null;
      try {
        parsed = payload ? JSON.parse(payload) : null;
      } catch {
        parsed = payload;
      }
      resolve({ statusCode: res.statusCode, body: parsed, raw: payload });
      socket.destroy();
    });
    res.on('error', reject);
    app.handle(req, res);
    process.nextTick(() => {
      if (bodyBuffer.length) req.emit('data', bodyBuffer);
      req.emit('end');
    });
  });
}

/** The worker-facing shifts API, mounted the way index.ts mounts it. */
export function createWorkerApp() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mobileShifts = require('../routes/mobileShifts').default;
  const app = express();
  app.use(express.json());
  app.use('/api/v1/mobile/shifts', mobileShifts);
  return app;
}

/** The admin bookings API, with an authenticated session supplied directly. */
export function createAdminApp() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const adminBookings = require('../routes/adminBookings').default;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cookieParser = require('cookie-parser');
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use((req: any, _res: any, next: any) => {
    // id is what the CSRF token is bound to — see testing/csrf.ts
    req.session = { id: ADMIN_TEST_SESSION_ID, adminId: 'admin-1', adminEmail: 'admin@vergoltd.com', isAdmin: true };
    next();
  });
  app.use('/api/v1/admin/bookings', adminBookings);
  return app;
}

export function workerToken(userId: string) {
  return signAccessToken({ sub: userId, type: 'user', email: 'worker@example.com' });
}
