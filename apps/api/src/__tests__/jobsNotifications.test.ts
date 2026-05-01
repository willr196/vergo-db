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
  process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_test';
}

setRequiredEnv();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require('express');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require('../prisma');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const jobs = require('../routes/jobs').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const clientAuth = require('../routes/clientAuth').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const senderModule = require('../services/email/sender');

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

  const result = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
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

  return result;
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
      destroy(callback: () => void) {
        callback();
      },
    };
    next();
  });
  app.use('/api/v1/jobs', jobs);
  return app;
}

test('admin jobs list returns pending external submissions for the admin UI', async () => {
  const prismaAny = prisma as any;
  const originalFindMany = prismaAny.job.findMany;
  const originalCount = prismaAny.job.count;
  let receivedWhere: any = null;

  prismaAny.job.findMany = async ({ where }: any) => {
    receivedWhere = where;
    return [
      { id: 'job-external', title: 'Submitted role', status: 'PENDING', type: 'EXTERNAL', posterEmail: 'hire@example.com' },
    ];
  };
  prismaAny.job.count = async ({ where }: any) => {
    assert.equal(where.status, 'PENDING');
    return 1;
  };

  try {
    const response = await inject(createAdminApp(), {
      method: 'GET',
      url: '/api/v1/jobs/admin/list?status=PENDING',
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body || '{}') as any;
    assert.equal(body.ok, true);
    assert.equal(receivedWhere.status, 'PENDING');
    assert.equal(body.data.jobs[0].status, 'PENDING');
    assert.equal(body.data.pagination.total, 1);
  } finally {
    prismaAny.job.findMany = originalFindMany;
    prismaAny.job.count = originalCount;
  }
});

test('public job submissions create pending-review jobs, normalize email applications, and notify admin', async () => {
  const prismaAny = prisma as any;
  const originalFindRole = prismaAny.role.findUnique;
  const originalCreateJob = prismaAny.job.create;
  const originalSendEmailOrThrow = senderModule.sendEmailOrThrow;

  let createdData: any = null;
  const sentEmails: any[] = [];

  prismaAny.role.findUnique = async () => ({ id: 'role-1', name: 'Bartender' });
  prismaAny.job.create = async ({ data }: any) => {
    createdData = data;
    return { id: 'job-1', ...data, role: { id: 'role-1', name: 'Bartender' } };
  };
  senderModule.sendEmailOrThrow = async (payload: any) => {
    sentEmails.push(payload);
    return { id: 'email-1', success: true };
  };

  const app = express();
  app.use(express.json());
  app.use('/api/v1/jobs', jobs);

  try {
    const response = await inject(app, {
      method: 'POST',
      url: '/api/v1/jobs/submit',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        companyName: 'Acme Events',
        posterEmail: 'hiring@acme.test',
        title: 'Festival Bartender',
        roleId: 'role-1',
        location: 'London',
        description: 'Experienced bartenders needed for a multi-day festival activation.',
        payRateMin: 14,
        payRateMax: 16,
        payType: 'HOURLY',
        applyEmail: 'jobs@acme.test',
        confirm: true,
        website: '',
      }),
    });

    assert.equal(response.statusCode, 201);
    assert.equal(createdData.status, 'PENDING');
    assert.equal(createdData.type, 'EXTERNAL');
    assert.equal(createdData.posterEmail, 'hiring@acme.test');
    assert.equal(createdData.externalUrl, 'mailto:jobs@acme.test');
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].to, 'wrobb@vergoltd.com');
    assert.equal(sentEmails[0].replyTo, 'hiring@acme.test');
    assert.equal(sentEmails[0].subject, '📋 New Job Listing Submitted - Acme Events');
    assert.equal(sentEmails[0].emailType, 'job-submission-notification');
  } finally {
    prismaAny.role.findUnique = originalFindRole;
    prismaAny.job.create = originalCreateJob;
    senderModule.sendEmailOrThrow = originalSendEmailOrThrow;
  }
});

test('approving a pending external submission emails the original poster', async () => {
  const prismaAny = prisma as any;
  const originalFindJob = prismaAny.job.findUnique;
  const originalUpdateJob = prismaAny.job.update;
  const originalSendEmailOrThrow = senderModule.sendEmailOrThrow;

  const sentEmails: any[] = [];

  prismaAny.job.findUnique = async () => ({
    id: 'job-approve',
    title: 'Head Bartender',
    status: 'PENDING',
    type: 'EXTERNAL',
    posterEmail: 'hire@example.com',
  });
  prismaAny.job.update = async () => ({
    id: 'job-approve',
    status: 'OPEN',
    publishedAt: new Date(),
  });
  senderModule.sendEmailOrThrow = async (payload: any) => {
    sentEmails.push(payload);
    return { id: 'email-2', success: true };
  };

  try {
    const response = await inject(createAdminApp(), {
      method: 'POST',
      url: '/api/v1/jobs/job-approve/approve',
    });

    assert.equal(response.statusCode, 200);
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].to, 'hire@example.com');
    assert.equal(sentEmails[0].subject, 'Your job listing is now live on VERGO');
    assert.equal(sentEmails[0].emailType, 'job-approval');
  } finally {
    prismaAny.job.findUnique = originalFindJob;
    prismaAny.job.update = originalUpdateJob;
    senderModule.sendEmailOrThrow = originalSendEmailOrThrow;
  }
});

test('client registration notifies both the client and the admin inbox', async () => {
  const prismaAny = prisma as any;
  const originalFindClient = prismaAny.client.findUnique;
  const originalCreateClient = prismaAny.client.create;
  const originalSendEmailOrThrow = senderModule.sendEmailOrThrow;
  const sentEmails: any[] = [];

  prismaAny.client.findUnique = async () => null;
  prismaAny.client.create = async (args: any) => {
    assert.equal(args.data.website, 'https://acme.test');
    assert.equal(args.data.vatNumber, 'GB123456789');
    return { id: 'client-1' };
  };
  senderModule.sendEmailOrThrow = async (payload: any) => {
    sentEmails.push(payload);
    return { id: 'email-3', success: true };
  };

  const app = express();
  app.use(express.json());
  app.use('/api/v1/clients', clientAuth);

  try {
    const response = await inject(app, {
      method: 'POST',
      url: '/api/v1/clients/register',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        companyName: 'Acme Hospitality',
        industry: 'Events',
        website: 'https://acme.test',
        vatNumber: 'GB123456789',
        companySize: '11-50',
        contactName: 'Morgan Reed',
        email: 'morgan@acme.test',
        password: 'super-secure-password',
        phone: '07123456789',
        jobTitle: 'Hiring Manager',
      }),
    });

    assert.equal(response.statusCode, 201);
    assert.equal(sentEmails.length, 2);
    assert.equal(sentEmails[0].to, 'morgan@acme.test');
    assert.equal(sentEmails[0].subject, 'Verify your VERGO business account');
    assert.equal(sentEmails[0].emailType, 'client-verification');
    assert.equal(sentEmails[1].to, 'wrobb@vergoltd.com');
    assert.equal(sentEmails[1].replyTo, 'morgan@acme.test');
    assert.equal(sentEmails[1].subject, 'New client registration - Acme Hospitality');
    assert.equal(sentEmails[1].emailType, 'client-registration-notification');
  } finally {
    prismaAny.client.findUnique = originalFindClient;
    prismaAny.client.create = originalCreateClient;
    senderModule.sendEmailOrThrow = originalSendEmailOrThrow;
  }
});
