#!/usr/bin/env node
'use strict';

/**
 * Refuses to run a Prisma command against a non-local database unless that is
 * explicitly asked for.
 *
 * Why this exists: on 6 September 2026 a `prisma migrate deploy` intended for a
 * throwaway Docker container was applied to the live Neon database instead. The
 * command passed DATABASE_URL inline, but schema.prisma sets
 * `directUrl = env("DIRECT_DATABASE_URL")`, and Prisma Migrate prefers directUrl
 * and loads it from apps/api/.env. The inline override was never going to win.
 *
 * A comment in .env is not a control. This is.
 *
 * Resolution order matches Prisma Migrate: DIRECT_DATABASE_URL, then
 * DATABASE_URL, each taken from the process environment first and then from
 * apps/api/.env, which is what the CLI itself loads.
 *
 * To allow a remote target on purpose, set ALLOW_REMOTE_DB=1. Production does
 * this in fly.toml, so deploys still migrate their own database.
 */

const fs = require('node:fs');
const path = require('node:path');

const LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  'host.docker.internal',
  // Docker Compose service names, used when the API runs in a container.
  'db',
  'db-test',
  'postgres',
]);

function readEnvFile(file) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!fs.existsSync(file)) return out;
  const text = fs.readFileSync(file, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Later assignments win, which is how dotenv treats a duplicated key.
    out[key] = value;
  }
  return out;
}

function resolveTargetUrl() {
  const fileEnv = readEnvFile(path.join(__dirname, '..', '.env'));
  for (const key of ['DIRECT_DATABASE_URL', 'DATABASE_URL']) {
    const value = process.env[key] || fileEnv[key];
    if (value) return { key, value };
  }
  return null;
}

/** Host only. Never returns the credentials. */
function describeTarget(url) {
  try {
    const parsed = new URL(url);
    return { host: parsed.hostname, port: parsed.port || '5432', database: parsed.pathname.replace(/^\//, '') || '(default)' };
  } catch {
    return null;
  }
}

function isLocal(host) {
  if (LOCAL_HOSTS.has(host)) return true;
  // 172.x and 192.168.x are Docker bridge and LAN addresses.
  return /^127\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^192\.168\./.test(host);
}

function main() {
  const label = process.argv.slice(2).join(' ') || 'this Prisma command';
  const target = resolveTargetUrl();

  if (!target) {
    console.error('[db-guard] No DIRECT_DATABASE_URL or DATABASE_URL found. Nothing to check.');
    process.exit(1);
  }

  const described = describeTarget(target.value);
  if (!described) {
    console.error(`[db-guard] ${target.key} is not a URL that can be parsed. Refusing to continue.`);
    process.exit(1);
  }

  const local = isLocal(described.host);
  const allowed = process.env.ALLOW_REMOTE_DB === '1';

  console.log(`[db-guard] ${label}`);
  console.log(`[db-guard] target: ${described.host}:${described.port}/${described.database} (from ${target.key})`);

  if (local) {
    console.log('[db-guard] local target, proceeding.');
    return;
  }

  if (allowed) {
    console.log('[db-guard] remote target, allowed by ALLOW_REMOTE_DB=1.');
    return;
  }

  console.error('');
  console.error('[db-guard] REFUSED: this is a remote database.');
  console.error('');
  console.error(`  ${label} would run against ${described.host}.`);
  console.error('');
  console.error('  If that is genuinely what you want, run it again with:');
  console.error('');
  console.error('      ALLOW_REMOTE_DB=1 <your command>');
  console.error('');
  console.error('  For local work, point apps/api/.env at the Compose database:');
  console.error('');
  console.error('      docker compose -f infra/docker-compose.yml up -d db');
  console.error('');
  console.error('  See docs/database-environments.md.');
  console.error('');
  process.exit(1);
}

main();
