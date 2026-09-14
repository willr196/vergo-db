'use strict';
//
// Usage (needs a running server and a seeded admin):
//   CHROME_BIN=/path/to/chrome BASE_URL=http://localhost:8099 //   SMOKE_ADMIN_USER=... SMOKE_ADMIN_PASS=... npm run check:csrf-browser
//
// Exits non-zero if an admin write from page context is rejected with 403,
// which is what happens if the fetch patch in admin-core.js stops working.
// Proves the browser half of the CSRF work: that admin-core.js's window.fetch
// patch fetches a token and attaches it to admin writes with no page-script
// changes. Reuses the CDP approach from apps/api/scripts/browser-smoke.js.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const BASE = process.env.BASE_URL || 'http://localhost:8099';
const USER = process.env.SMOKE_ADMIN_USER;
const PASS = process.env.SMOKE_ADMIN_PASS;
const CHROME = process.env.CHROME_BIN;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForDevTools(port) {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return await res.json();
    } catch {}
    await sleep(200);
  }
  throw new Error('Timed out waiting for Chrome DevTools');
}

function connectDevTools(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.onopen = () => resolve({
      send(method, params = {}) {
        const msg = { id: ++id, method, params };
        ws.send(JSON.stringify(msg));
        return new Promise((res, rej) => pending.set(msg.id, { res, rej, method }));
      },
      close() { ws.close(); },
    });
    ws.onerror = reject;
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (!msg.id || !pending.has(msg.id)) return;
      const entry = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? entry.rej(new Error(`${entry.method}: ${JSON.stringify(msg.error)}`)) : entry.res(msg.result);
    };
  });
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(`eval failed: ${JSON.stringify(result.exceptionDetails)}`);
  return result.result.value;
}

async function newPage(port, url) {
  const res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!res.ok) throw new Error(`debug page failed: ${res.status}`);
  return connectDevTools((await res.json()).webSocketDebuggerUrl);
}

(async () => {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vergo-csrf-check-'));
  const port = 9333;
  const child = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run',
    `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  let failed = false;
  try {
    await waitForDevTools(port);

    // 1. Log in through the real login page so we hold a genuine session cookie.
    const login = await newPage(port, `${BASE}/login`);
    await sleep(1200);
    const loginResult = await evaluate(login, `
      (async () => {
        const res = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ username: ${JSON.stringify(USER)}, password: ${JSON.stringify(PASS)} }),
        });
        return { status: res.status };
      })()
    `);
    console.log('1. admin login ->', loginResult.status);
    if (loginResult.status !== 200) throw new Error('login failed; cannot test CSRF');
    login.close();

    // 2. Load a real admin page so admin-core.js runs and patches window.fetch.
    const admin = await newPage(port, `${BASE}/admin.html`);
    await sleep(2500);

    const patched = await evaluate(admin, `String(window.fetch).includes('_csrfToken') || String(window.fetch).includes('MUTATING_METHODS') || !String(window.fetch).includes('[native code]')`);
    console.log('2. window.fetch patched by admin-core.js ->', patched);

    // 3. A mutating admin call made the way a page script makes it. If the patch
    //    works the token is attached for us and this never sees a 403.
    const write = await evaluate(admin, `
      (async () => {
        const res = await fetch('/api/v1/admin/bookings/nonexistent-id/status', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ status: 'CONFIRMED' }),
        });
        let body = null;
        try { body = await res.json(); } catch {}
        return { status: res.status, body };
      })()
    `);
    console.log('3. page-script admin write ->', write.status, JSON.stringify(write.body));

    if (write.status === 403) {
      console.log('\nRESULT: FAIL — the fetch patch did not attach a token; admin writes are broken in the browser.');
      failed = true;
    } else {
      console.log('\nRESULT: PASS — the write passed CSRF and reached route logic (403 would mean the patch failed).');
    }
    admin.close();
  } catch (err) {
    console.error('ERROR:', err.message);
    failed = true;
  } finally {
    child.kill();
    await sleep(300);
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
  process.exit(failed ? 1 : 0);
})();
