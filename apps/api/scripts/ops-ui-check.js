'use strict';
//
// Opens every VERGO Ops screen in headless Chrome, as a logged-in admin, and
// fails if any of them throws a script error, shows "Could not load this
// page", or gets an error back from the Ops API. Then opens each worker, each
// client and the bookings one by one, and checks the main screens again at
// phone width for sideways scrolling.
//
// Read-only by default: it never presses a button that writes, so it is safe
// on any database you can log in to (still, point it at local or a demo one).
//
// OPS_UI_WRITE=1 adds a write pass, for a local demo database only
// (npm run seed:ops-demo): every edit form (worker, client, booking,
// requirement, lead, payment, direct hire, settings) is saved unchanged and
// must succeed.
//
// Usage (server running, an admin account on it):
//   OPS_ADMIN_USER=... OPS_ADMIN_PASS=... BASE_URL=http://127.0.0.1:4310 npm run check:ops-ui
// Optional: CHROME_BIN (defaults to the usual Windows / macOS / Linux paths),
//           OPS_UI_DETAIL_LIMIT (bookings to open one by one, default 12).
//
// The API allows 120 requests a minute per IP, so pages are opened at a steady
// pace; a 429 is reported as the limiter, not as a page bug.

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:4310').replace(/\/$/, '');
const USER = process.env.OPS_ADMIN_USER;
const PASS = process.env.OPS_ADMIN_PASS;
const DETAIL_LIMIT = Number(process.env.OPS_UI_DETAIL_LIMIT || 12);
const WRITE = process.env.OPS_UI_WRITE === '1';
const CHROME = process.env.CHROME_BIN || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => fs.existsSync(p));

const SCREENS = [
  'dashboard', 'workers', 'workers?ready=not_ready', 'rtw', 'clients', 'bookings', 'bookings?status=INVOICED', 'bookings?view=calendar',
  'rota', 'leads', 'timesheets', 'documents', 'documents?tab=workers', 'documents?tab=clients', 'documents?tab=templates',
  'documents?tab=versions', 'documents?tab=outstanding', 'awr', 'direct-hire', 'payroll', 'exports', 'audit', 'settings', 'import',
];
const PHONE_SCREENS = ['dashboard', 'workers', 'bookings', 'timesheets'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevTools(port) {
  for (let i = 0; i < 75; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return;
    } catch {}
    await sleep(200);
  }
  throw new Error('Chrome did not open its debugging port');
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const listeners = [];
    ws.onopen = () => resolve({
      send(method, params = {}) {
        const msg = { id: ++id, method, params };
        ws.send(JSON.stringify(msg));
        return new Promise((res, rej) => pending.set(msg.id, { res, rej, method }));
      },
      on(fn) { listeners.push(fn); },
      close() { ws.close(); },
    });
    ws.onerror = reject;
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.rej(new Error(`${p.method}: ${JSON.stringify(msg.error)}`)); else p.res(msg.result);
      } else if (msg.method) {
        listeners.forEach((fn) => fn(msg));
      }
    };
  });
}

