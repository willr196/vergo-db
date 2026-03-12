import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Duplex } from 'node:stream';
import { enforceHttpsRedirect } from '../utils/httpsRedirect';

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

async function inject(app: any, opts: { method: string; url: string; headers?: Record<string, string> }) {
  const socket = new MockSocket();
  const req = new http.IncomingMessage(socket as any);
  req.method = opts.method;
  req.url = opts.url;
  req.headers = {};

  for (const [key, value] of Object.entries(opts.headers || {})) {
    req.headers[key.toLowerCase()] = value;
  }

  const res = new http.ServerResponse(req);
  res.assignSocket(socket as any);

  return new Promise<{ statusCode: number; headers: http.OutgoingHttpHeaders; body: string }>((resolve, reject) => {
    res.on('finish', () => {
      const body = Buffer.concat(socket.chunks).toString('utf8');
      resolve({ statusCode: res.statusCode, headers: res.getHeaders(), body });
      socket.destroy();
    });
    res.on('error', reject);
    app.handle(req, res);
  });
}

function createApp() {
  const app = express();
  app.use(enforceHttpsRedirect({
    nodeEnv: 'production',
    webOrigin: 'https://vergoltd.com',
    allowedHosts: ['vergo-app.fly.dev'],
  }));
  app.get('/health', (_req, res) => res.status(200).send('ok'));
  app.get('/jobs', (_req, res) => res.status(200).send('jobs'));
  return app;
}

test('enforceHttpsRedirect redirects insecure production requests to the same allowed host', async () => {
  const res = await inject(createApp(), {
    method: 'GET',
    url: '/jobs?campaign=spring',
    headers: {
      host: 'vergo-app.fly.dev',
      'x-forwarded-proto': 'http',
    },
  });

  assert.equal(res.statusCode, 308);
  assert.equal(res.headers.location, 'https://vergo-app.fly.dev/jobs?campaign=spring');
});

test('enforceHttpsRedirect bypasses health probes and already-secure requests', async () => {
  const app = createApp();

  const healthRes = await inject(app, {
    method: 'GET',
    url: '/health',
    headers: {
      host: 'vergoltd.com',
      'x-forwarded-proto': 'http',
    },
  });
  assert.equal(healthRes.statusCode, 200);

  const secureRes = await inject(app, {
    method: 'GET',
    url: '/jobs',
    headers: {
      host: 'vergoltd.com',
      'x-forwarded-proto': 'https',
    },
  });
  assert.equal(secureRes.statusCode, 200);
});
