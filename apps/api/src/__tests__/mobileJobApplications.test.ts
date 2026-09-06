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
const { prisma } = require('../prisma');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mobileJobApplications = require('../routes/mobileJobApplications').default;
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
  app.use('/api/v1/mobile/job-applications', mobileJobApplications);
  return app;
}

function workerToken() {
  return signAccessToken({ sub: 'worker-1', type: 'user', email: 'worker@example.com' });
}

test('replaying an application with its original idempotency key returns the original application', async () => {
  const prismaAny = prisma as any;
  const originalFindApplication = prismaAny.jobApplication.findUnique;
  const originalFindJob = prismaAny.job.findUnique;
  const key = 'offline_apply_01hzy6s5gz4k8wjtz5bqg4v3w6';
  let findJobCalled = false;
  prismaAny.jobApplication.findUnique = async () => ({
    id: 'application-1',
    userId: 'worker-1',
    jobId: 'job-1',
    status: 'PENDING',
    applyIdempotencyKey: key,
  });
  prismaAny.job.findUnique = async () => { findJobCalled = true; return null; };

  try {
    const response = await inject(createApp(), {
      method: 'POST',
      url: '/api/v1/mobile/job-applications',
      headers: { authorization: `Bearer ${workerToken()}`, 'idempotency-key': key },
      body: JSON.stringify({ jobId: 'job-1' }),
    });
    assert.equal(response.statusCode, 200);
    assert.equal(findJobCalled, false);
    const body = JSON.parse(response.body);
    assert.equal(body.ok, true);
    assert.equal(body.idempotent, true);
    assert.equal(body.data.id, 'application-1');
  } finally {
    prismaAny.jobApplication.findUnique = originalFindApplication;
    prismaAny.job.findUnique = originalFindJob;
  }
});

test('withdrawing an already withdrawn owned application succeeds idempotently', async () => {
  const prismaAny = prisma as any;
  const originalFindApplication = prismaAny.jobApplication.findUnique;
  const originalUpdate = prismaAny.jobApplication.update;
  let updateCalled = false;
  prismaAny.jobApplication.findUnique = async () => ({
    id: 'application-1',
    userId: 'worker-1',
    status: 'WITHDRAWN',
    job: { title: 'Bar shift' },
  });
  prismaAny.jobApplication.update = async () => { updateCalled = true; };

  try {
    const response = await inject(createApp(), {
      method: 'POST',
      url: '/api/v1/mobile/job-applications/application-1/withdraw',
      headers: {
        authorization: `Bearer ${workerToken()}`,
        'idempotency-key': 'offline_withdraw_01hzy6s5gz4k8wjtz5bqg4v3w6',
      },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(updateCalled, false);
    const body = JSON.parse(response.body);
    assert.equal(body.ok, true);
    assert.equal(body.idempotent, true);
    assert.equal(body.data.status, 'WITHDRAWN');
  } finally {
    prismaAny.jobApplication.findUnique = originalFindApplication;
    prismaAny.jobApplication.update = originalUpdate;
  }
});