async function evaluate(page, expression) {
  const r = await page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(`eval failed: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
  return r.result.value;
}

(async () => {
  if (!USER || !PASS) {
    console.error('Set OPS_ADMIN_USER and OPS_ADMIN_PASS (an admin login on BASE_URL).');
    process.exit(2);
  }
  if (!CHROME) {
    console.error('Chrome not found. Set CHROME_BIN.');
    process.exit(2);
  }

  const profile = await fsp.mkdtemp(path.join(os.tmpdir(), 'vergo-ops-ui-'));
  const port = 9400 + Math.floor(Math.random() * 400);
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${port}`, `--user-data-dir=${path.resolve(profile)}`, 'about:blank',
  ], { stdio: 'ignore' });

  const problems = [];
  const notes = [];
  let current = '(login)';

  try {
    await waitForDevTools(port);
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`${BASE}/login`)}`, { method: 'PUT' })).json();
    const page = await connect(target.webSocketDebuggerUrl);
    await page.send('Runtime.enable');
    await page.send('Network.enable');
    await page.send('Page.enable');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });

    page.on((msg) => {
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        problems.push(`${current}: script error: ${d.exception?.description?.split('\n')[0] || d.text}`);
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
        problems.push(`${current}: console.error: ${text.slice(0, 300)}`);
      }
      if (msg.method === 'Network.responseReceived') {
        const { url, status } = msg.params.response;
        if (!url.startsWith(BASE)) return;
        const p = url.slice(BASE.length);
        if (status === 429) problems.push(`${current}: rate limited (429) on ${p}. Restart the server and run again.`);
        else if (status >= 400 && p.startsWith('/api/')) problems.push(`${current}: ${status} from ${p}`);
        else if (status >= 400 && /\.(js|css)(\?|$)/.test(p)) problems.push(`${current}: ${status} loading ${p}`);
      }
    });

    await sleep(1500);
    const login = await evaluate(page, `(async () => {
      const res = await fetch('/api/v1/auth/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: ${JSON.stringify(USER)}, password: ${JSON.stringify(PASS)} }) });
      return res.status;
    })()`);
    if (login !== 200) throw new Error(`admin login returned ${login}`);

    current = '/ops';
    await page.send('Page.navigate', { url: `${BASE}/ops#/dashboard` });
    await sleep(2500);

    // Waits for the view to replace its loading skeleton, then reads what it shows.
    async function open(route) {
      current = `#/${route}`;
      await evaluate(page, `location.hash = ${JSON.stringify(`#/${route}`)}`);
      let state = null;
      for (let i = 0; i < 40; i++) {
        await sleep(200);
        state = await evaluate(page, `(() => {
          const main = document.getElementById('as-content');
          if (!main) return { missing: true };
          const busy = !!main.querySelector('.as-skeleton') && main.children.length === 1;
          const failed = [...main.querySelectorAll('.ops-alert, .as-alert, .alert')].map((e) => e.textContent).find((t) => /Could not load this page/.test(t));
          return { busy, failed: failed || null, text: main.innerText.slice(0, 200), overflow: document.documentElement.scrollWidth - window.innerWidth };
        })()`);
        if (state.missing || !state.busy) break;
      }
      if (state.missing) problems.push(`${current}: no #as-content on the page (not logged in, or the page did not load)`);
      else if (state.busy) problems.push(`${current}: still loading after 8 seconds`);
      else if (state.failed) problems.push(`${current}: ${state.failed.trim().slice(0, 300)}`);
      await sleep(450); // stay under the API rate limit
      return state;
    }

    for (const s of SCREENS) await open(s);

    // Detail pages, from the same API the page uses.
    const ids = await evaluate(page, `(async () => {
      const get = async (p) => { const r = await fetch('/api/v1/ops' + p, { credentials: 'include' }); const j = await r.json(); return j.data; };
      const [workers, clients, bookings] = await Promise.all([get('/workers'), get('/clients'), get('/bookings')]);
      return { workers: workers.map((w) => w.id), clients: clients.clients.map((c) => c.id), bookings: bookings.map((b) => b.id) };
    })()`);
    notes.push(`${ids.workers.length} workers, ${ids.clients.length} clients, ${ids.bookings.length} bookings on file`);
    const spread = (list, n) => (list.length <= n ? list : Array.from({ length: n }, (_, i) => list[Math.floor((i * list.length) / n)]));
    for (const id of spread(ids.workers, 10)) await open(`worker/${id}`);
    for (const id of spread(ids.clients, 5)) await open(`client/${id}`);
    for (const id of spread(ids.bookings, DETAIL_LIMIT)) await open(`booking/${id}`);

    // Write mode: open each edit form and save it without changing anything.
    // A form that cannot save its own unchanged values is a form the office
    // cannot use. Local servers only: this writes (audit rows, settings).
    if (WRITE) {
      const host = new URL(BASE).hostname;
      if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('OPS_UI_WRITE only runs against a local server');
      await evaluate(page, `(() => {
        window.__toasts = [];
        const real = AdminCore.toast;
        AdminCore.toast = function (m, t) { window.__toasts.push([t || 'success', String(m)]); return real.apply(this, arguments); };
      })()`);

      // Clicks a button on the page, then the modal's main button if one opened.
      async function save(route, selector, label, quiet = false) {
        await open(route);
        current = `#/${route} [${label}]`;
        const clicked = await evaluate(page, `(() => {
          window.__toasts.length = 0;
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return false;
          el.click();
          return true;
        })()`);
        if (!clicked) { if (!quiet) notes.push(`write: ${current} not on the page, skipped`); return false; }
        await sleep(600);
        await evaluate(page, `(() => {
          const modal = document.getElementById('ops-modal');
          if (modal && !modal.classList.contains('d-none')) {
            const btns = document.querySelectorAll('#ops-modal-footer button');
            btns[btns.length - 1].click();
          }
        })()`);
        await sleep(1500);
        const errors = await evaluate(page, `window.__toasts.filter((t) => t[0] === 'error').map((t) => t[1])`);
        for (const e of errors) problems.push(`${current}: saving unchanged showed "${e}"`);
        await sleep(400);
        return true;
      }

      const people = ids.workers.slice(0, 3);
      for (const id of people) {
        await save(`worker/${id}`, '#save-details', 'Save details');
        await save(`worker/${id}`, '#save-payroll', 'Save payroll and pension');
      }
      for (const id of ids.clients.slice(0, 3)) await save(`client/${id}`, '#save-client', 'Save client');
      for (const id of spread(ids.bookings, 4)) {
        await save(`booking/${id}`, '#save-booking', 'Save booking');
        await save(`booking/${id}`, '[data-edit-req]', 'Edit requirement');
      }
      // Most bookings have no running order; edit the first one that does.
      let runningOrder = false;
      for (const id of ids.bookings) {
        if (await save(`booking/${id}`, '[data-edit-ro]', 'Edit running order line', true)) { runningOrder = true; break; }
      }
      if (!runningOrder) notes.push('write: no booking has a running order line, skipped');
      await save('leads', '[data-edit-lead]', 'Edit lead');
      await save('payroll', '[data-edit]', 'Edit payment');
      await save('direct-hire', '[data-i]', 'Edit direct hire');
      await save('settings', '#save-pension', 'Save pension settings');
      await save('settings', '#save-thresholds', 'Save thresholds');
    }

    // Phone width: the main screens should not scroll sideways.
    await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    for (const s of PHONE_SCREENS) {
      const state = await open(s);
      if (state && state.overflow > 4) notes.push(`phone width: #/${s} scrolls sideways by ${state.overflow}px (tables may scroll inside their box; check by eye)`);
    }
    page.close();
  } catch (err) {
    problems.push(`${current}: ${err.message}`);
  } finally {
    chrome.kill();
    await sleep(300);
    await fsp.rm(profile, { recursive: true, force: true }).catch(() => {});
  }

  for (const n of notes) console.log(`note: ${n}`);
  if (problems.length) {
    console.log(`\nFAIL: ${problems.length} problem(s)`);
    for (const p of [...new Set(problems)]) console.log(`  - ${p}`);
    process.exit(1);
  }
  console.log(`\nPASS: every Ops screen loaded without errors (${BASE}).`);
})();
