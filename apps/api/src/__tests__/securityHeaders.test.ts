import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Duplex } from 'node:stream';

function parseCsp(headerValue: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const parts = String(headerValue || '')
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    const tokens = part.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const directive = tokens[0];
    out[directive] = tokens.slice(1);
  }
  return out;
}

function setRequiredEnv() {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '0';

  // Required by src/env.ts (even if tests don't hit the DB/AWS).
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/vergo_test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-please-change';
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-secret-please-change';
  process.env.S3_REGION = process.env.S3_REGION || 'eu-west-2';
  process.env.S3_BUCKET = process.env.S3_BUCKET || 'vergo-test-bucket';
  process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || 'test';
  process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || 'test';
  process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_test';
  process.env.WEB_ORIGIN = process.env.WEB_ORIGIN || 'http://localhost:8080';
}

class MockSocket extends Duplex {
  public chunks: Buffer[] = [];
  public remoteAddress = '127.0.0.1';
  public encrypted = false;

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  _read() {}

  _write(chunk: any, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    callback(null);
  }
}

async function inject(app: any, opts: { method: string; url: string; headers?: Record<string, string> }) {
  const socket = new MockSocket();
  const req = new http.IncomingMessage(socket as any);
  req.method = opts.method;
  req.url = opts.url;
  req.headers = {};
  for (const [k, v] of Object.entries(opts.headers || {})) {
    req.headers[k.toLowerCase()] = v;
  }

  const res = new http.ServerResponse(req);
  res.assignSocket(socket as any);

  const result = await new Promise<{ statusCode: number; headers: http.OutgoingHttpHeaders; body: string }>((resolve, reject) => {
    res.on('finish', () => {
      const body = Buffer.concat(socket.chunks).toString('utf8');
      resolve({ statusCode: res.statusCode, headers: res.getHeaders(), body });
      socket.destroy();
    });
    res.on('error', reject);

    app.handle(req, res);
  });

  return result;
}

test('Security Headers Are Present', async () => {
  setRequiredEnv();
  // Import after env is set (src/env.ts reads process.env at import time).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { default: app } = require('../index');

  const res = await inject(app, { method: 'GET', url: '/health' });
  assert.equal(res.statusCode, 200);

  // Express fingerprinting
  assert.equal(res.headers['x-powered-by'], undefined);

  // Helmet
  assert.equal(res.headers['x-frame-options'], 'DENY');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');

  const csp = String(res.headers['content-security-policy'] || '');
  assert.ok(csp.includes("frame-ancestors 'none'"));
  const directives = parseCsp(csp);
  assert.ok(Array.isArray(directives['script-src']), 'CSP should include script-src');
  assert.ok(!directives['script-src'].includes("'unsafe-inline'"), "CSP script-src must not include 'unsafe-inline'");

  // Custom perf headers
  assert.equal(res.headers['x-dns-prefetch-control'], 'on');
});

test('CORS Does Not Reflect Arbitrary Origins', async () => {
  setRequiredEnv();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { default: app } = require('../index');

  const evilOrigin = 'http://evil.example';
  const res = await inject(app, { method: 'GET', url: '/health', headers: { Origin: evilOrigin } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['access-control-allow-origin'], undefined);

  const allowedOrigin = process.env.WEB_ORIGIN || 'http://localhost:8080';
  const res2 = await inject(app, { method: 'GET', url: '/health', headers: { Origin: allowedOrigin } });
  assert.equal(res2.statusCode, 200);
  assert.equal(res2.headers['access-control-allow-origin'], allowedOrigin);
  assert.equal(res2.headers['access-control-allow-credentials'], 'true');
});

test('Zod Validation Errors Return 400 (Not 500)', async () => {
  setRequiredEnv();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { default: app } = require('../index');

  // limit is capped at 100 in jobs list query validation.
  const res = await inject(app, { method: 'GET', url: '/api/v1/jobs?limit=101' });
  assert.equal(res.statusCode, 400);

  const body = JSON.parse(res.body.split('\r\n\r\n').pop() || '{}');
  assert.equal(body.error, 'Invalid request');
  assert.ok(Array.isArray(body.details));
});
