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
  process.env.S3_REGION = process.env.S3_REGION || 'eu-west-2';
  process.env.S3_BUCKET = process.env.S3_BUCKET || 'vergo-test-bucket';
  process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || 'test';
  process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || 'test';
}

setRequiredEnv();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require('express');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require('../prisma');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const applications = require('../routes/applications').default;
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

test('application submissions notify the admin inbox and send applicant confirmation without blocking creation', async () => {
  const prismaAny = prisma as any;
  const originalFindVerification = prismaAny.fileUploadVerification.findUnique;
  const originalDeleteVerification = prismaAny.fileUploadVerification.delete;
  const originalUpsertApplicant = prismaAny.applicant.upsert;
  const originalCreateApplication = prismaAny.application.create;
  const originalSendEmailOrThrow = senderModule.sendEmailOrThrow;
  const originalSendEmailSilent = senderModule.sendEmailSilent;

  const senderCalls = {
    critical: [] as any[],
    silent: [] as any[],
  };

  prismaAny.fileUploadVerification.findUnique = async ({ where }: any) => ({
    key: where.key,
    verified: true,
    applicantId: '11111111-1111-4111-8111-111111111111',
  });
  prismaAny.fileUploadVerification.delete = async () => ({});
  prismaAny.applicant.upsert = async () => ({
    id: 'applicant-1',
    firstName: 'Alice',
    lastName: 'Nguyen',
    email: 'alice@example.com',
  });
  prismaAny.application.create = async () => ({
    id: 'application-1',
    applicant: {
      id: 'applicant-1',
      firstName: 'Alice',
      lastName: 'Nguyen',
      email: 'alice@example.com',
    },
    roles: [
      {
        experienceLevel: 'Senior',
        role: { name: 'Bartender' },
      },
    ],
  });

  senderModule.sendEmailOrThrow = async (payload: any) => {
    senderCalls.critical.push(payload);
    return { id: 'email-admin', success: true };
  };
  senderModule.sendEmailSilent = async (payload: any) => {
    senderCalls.silent.push(payload);
    return { id: 'email-applicant', success: true };
  };

  const app = express();
  app.use(express.json());
  app.use('/api/v1/applications', applications);

  try {
    const response = await inject(app, {
      method: 'POST',
      url: '/api/v1/applications',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        applicantId: '11111111-1111-4111-8111-111111111111',
        firstName: 'Alice',
        lastName: 'Nguyen',
        email: 'alice@example.com',
        phone: '07123456789',
        rightToWorkUk: true,
        postcode: 'E1 6AN',
        dateOfBirth: '1995-06-15',
        roles: [{ role: 'Bartender', experienceLevel: 'Senior' }],
        cvKey: 'cv/alice-nguyen.pdf',
        cvOriginalName: 'alice-nguyen.pdf',
        cvFileSize: 2048,
        cvMimeType: 'application/pdf',
        source: 'website',
        yearsExperience: 6,
      }),
    });

    assert.equal(response.statusCode, 201);
    const body = JSON.parse(response.body || '{}') as any;
    assert.equal(body.ok, true);
    assert.equal(body.id, 'application-1');

    assert.equal(senderCalls.critical.length, 1);
    assert.equal(senderCalls.critical[0].to, 'wrobb@vergoltd.com');
    assert.equal(senderCalls.critical[0].subject, 'New Job Application - Alice Nguyen');
    assert.equal(senderCalls.critical[0].emailType, 'application-notification');
    assert.match(senderCalls.critical[0].html, /href="http:\/\/localhost:8080\/admin\?applicationId=application-1"/);
    assert.doesNotMatch(senderCalls.critical[0].html, /admin-job-applications/);

    assert.equal(senderCalls.silent.length, 1);
    assert.equal(senderCalls.silent[0].to, 'alice@example.com');
    assert.equal(senderCalls.silent[0].subject, 'Application Received - VERGO');
    assert.equal(senderCalls.silent[0].emailType, 'application-confirmation');
  } finally {
    prismaAny.fileUploadVerification.findUnique = originalFindVerification;
    prismaAny.fileUploadVerification.delete = originalDeleteVerification;
    prismaAny.applicant.upsert = originalUpsertApplicant;
    prismaAny.application.create = originalCreateApplication;
    senderModule.sendEmailOrThrow = originalSendEmailOrThrow;
    senderModule.sendEmailSilent = originalSendEmailSilent;
  }
});
