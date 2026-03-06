import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Duplex } from 'node:stream';

function setRequiredEnv() {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '0';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/vergo_test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-please-change';
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-secret-please-change';
  process.env.WEB_ORIGIN = process.env.WEB_ORIGIN || 'http://localhost:8080';
}

setRequiredEnv();
// Import after env is set.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { default: app } = require('../index');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require('../prisma');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { emailQueue } = require('../services/email/queue');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { env } = require('../env');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { logger } = require('../services/logger');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { presignUpload } = require('../services/s3');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sendEmail } = require('../services/email/sender');

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

async function inject(appInstance: any, opts: { method: string; url: string; headers?: Record<string, string>; body?: string }) {
  const socket = new MockSocket();
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

  const result = await new Promise<{ statusCode: number; headers: http.OutgoingHttpHeaders; body: string }>((resolve, reject) => {
    res.on('finish', () => {
      const raw = Buffer.concat(socket.chunks).toString('utf8');
      const parsedBody = raw.includes('\r\n\r\n') ? raw.split('\r\n\r\n').slice(1).join('\r\n\r\n') : raw;
      resolve({ statusCode: res.statusCode, headers: res.getHeaders(), body: parsedBody });
      socket.destroy();
    });
    res.on('error', reject);

    appInstance.handle(req, res);
    process.nextTick(() => {
      if (body.length) {
        req.emit('data', body);
      }
      req.emit('end');
    });
  });

  return result;
}

test('readyz returns degraded when only optional services are unavailable', async () => {
  const prismaAny = prisma as any;
  const emailQueueAny = emailQueue as any;
  const envAny = env as any;

  const originalQueryRaw = prismaAny.$queryRaw;
  const originalQueueAvailable = emailQueueAny.isAvailable;
  const originalEmailQueueEnabled = envAny.emailQueueEnabled;
  const originalRedisUrl = envAny.redisUrl;
  const originalS3Configured = envAny.s3Configured;
  const originalResendConfigured = envAny.resendConfigured;

  prismaAny.$queryRaw = async () => [{ ok: 1 }];
  emailQueueAny.isAvailable = () => true;
  envAny.emailQueueEnabled = false;
  envAny.redisUrl = undefined;
  envAny.s3Configured = false;
  envAny.resendConfigured = false;

  try {
    const res = await inject(app, { method: 'GET', url: '/readyz' });
    assert.equal(res.statusCode, 200);

    const body = JSON.parse(res.body || '{}') as any;
    assert.equal(body.ok, true);
    assert.equal(body.status, 'degraded');
    assert.equal(body.checks.database.status, 'ok');
    assert.equal(body.checks.emailQueue.status, 'disabled');
    assert.equal(body.checks.s3.status, 'degraded');
    assert.equal(body.checks.resend.status, 'degraded');
  } finally {
    prismaAny.$queryRaw = originalQueryRaw;
    emailQueueAny.isAvailable = originalQueueAvailable;
    envAny.emailQueueEnabled = originalEmailQueueEnabled;
    envAny.redisUrl = originalRedisUrl;
    envAny.s3Configured = originalS3Configured;
    envAny.resendConfigured = originalResendConfigured;
  }
});

test('readyz returns 503 when database is unavailable', async () => {
  const prismaAny = prisma as any;
  const envAny = env as any;

  const originalQueryRaw = prismaAny.$queryRaw;
  const originalEmailQueueEnabled = envAny.emailQueueEnabled;
  const originalS3Configured = envAny.s3Configured;
  const originalResendConfigured = envAny.resendConfigured;

  prismaAny.$queryRaw = async () => {
    throw new Error('db offline');
  };
  envAny.emailQueueEnabled = false;
  envAny.s3Configured = true;
  envAny.resendConfigured = true;

  try {
    const res = await inject(app, { method: 'GET', url: '/readyz' });
    assert.equal(res.statusCode, 503);

    const body = JSON.parse(res.body || '{}') as any;
    assert.equal(body.ok, false);
    assert.equal(body.status, 'not_ready');
    assert.equal(body.checks.database.status, 'error');
    assert.match(String(body.checks.database.detail || ''), /db offline/i);
  } finally {
    prismaAny.$queryRaw = originalQueryRaw;
    envAny.emailQueueEnabled = originalEmailQueueEnabled;
    envAny.s3Configured = originalS3Configured;
    envAny.resendConfigured = originalResendConfigured;
  }
});

test('webhook resend route is rate-limited and request-logged', async () => {
  const loggerAny = logger as any;
  const originalWarn = loggerAny.warn;
  const warnCalls: Array<{ data: any; msg: string }> = [];

  loggerAny.warn = (data: any, msg: string) => {
    warnCalls.push({ data, msg });
  };

  try {
    const first = await inject(app, { method: 'POST', url: '/api/v1/webhooks/resend' });
    const second = await inject(app, { method: 'POST', url: '/api/v1/webhooks/resend' });

    assert.equal(first.statusCode, 401);
    assert.equal(second.statusCode, 401);

    const firstRemaining = Number(first.headers['ratelimit-remaining']);
    const secondRemaining = Number(second.headers['ratelimit-remaining']);
    assert.ok(Number.isFinite(firstRemaining));
    assert.ok(Number.isFinite(secondRemaining));
    assert.ok(secondRemaining < firstRemaining);

    const loggedWebhookWarn = warnCalls.some(
      (entry) =>
        entry?.msg === 'Request warning' &&
        entry?.data?.url === '/api/v1/webhooks/resend' &&
        entry?.data?.statusCode === 401
    );
    assert.equal(loggedWebhookWarn, true);
  } finally {
    loggerAny.warn = originalWarn;
  }
});

test('presignUpload throws a clear error when S3 is not configured', async () => {
  const envAny = env as any;
  const originalS3Configured = envAny.s3Configured;

  envAny.s3Configured = false;
  try {
    await assert.rejects(
      async () => presignUpload('cv/test.pdf', 'application/pdf'),
      /S3 is not configured/i
    );
  } finally {
    envAny.s3Configured = originalS3Configured;
  }
});

test('sendEmail fails gracefully when Resend is not configured', async () => {
  const envAny = env as any;
  const originalResendApiKey = envAny.resendApiKey;

  envAny.resendApiKey = '';
  try {
    const result = await sendEmail({
      to: 'test@example.com',
      subject: 'Test',
      html: '<p>Hello</p>',
    });
    assert.equal(result.success, false);
    assert.match(String(result.error || ''), /RESEND_API_KEY missing/i);
  } finally {
    envAny.resendApiKey = originalResendApiKey;
  }
});
