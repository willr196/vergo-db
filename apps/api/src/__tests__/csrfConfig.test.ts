import test from 'node:test';
import assert from 'node:assert/strict';

const CSRF_MODULE_PATH = require.resolve('../middleware/csrf');
const ENV_MODULE_PATH = require.resolve('../env');

type EnvOverrides = Record<string, string | undefined>;

/**
 * Loads middleware/csrf fresh under the given env. The module decides everything
 * at import time, so each case needs a clean require cache.
 */
function withCsrfEnv(overrides: EnvOverrides, run: (mod: typeof import('../middleware/csrf')) => void) {
  // csrf imports ../env, which hard-requires these regardless of what we are testing.
  const baseline: EnvOverrides = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/vergo_test',
    JWT_SECRET: 'a'.repeat(64),
    JWT_REFRESH_SECRET: 'b'.repeat(64),
    WEB_ORIGIN: 'https://vergoltd.com',
  };
  const merged: EnvOverrides = { ...baseline, ...overrides };
  const keys = Array.from(new Set([
    'NODE_ENV',
    'CSRF_SECRET',
    'DOTENV_CONFIG_PATH',
    ...Object.keys(merged),
  ]));
  const previous = new Map<string, string | undefined>(keys.map((key) => [key, process.env[key]]));

  for (const key of keys) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }
  process.env.DOTENV_CONFIG_PATH = '/tmp/vergo-nonexistent.env';

  delete require.cache[CSRF_MODULE_PATH];
  delete require.cache[ENV_MODULE_PATH];

  const errors: unknown[] = [];
  const realError = console.error;
  const realWarn = console.warn;
  console.error = (...args: unknown[]) => { errors.push(args); };
  console.warn = () => {};

  try {
    run(require('../middleware/csrf'));
  } finally {
    console.error = realError;
    console.warn = realWarn;
    delete require.cache[CSRF_MODULE_PATH];
    delete require.cache[ENV_MODULE_PATH];
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

/** Minimal res double capturing status + json, enough for the guard clause. */
function fakeRes() {
  const captured: { status?: number; body?: any } = {};
  const res: any = {
    status(code: number) { captured.status = code; return res; },
    json(body: any) { captured.body = body; return res; },
  };
  return { res, captured };
}

// The regression: importing this module used to throw, and because adminAuth
// imports it at boot, that took the whole public site down over an admin secret.
test('a missing CSRF_SECRET in production does not crash the process', () => {
  withCsrfEnv({ NODE_ENV: 'production' }, (mod) => {
    assert.match(String(mod.csrfConfigError()), /missing or empty/);
  });
});

test('a whitespace-only CSRF_SECRET in production counts as missing', () => {
  withCsrfEnv({ NODE_ENV: 'production', CSRF_SECRET: '   ' }, (mod) => {
    assert.match(String(mod.csrfConfigError()), /missing or empty/);
  });
});

test('a weak CSRF_SECRET in production is rejected without crashing', () => {
  withCsrfEnv({ NODE_ENV: 'production', CSRF_SECRET: 'too-short' }, (mod) => {
    assert.match(String(mod.csrfConfigError()), /at least 32 bytes/);
  });
});

test('a misconfigured CSRF_SECRET fails admin state changes closed with 503', () => {
  withCsrfEnv({ NODE_ENV: 'production' }, (mod) => {
    const { res, captured } = fakeRes();
    let nextCalled = false;
    mod.csrfProtection({ method: 'POST' } as any, res, (() => { nextCalled = true; }) as any);

    assert.equal(captured.status, 503);
    assert.equal(captured.body.code, 'CSRF_MISCONFIGURED');
    assert.equal(nextCalled, false, 'must not let the request through');
  });
});

test('a valid CSRF_SECRET in production reports no configuration error', () => {
  withCsrfEnv({ NODE_ENV: 'production', CSRF_SECRET: 'a'.repeat(64) }, (mod) => {
    assert.equal(mod.csrfConfigError(), null);
  });
});
