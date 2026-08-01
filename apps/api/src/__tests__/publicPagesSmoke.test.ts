import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Duplex } from 'node:stream';

function setRequiredEnv() {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '0';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/vergo_test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || '0123456789abcdef0123456789abcdef';
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fedcba9876543210fedcba9876543210';
  process.env.WEB_ORIGIN = process.env.WEB_ORIGIN || 'http://localhost:8080';
}

setRequiredEnv();
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { default: app } = require('../index');

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

async function inject(appInstance: any, opts: { method: string; url: string; headers?: Record<string, string> }) {
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

  return await new Promise<{ statusCode: number; headers: http.OutgoingHttpHeaders; body: string }>((resolve, reject) => {
    res.on('finish', () => {
      const raw = Buffer.concat(socket.chunks).toString('utf8');
      const body = raw.includes('\r\n\r\n') ? raw.split('\r\n\r\n').slice(1).join('\r\n\r\n') : raw;
      resolve({ statusCode: res.statusCode, headers: res.getHeaders(), body });
      socket.destroy();
    });
    res.on('error', reject);
    appInstance.handle(req, res);
    process.nextTick(() => req.emit('end'));
  });
}

test('legacy hire-us routes redirect permanently to hire', async () => {
  const res = await inject(app, { method: 'GET', url: '/hire-us' });

  assert.equal(res.statusCode, 301);
  assert.equal(res.headers.location, '/hire');
});

test('legacy hire-staff routes redirect permanently to hire', async () => {
  const res = await inject(app, { method: 'GET', url: '/hire-staff' });

  assert.equal(res.statusCode, 301);
  assert.equal(res.headers.location, '/hire');
});
