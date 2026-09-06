import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Duplex } from 'node:stream';

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/vergo_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-please-change-123456';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-secret-please-change-123456';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require('express');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require('../prisma');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mobileClient = require('../routes/mobileClient').default;
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

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/client/mobile', mobileClient);
  return app;
}

function clientToken() {
  return signAccessToken({ sub: 'client-1', type: 'client', email: 'client@example.com' });
}

test('client rejection requires and persists applicant-visible feedback', async () => {
  const app = createApp();
  const prismaAny = prisma as any;
  const originalClientFindUnique = prismaAny.client.findUnique;
  const originalClientCount = prismaAny.client.count;
  const originalJobFindFirst = prismaAny.job.findFirst;
  const originalApplicationFindFirst = prismaAny.jobApplication.findFirst;
  const originalApplicationUpdate = prismaAny.jobApplication.update;
  const originalPushTokenFindMany = prismaAny.pushToken.findMany;
  let updateData: any;

  prismaAny.client.findUnique = async () => ({ id: 'client-1', companyName: 'Event Co' });
  prismaAny.client.count = async () => 1;
  prismaAny.job.findFirst = async () => ({ id: 'job-1' });
  prismaAny.jobApplication.findFirst = async () => ({ id: 'application-1', status: 'PENDING' });
  prismaAny.pushToken.findMany = async () => [];
  prismaAny.jobApplication.update = async ({ data }: any) => {
    updateData = data;
    return {
      id: 'application-1',
      jobId: 'job-1',
      userId: 'worker-1',
      status: 'REJECTED',
      coverNote: null,
      rejectionReason: data.rejectionReason,
      createdAt: new Date('2026-08-30T10:00:00.000Z'),
      updatedAt: new Date('2026-08-30T10:05:00.000Z'),
      user: { id: 'worker-1', firstName: 'Alex', lastName: 'Worker', email: 'alex@example.com', phone: null },
      job: { id: 'job-1', title: 'Festival shift' },
    };
  };

  try {
    const missingReason = await inject(app, {
      method: 'PUT',
      url: '/api/v1/client/mobile/jobs/job-1/applications/application-1/status',
      headers: { authorization: `Bearer ${clientToken()}` },
      body: JSON.stringify({ status: 'REJECTED' }),
    });
    assert.equal(missingReason.statusCode, 400);

    const response = await inject(app, {
      method: 'PUT',
      url: '/api/v1/client/mobile/jobs/job-1/applications/application-1/status',
      headers: { authorization: `Bearer ${clientToken()}` },
      body: JSON.stringify({ status: 'REJECTED', rejectionReason: 'The shift has been filled.' }),
    });
    assert.equal(response.statusCode, 200);
    assert.equal(updateData.rejectionReason, 'The shift has been filled.');
    assert.equal(JSON.parse(response.body).data.rejectionReason, 'The shift has been filled.');
  } finally {
    prismaAny.client.findUnique = originalClientFindUnique;
    prismaAny.client.count = originalClientCount;
    prismaAny.job.findFirst = originalJobFindFirst;
    prismaAny.jobApplication.findFirst = originalApplicationFindFirst;
    prismaAny.jobApplication.update = originalApplicationUpdate;
    prismaAny.pushToken.findMany = originalPushTokenFindMany;
  }
});
