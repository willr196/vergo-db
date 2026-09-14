'use strict';
//
// Usage (needs a running server):
//   CHROME_BIN=/path/to/chrome npm run check:shell-render
//
// Loads each page whose header/footer is built by vergo-public-shell.js and
// asserts the contact details it renders match vergo-site-config.js. Catches a
// page loading the shell before the config, which silently falls back.
// Confirms the shell-built footer still renders the same contact details now
// that they come from vergo-site-config.js instead of being hardcoded.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const BASE = 'http://localhost:8099';
const CHROME = process.env.CHROME_BIN;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitForDevTools(port) {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) return; } catch {}
    await sleep(200);
  }
  throw new Error('devtools timeout');
}
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl); let id = 0; const pending = new Map();
    ws.onopen = () => resolve({
      send(method, params = {}) { const m = { id: ++id, method, params }; ws.send(JSON.stringify(m));
        return new Promise((res, rej) => pending.set(m.id, { res, rej })); },
      close() { ws.close(); } });
    ws.onerror = reject;
    ws.onmessage = e => { const m = JSON.parse(e.data); if (!m.id || !pending.has(m.id)) return;
      const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); };
  });
}
async function evaluate(c, expr) {
  const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
async function page(port, url) {
  const r = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  return connect((await r.json()).webSocketDebuggerUrl);
}

(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vergo-shell-'));
  const port = 9334;
  const child = spawn(CHROME, ['--headless=new','--disable-gpu','--no-first-run',
    `--remote-debugging-port=${port}`,`--user-data-dir=${dir}`,'about:blank'], { stdio:['ignore','ignore','pipe'] });
  let bad = false;
  try {
    await waitForDevTools(port);
    for (const route of ['/404', '/blog', '/login']) {
      const c = await page(port, BASE + route);
      await sleep(1500);
      const got = await evaluate(c, `
        (() => {
          const a = [...document.querySelectorAll('a[href*="wa.me"]')].map(x => ({ href: x.getAttribute('href'), text: x.textContent.trim() }));
          return { count: a.length, first: a[0] || null, hasHeader: !!document.querySelector('.site-header, #site-header')?.innerHTML.trim() };
        })()
      `);
      const href = got.first ? got.first.href : '';
      const text = got.first ? got.first.text : '';
      const ok = href.includes('447944505783') && text.includes('07944 505783');
      console.log(`${route.padEnd(7)} header built: ${got.hasHeader} | wa links: ${got.count} | ${ok ? 'OK' : 'MISMATCH'} ${text}`);
      if (!ok || !got.hasHeader) bad = true;
      c.close();
    }
    console.log(bad ? '\nRESULT: FAIL' : '\nRESULT: PASS — contact details render identically from config');
  } catch (e) { console.error('ERROR:', e.message); bad = true; }
  finally { child.kill(); await sleep(300); await fs.rm(dir, { recursive:true, force:true }).catch(()=>{}); }
  process.exit(bad ? 1 : 0);
})();
