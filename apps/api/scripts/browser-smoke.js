#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

function setRequiredEnv() {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '0';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/vergo_test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || '0123456789abcdef0123456789abcdef';
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fedcba9876543210fedcba9876543210';
  process.env.WEB_ORIGIN = process.env.WEB_ORIGIN || 'http://127.0.0.1:8080';
}

async function startServer() {
  setRequiredEnv();
  const { default: app } = require('../dist/src/index.js');

  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '0.0.0.0', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to determine browser smoke server address');
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function dumpDom(browserBin, url) {
  const { stdout } = await execFileAsync(
    browserBin,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--virtual-time-budget=4000',
      '--dump-dom',
      url,
    ],
    {
      maxBuffer: 8 * 1024 * 1024,
    }
  );

  return stdout;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removePathRecursive(target) {
  await fs.rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

async function terminateChild(child) {
  if (child.exitCode !== null) return;

  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(1000),
  ]);

  if (child.exitCode !== null) return;

  child.kill('SIGKILL');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(1000),
  ]);
}

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate local port')));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

async function waitForDevTools(port, child) {
  const endpoint = `http://127.0.0.1:${port}/json/version`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Headless browser exited early with code ${child.exitCode}`);
    }
    try {
      const res = await fetch(endpoint);
      if (res.ok) return;
    } catch {
      // Chrome is still starting.
    }
    await sleep(100);
  }
  throw new Error('Timed out waiting for Chrome DevTools');
}

function connectDevTools(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();

    ws.onopen = () => {
      resolve({
        send(method, params = {}) {
          const msg = { id: ++id, method, params };
          ws.send(JSON.stringify(msg));
          return new Promise((res, rej) => {
            pending.set(msg.id, { res, rej, method });
          });
        },
        close() {
          ws.close();
        },
      });
    };

    ws.onerror = reject;
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (!msg.id || !pending.has(msg.id)) return;
      const entry = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) {
        entry.rej(new Error(`${entry.method}: ${JSON.stringify(msg.error)}`));
      } else {
        entry.res(msg.result);
      }
    };
  });
}

async function startDebugBrowser(browserBin) {
  const port = await getFreePort();
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vergo-browser-smoke-'));
  const child = spawn(browserBin, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  await waitForDevTools(port, child).catch(async (error) => {
    await terminateChild(child);
    await removePathRecursive(userDataDir);
    error.message += stderr ? `\nChrome stderr:\n${stderr}` : '';
    throw error;
  });

  return {
    port,
    async close() {
      await terminateChild(child);
      await removePathRecursive(userDataDir);
    },
  };
}

async function newDebugPage(browser, url) {
  const res = await fetch(`http://127.0.0.1:${browser.port}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT',
  });
  if (!res.ok) {
    throw new Error(`Failed to create debug page: ${res.status}`);
  }
  const page = await res.json();
  return connectDevTools(page.webSocketDebuggerUrl);
}

async function evaluateJson(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(`Browser evaluation failed: ${JSON.stringify(result.exceptionDetails)}`);
  }
  return result.result.value;
}

const JOBS_FIXTURE_HTML = `
  <div id="site-header" class="site-header" role="banner"></div>
  <main>
    <div id="user-bar" class="user-bar logged-out"></div>
    <select id="filter-role"><option value="">All roles</option></select>
    <select id="filter-type"><option value="">All types</option></select>
    <div id="jobs-container"></div>
    <div id="pagination" class="pagination d-none"></div>
  </main>
  <footer role="contentinfo"></footer>
`;

