#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { execFile } = require('node:child_process');
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

async function main() {
  const browserBin = process.env.CHROME_BIN || 'google-chrome';
  const { server, baseUrl } = await startServer();

  try {
    console.log(`Browser smoke against ${baseUrl}`);

    const homepageDom = await dumpDom(browserBin, `${baseUrl}/`);
    assert.match(homepageDom, /class="nav-container"/i, 'homepage shell navigation did not hydrate');
    assert.match(homepageDom, /Event staffing that/i, 'homepage hero copy missing');
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
