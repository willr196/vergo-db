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
const s3Service = require('../services/s3');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { presignUpload } = s3Service;
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

test('homepage includes canonical metadata and shared shell mounts', async () => {
  const res = await inject(app, { method: 'GET', url: '/' });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /<link rel="canonical" href="https:\/\/vergoltd\.com\/">/i);
  assert.match(res.body, /<meta name="theme-color" content="#0a0a0a">/i);
  assert.match(res.body, /id="site-header"/i);
  assert.match(res.body, /id="main-content"/i);
  assert.match(res.body, /footer role="contentinfo"/i);
  assert.match(res.body, /\/vergo-public-shell\.js/i);
});

test('applications presign does not fall back to local uploads in production by default', async () => {
  const envAny = env as any;
  const originalNodeEnv = envAny.nodeEnv;
  const originalS3Configured = envAny.s3Configured;
  const originalAllowLocalCvUploads = envAny.allowLocalCvUploads;

  envAny.nodeEnv = 'production';
  envAny.s3Configured = false;
  envAny.allowLocalCvUploads = false;

  try {
    const res = await inject(app, {
      method: 'POST',
      url: '/api/v1/applications/presign',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fileName: 'candidate-cv.pdf',
        fileType: 'application/pdf',
      }),
    });

    assert.equal(res.statusCode, 503);
    const body = JSON.parse(res.body || '{}') as any;
    assert.match(String(body.error || ''), /CV uploads are unavailable/i);
    assert.notEqual(body.code, 'DIRECT_UPLOAD_REQUIRED');
  } finally {
    envAny.nodeEnv = originalNodeEnv;
    envAny.s3Configured = originalS3Configured;
    envAny.allowLocalCvUploads = originalAllowLocalCvUploads;
  }
});

test('applications create accepts a verified local CV key', async () => {
  const prismaAny = prisma as any;
  const localApplicantId = 'c7d06490-0d67-46fc-9b3c-fbe8c687c5b4';
  const localCvKey = 'cv/local/2026/03/c7d06490-0d67-46fc-9b3c-fbe8c687c5b4/test-file.pdf';

  const originalFindVerification = prismaAny.fileUploadVerification.findUnique;
  const originalDeleteVerification = prismaAny.fileUploadVerification.delete;
  const originalApplicantUpsert = prismaAny.applicant.upsert;
  const originalApplicationCreate = prismaAny.application.create;

  const createCalls: any[] = [];

  prismaAny.fileUploadVerification.findUnique = async ({ where }: any) => ({
    key: where.key,
    applicantId: localApplicantId,
    verified: true,
    expiresAt: new Date(Date.now() + 60_000),
  });
  prismaAny.fileUploadVerification.delete = async () => ({ id: 'verification-1' });
  prismaAny.applicant.upsert = async () => ({ id: 'applicant-existing-1' });
  prismaAny.application.create = async (args: any) => {
    createCalls.push(args);
    return { id: 'application-1' };
  };

  try {
    const res = await inject(app, {
      method: 'POST',
      url: '/api/v1/applications',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        applicantId: localApplicantId,
        firstName: 'Casey',
        lastName: 'Applicant',
        email: 'casey@example.com',
        phone: '07123456789',
        roles: [{ role: 'Bartender', experienceLevel: '3-5 years' }],
        cvKey: localCvKey,
        cvOriginalName: 'casey-cv.pdf',
        cvFileSize: 2048,
        cvMimeType: 'application/pdf',
        source: 'website',
      }),
    });

    assert.equal(res.statusCode, 201);
    assert.equal(createCalls.length, 1);
    assert.equal(createCalls[0].data.cvKey, localCvKey);
  } finally {
    prismaAny.fileUploadVerification.findUnique = originalFindVerification;
    prismaAny.fileUploadVerification.delete = originalDeleteVerification;
    prismaAny.applicant.upsert = originalApplicantUpsert;
    prismaAny.application.create = originalApplicationCreate;
  }
});

test('applications direct-upload stores validated CVs in S3 when S3 is configured', async () => {
  const envAny = env as any;
  const prismaAny = prisma as any;
  const originalS3Configured = envAny.s3Configured;
  const originalAllowLocalCvUploads = envAny.allowLocalCvUploads;
  const originalUploadBuffer = s3Service.uploadBuffer;
  const originalVerificationCreate = prismaAny.fileUploadVerification.create;

  const uploadCalls: any[] = [];
  const verificationCalls: any[] = [];

  envAny.s3Configured = true;
  envAny.allowLocalCvUploads = false;
  s3Service.uploadBuffer = async (key: string, body: Buffer, contentType: string) => {
    uploadCalls.push({ key, body, contentType });
  };
  prismaAny.fileUploadVerification.create = async (args: any) => {
    verificationCalls.push(args);
    return { id: 'verification-1', ...args.data };
  };

  try {
    const pdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n', 'utf8');
    const res = await inject(app, {
      method: 'POST',
      url: '/api/v1/applications/direct-upload',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fileName: 'candidate-cv.pdf',
        fileType: 'application/pdf',
        contentBase64: pdfBuffer.toString('base64'),
      }),
    });

    assert.equal(res.statusCode, 200);
    assert.equal(uploadCalls.length, 1);
    assert.equal(uploadCalls[0].contentType, 'application/pdf');
    assert.match(String(uploadCalls[0].key || ''), /^cv\//);
    assert.deepEqual(uploadCalls[0].body, pdfBuffer);
    assert.equal(verificationCalls.length, 1);
    assert.equal(verificationCalls[0].data.verified, true);

    const body = JSON.parse(res.body || '{}') as any;
    assert.match(String(body.key || ''), /^cv\//);
    assert.equal(body.fileType, 'application/pdf');
  } finally {
    envAny.s3Configured = originalS3Configured;
    envAny.allowLocalCvUploads = originalAllowLocalCvUploads;
    s3Service.uploadBuffer = originalUploadBuffer;
    prismaAny.fileUploadVerification.create = originalVerificationCreate;
  }
});

test('applications direct-upload rejects disguised files when MIME sniffing fails', async () => {
  const envAny = env as any;
  const prismaAny = prisma as any;
  const originalS3Configured = envAny.s3Configured;
  const originalAllowLocalCvUploads = envAny.allowLocalCvUploads;
  const originalUploadBuffer = s3Service.uploadBuffer;
  const originalVerificationCreate = prismaAny.fileUploadVerification.create;

  let uploadAttempted = false;
  let verificationCreated = false;

  envAny.s3Configured = true;
  envAny.allowLocalCvUploads = false;
  s3Service.uploadBuffer = async () => {
    uploadAttempted = true;
  };
  prismaAny.fileUploadVerification.create = async () => {
    verificationCreated = true;
    return { id: 'verification-1' };
  };

  try {
    const fakePdfBuffer = Buffer.from('this is not a real PDF file', 'utf8');
    const res = await inject(app, {
      method: 'POST',
      url: '/api/v1/applications/direct-upload',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fileName: 'candidate-cv.pdf',
        fileType: 'application/octet-stream',
        contentBase64: fakePdfBuffer.toString('base64'),
      }),
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body || '{}') as any;
    assert.match(String(body.error || ''), /Invalid file type/i);
    assert.equal(uploadAttempted, false);
    assert.equal(verificationCreated, false);
  } finally {
    envAny.s3Configured = originalS3Configured;
    envAny.allowLocalCvUploads = originalAllowLocalCvUploads;
    s3Service.uploadBuffer = originalUploadBuffer;
    prismaAny.fileUploadVerification.create = originalVerificationCreate;
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
