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

  constructor() {
    // A stream's default 16KB highWaterMark applies backpressure once the
    // response passes it, and nothing here ever drains, so the write stalls
    // and the 'finish' inject() waits on never fires. A page only has to
    // outgrow 16KB for its test to hang rather than fail, which is what
    // happened when new JSON-LD pushed the CSP header up by ~530 bytes and
    // carried /hire/quote over the line. Buffer the whole response instead.
    super({ highWaterMark: 1024 * 1024 });
  }

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

test('retired rates page redirects permanently to hire', async () => {
  const res = await inject(app, { method: 'GET', url: '/rates' });

  assert.equal(res.statusCode, 301);
  assert.equal(res.headers.location, '/hire');
});

test('dead blog URLs return 410 Gone', async () => {
  const res1 = await inject(app, { method: 'GET', url: '/blog/event-staffing-costs-london-2024' });
  const res2 = await inject(app, { method: 'GET', url: '/blog/how-to-hire-bartenders-london' });

  assert.equal(res1.statusCode, 410);
  assert.equal(res2.statusCode, 410);
});

test('every legacy URL redirects in one hop to a page that serves', async () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { LEGACY_REDIRECTS } = require('../index') as { LEGACY_REDIRECTS: Record<string, string> };
  assert.ok(Object.keys(LEGACY_REDIRECTS).length > 0);

  for (const [from, to] of Object.entries(LEGACY_REDIRECTS)) {
    for (const url of [from, `${from}.html`]) {
      const res = await inject(app, { method: 'GET', url });
      assert.equal(res.statusCode, 301, `${url} should 301`);
      assert.equal(res.headers.location, to, `${url} should go to ${to}`);
    }

    const target = await inject(app, { method: 'GET', url: to });
    assert.equal(target.statusCode, 200, `${from} redirects to ${to}, which must serve 200 rather than hop again`);
  }
});

test('the old /apply URL goes to the worker application form', async () => {
  const res = await inject(app, { method: 'GET', url: '/apply' });
  assert.equal(res.statusCode, 301);
  assert.equal(res.headers.location, '/work/apply');
});

test('legacy redirects keep the query string', async () => {
  const res = await inject(app, { method: 'GET', url: '/user-login?verified=true' });
  assert.equal(res.statusCode, 301);
  assert.equal(res.headers.location, '/work?verified=true');
});

test('job links from old alert emails land on /work', async () => {
  const res = await inject(app, { method: 'GET', url: '/jobs/abc123' });
  assert.equal(res.statusCode, 301);
  assert.equal(res.headers.location, '/work');
});

test('pages link stylesheets and scripts by content hash, and those URLs cache for a year', async () => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  try {
    for (const page of ['/', '/hire', '/special-events/halloween']) {
      const html = await (await fetch(`http://127.0.0.1:${port}${page}`)).text();
      const css = html.match(/href="(\/vergo-site\.css\?v=[0-9a-f]{10})"/);
      assert.ok(css, `${page} links a versioned vergo-site.css`);
      assert.doesNotMatch(html, /fonts\.googleapis\.com/, `${page} no longer loads Google Fonts`);

      const res = await fetch(`http://127.0.0.1:${port}${css[1]}`);
      await res.arrayBuffer();
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    }

    const font = await fetch(`http://127.0.0.1:${port}/fonts/work-sans-latin.woff2`);
    await font.arrayBuffer();
    assert.equal(font.status, 200);
    assert.equal(font.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('stylesheets and scripts revalidate rather than cache for a week', async () => {
  // A real server: static files stream, and the mock socket above never sees
  // the stream finish.
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  try {
    for (const url of ['/vergo-site.css', '/vergo-site-config.js']) {
      const res = await fetch(`http://127.0.0.1:${port}${url}`);
      await res.arrayBuffer();
      assert.equal(res.status, 200, url);
      assert.equal(res.headers.get('cache-control'), 'public, no-cache', url);
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('pages revalidate on every view, and only vergoltd.com is indexable', async () => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  try {
    const base = `http://127.0.0.1:${port}`;
    const page = await fetch(`${base}/`, { headers: { 'x-forwarded-host': 'vergoltd.com' } });
    const html = await page.text();
    assert.equal(page.headers.get('cache-control'), 'public, max-age=0, s-maxage=60, stale-while-revalidate=30');
    assert.equal(page.headers.get('x-robots-tag'), null, 'the real domain stays indexable');
    const img = html.match(/src="(\/images\/[^"]+\?v=[0-9a-f]{10})"/);
    assert.ok(img, "the homepage logo is versioned");
    {
      const res = await fetch(base + img[1]);
      await res.arrayBuffer();
      assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    }

    const origin = await fetch(`${base}/hire`, { headers: { 'x-forwarded-host': 'vergo-app.fly.dev' } });
    await origin.text();
    assert.equal(origin.headers.get('x-robots-tag'), 'noindex');

    const admin = await fetch(`${base}/admin.html`, { headers: { 'x-forwarded-host': 'vergoltd.com' }, redirect: 'manual' });
    await admin.arrayBuffer();
    assert.equal(admin.headers.get('x-robots-tag'), 'noindex');

    for (const file of ['/sitemap.xml', '/robots.txt']) {
      const res = await fetch(base + file);
      await res.arrayBuffer();
      assert.equal(res.headers.get('cache-control'), 'public, max-age=300', file);
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