async function inspectWithJwt(browser, baseUrl, pagePath, token, user, options = {}) {
  const client = await newDebugPage(browser, 'about:blank');
  try {
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        window.__smokeErrors = [];
        window.addEventListener('error', (event) => window.__smokeErrors.push(event.message));
        window.addEventListener('unhandledrejection', (event) => {
          const reason = event.reason;
          window.__smokeErrors.push(String(reason && (reason.message || reason)));
        });
      `,
    });

    await client.send('Page.navigate', { url: `${baseUrl}/` });
    await sleep(500);

    await evaluateJson(client, `(() => {
        localStorage.setItem('vergo_jwt', ${JSON.stringify(token)});
        localStorage.setItem('vergo_user', ${JSON.stringify(JSON.stringify(user))});
        localStorage.setItem('vergo_cookie_consent', 'accept');
        return true;
      })()`);

    if (options.fixture === 'jobs') {
      await evaluateJson(client, `(() => new Promise((resolve, reject) => {
        history.pushState({}, '', '/jobs');
        document.body.innerHTML = ${JSON.stringify(JOBS_FIXTURE_HTML)};

        const nativeFetch = window.fetch.bind(window);
        window.fetch = (input, init) => {
          const url = typeof input === 'string' ? new URL(input, location.origin) : new URL(input.url);
          if (url.pathname === '/api/v1/jobs/meta/roles') {
            return Promise.resolve(new Response(JSON.stringify({ ok: true, data: [] }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }));
          }
          if (url.pathname === '/api/v1/jobs') {
            return Promise.resolve(new Response(JSON.stringify({
              ok: true,
              data: { jobs: [], pagination: { page: 1, totalPages: 1, total: 0 } },
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }));
          }
          return nativeFetch(input, init);
        };

        const loadScript = (src) => new Promise((res, rej) => {
          const script = document.createElement('script');
          script.src = src;
          script.onload = res;
          script.onerror = () => rej(new Error('Failed to load ' + src));
          document.body.appendChild(script);
        });

        loadScript('/auth.js?v=2')
          .then(() => loadScript('/vergo-public-shell.js'))
          .then(() => loadScript('/pages/js/jobs.js'))
          .then(() => resolve(true), reject);
      }))()`);
      await sleep(1000);
    } else {
      await client.send('Page.navigate', { url: `${baseUrl}${pagePath}` });
      await sleep(1800);
    }

    return await evaluateJson(client, `(() => {
      const topCurrent = [...document.querySelectorAll('.site-nav > ul > li > a[aria-current="page"]')].map((a) => a.textContent.trim());
      const shellMenu = [...document.querySelectorAll('.nav-profile-menu [role="menuitem"]')].map((el) => el.textContent.trim());
      const dashMenu = [...document.querySelectorAll('#dash-profile-menu [role="menuitem"]')].map((el) => el.textContent.trim());
      const shellTrigger = document.querySelector('.nav-profile-trigger');
      const shellDropdown = document.querySelector('.nav-profile-menu');
      const dashTrigger = document.querySelector('#dash-profile-trigger');
      const dashDropdown = document.querySelector('#dash-profile-menu');
      shellTrigger && shellTrigger.click();
      const shellOpen = shellDropdown ? !shellDropdown.hidden : false;
      dashTrigger && dashTrigger.click();
      const dashOpen = dashDropdown ? !dashDropdown.hidden : false;
      const userBar = document.querySelector('#user-bar');
      return {
        path: location.pathname,
        topCurrent,
        shellMenu,
        dashMenu,
        shellOpen,
        dashOpen,
        shellProfile: Boolean(shellTrigger),
        dashProfile: Boolean(dashTrigger),
        userBarText: userBar ? userBar.textContent.replace(/\\s+/g, ' ').trim() : '',
        errors: window.__smokeErrors || [],
      };
    })()`);
  } finally {
    client.close();
  }
}

function assertAccountMenus(snapshot, label) {
  for (const value of ['Dashboard', 'Edit Profile', 'Sign out']) {
    assert.ok(snapshot.shellMenu.includes(value), `${label} shell profile menu missing ${value}`);
    assert.ok(snapshot.dashMenu.includes(value), `${label} dashboard profile menu missing ${value}`);
  }
  assert.equal(snapshot.shellProfile, true, `${label} shell profile trigger missing`);
  assert.equal(snapshot.dashProfile, true, `${label} dashboard profile trigger missing`);
  assert.equal(snapshot.shellOpen, true, `${label} shell profile dropdown did not open`);
  assert.equal(snapshot.dashOpen, true, `${label} dashboard profile dropdown did not open`);
  assert.deepEqual(snapshot.errors, [], `${label} had browser runtime errors`);
}

async function main() {
  const browserBin = process.env.CHROME_BIN || 'google-chrome';
  const { server, baseUrl } = await startServer();
  const { signAccessToken } = require('../dist/src/utils/jwt.js');

  try {
    console.log(`Browser smoke against ${baseUrl}`);

    const homepageDom = await dumpDom(browserBin, `${baseUrl}/`);
    assert.match(homepageDom, /class="nav-container"/i, 'homepage shell navigation did not hydrate');
    assert.match(homepageDom, /London event staff you do not have to chase, manage or second-guess/i, 'homepage hero copy missing');
    assert.match(homepageDom, /class="footer-grid"/i, 'homepage footer shell missing');

    const portalLoginDom = await dumpDom(browserBin, `${baseUrl}/portal-login`);
    assert.match(portalLoginDom, /Welcome Back/i, 'portal login heading missing');
    assert.match(portalLoginDom, /id="login-form"/i, 'portal login form missing');
    assert.match(portalLoginDom, /class="nav-container"/i, 'portal login shell navigation missing');

    const clientDashboardDom = await dumpDom(browserBin, `${baseUrl}/dashboard-client`);
    assert.match(clientDashboardDom, /Welcome Back/i, 'unauthenticated client dashboard did not redirect to login');
    assert.match(clientDashboardDom, /id="login-form"/i, 'login form missing after unauthenticated client dashboard redirect');

    const workerDashboardDom = await dumpDom(browserBin, `${baseUrl}/dashboard-worker`);
    assert.match(workerDashboardDom, /Welcome Back/i, 'unauthenticated worker dashboard did not redirect to login');
    assert.match(workerDashboardDom, /id="login-form"/i, 'login form missing after unauthenticated worker dashboard redirect');

    const debugBrowser = await startDebugBrowser(browserBin);
    try {
      const workerToken = signAccessToken({ sub: 'browser-smoke-worker', type: 'user', email: 'worker@example.com' });
      const clientToken = signAccessToken({ sub: 'browser-smoke-client', type: 'client', email: 'client@example.com' });

      const workerDashboard = await inspectWithJwt(debugBrowser, baseUrl, '/dashboard-worker', workerToken, {
        id: 'browser-smoke-worker',
        email: 'worker@example.com',
        name: 'Will Worker',
        userType: 'worker',
      });
      assert.deepEqual(workerDashboard.topCurrent, [], 'worker dashboard should not highlight a top-level public nav item');
      assertAccountMenus(workerDashboard, 'worker dashboard');

      const clientDashboard = await inspectWithJwt(debugBrowser, baseUrl, '/dashboard-client', clientToken, {
        id: 'browser-smoke-client',
        email: 'client@example.com',
        name: 'Client User',
        userType: 'client',
        companyName: 'VERGO Client',
      });
      assert.deepEqual(clientDashboard.topCurrent, [], 'client dashboard should not highlight a top-level public nav item');
      assertAccountMenus(clientDashboard, 'client dashboard');

      const jobsPage = await inspectWithJwt(debugBrowser, baseUrl, '/jobs', workerToken, {
        id: 'browser-smoke-worker',
        email: 'worker@example.com',
        name: 'Will Worker',
        userType: 'worker',
      }, { fixture: 'jobs' });
      assert.ok(jobsPage.topCurrent.includes('Worker Shifts'), 'jobs page should highlight Worker Shifts');
      assert.match(jobsPage.userBarText, /Welcome,\s*Will/i, 'jobs page did not recognise JWT worker in user bar');
      assert.match(jobsPage.userBarText, /My Applications/i, 'jobs page did not show worker dashboard action');
    } finally {
      await debugBrowser.close();
    }

    console.log('Browser smoke passed.');
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
