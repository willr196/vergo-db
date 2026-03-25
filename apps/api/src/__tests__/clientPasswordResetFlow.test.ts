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

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/client', clientAuth);
  app.use('/api/v1/clients', clientAuth);
  return app;
}

test('client forgot-password route exists and sends the business password reset email', async () => {
  const prismaAny = prisma as any;
  const originalFindClient = prismaAny.client.findUnique;
  const originalUpdateClient = prismaAny.client.update;
  const originalSendEmailOrThrow = senderModule.sendEmailOrThrow;

  const sentEmails: any[] = [];
  let updatePayload: any = null;

  prismaAny.client.findUnique = async () => ({
    id: 'client-1',
    contactName: 'Morgan',
    companyName: 'Acme Hospitality',
  });
  prismaAny.client.update = async (args: any) => {
    updatePayload = args;
    return {};
  };
  senderModule.sendEmailOrThrow = async (payload: any) => {
    sentEmails.push(payload);
    return { id: 'email-client-reset', success: true };
  };

  try {
    const response = await inject(createApp(), {
      method: 'POST',
      url: '/api/v1/client/forgot-password',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'morgan@acme.test' }),
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body || '{}') as any;
    assert.equal(body.ok, true);
    assert.equal(updatePayload.where.id, 'client-1');
    assert.equal(typeof updatePayload.data.resetToken, 'string');
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].to, 'morgan@acme.test');
    assert.equal(sentEmails[0].subject, 'Reset your VERGO business account password');
    assert.equal(sentEmails[0].emailType, 'client-password-reset');
  } finally {
    prismaAny.client.findUnique = originalFindClient;
    prismaAny.client.update = originalUpdateClient;
    senderModule.sendEmailOrThrow = originalSendEmailOrThrow;
  }
});

test('client reset-password route clears reset tokens and returns success', async () => {
  const prismaAny = prisma as any;
  const originalFindFirst = prismaAny.client.findFirst;
  const originalUpdateClient = prismaAny.client.update;

  let updatePayload: any = null;
  prismaAny.client.findFirst = async () => ({
    id: 'client-1',
    email: 'morgan@acme.test',
  });
  prismaAny.client.update = async (args: any) => {
    updatePayload = args;
    return {};
  };

  try {
    const response = await inject(createApp(), {
      method: 'POST',
      url: '/api/v1/clients/reset-password',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: 'a'.repeat(64),
        password: 'new-super-secure-password',
      }),
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body || '{}') as any;
    assert.equal(body.ok, true);
    assert.equal(updatePayload.where.id, 'client-1');
    assert.equal(updatePayload.data.resetToken, null);
    assert.equal(updatePayload.data.resetTokenExp, null);
    assert.equal(updatePayload.data.failedAttempts, 0);
    assert.equal(updatePayload.data.lockedUntil, null);
    assert.equal(typeof updatePayload.data.passwordHash, 'string');
    assert.notEqual(updatePayload.data.passwordHash, 'new-super-secure-password');
  } finally {
    prismaAny.client.findFirst = originalFindFirst;
    prismaAny.client.update = originalUpdateClient;
  }
});
