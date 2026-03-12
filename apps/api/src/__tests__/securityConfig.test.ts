import test from 'node:test';
import assert from 'node:assert/strict';

const ENV_MODULE_PATH = require.resolve('../env');

type EnvOverrides = Record<string, string | undefined>;

function withEnv(overrides: EnvOverrides, run: () => void) {
  const keys = Array.from(new Set([
    'NODE_ENV',
    'DATABASE_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'WEB_ORIGIN',
    'DOTENV_CONFIG_PATH',
    ...Object.keys(overrides),
  ]));
  const previous = new Map<string, string | undefined>(keys.map((key) => [key, process.env[key]]));

  for (const key of keys) {
    delete process.env[key];
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }

  process.env.DOTENV_CONFIG_PATH = '/tmp/vergo-nonexistent.env';

  delete require.cache[ENV_MODULE_PATH];

  try {
    run();
  } finally {
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

test('env requires a dedicated refresh secret in production', () => {
  withEnv({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/vergo_test',
    JWT_SECRET: 'a'.repeat(64),
    WEB_ORIGIN: 'https://vergoltd.com',
  }, () => {
    assert.throws(
      () => require('../env'),
      /JWT_REFRESH_SECRET required in production/
    );
  });
});

test('env rejects weak production JWT secrets', () => {
  withEnv({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/vergo_test',
    JWT_SECRET: 'too-short',
    JWT_REFRESH_SECRET: 'b'.repeat(64),
    WEB_ORIGIN: 'https://vergoltd.com',
  }, () => {
    assert.throws(
      () => require('../env'),
      /JWT_SECRET must be at least 32 bytes/
    );
  });
});

test('assertStrongSecret accepts a 32-byte hex secret', () => {
  withEnv({
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/vergo_test',
    JWT_SECRET: 'a'.repeat(64),
    JWT_REFRESH_SECRET: 'b'.repeat(64),
    WEB_ORIGIN: 'http://localhost:8080',
  }, () => {
    const { assertStrongSecret } = require('../env') as { assertStrongSecret: (name: string, value: string) => void };
    assert.doesNotThrow(() => assertStrongSecret('SESSION_SECRET', 'c'.repeat(64)));
  });
});
