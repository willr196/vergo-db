const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { Client } = require('pg');

const DEFAULT_PRISMA_POSTGRES_ADVISORY_LOCK_ID = 72707369;

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDatabaseConnectionString() {
  // Prisma Migrate prefers `directUrl` when it is configured, so probe the same path first.
  return process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
}

async function withDatabaseClient(task) {
  const connectionString = getDatabaseConnectionString();
  if (!connectionString) return null;

  const client = new Client({
    connectionString,
    application_name: 'prisma-deploy-lock-probe',
    connectionTimeoutMillis: parsePositiveInt(process.env.PRISMA_DEPLOY_DB_CONNECT_TIMEOUT_MS, 10000),
    query_timeout: parsePositiveInt(process.env.PRISMA_DEPLOY_DB_QUERY_TIMEOUT_MS, 10000),
    statement_timeout: parsePositiveInt(process.env.PRISMA_DEPLOY_DB_STATEMENT_TIMEOUT_MS, 10000),
  });

  await client.connect();

  try {
    return await task(client);
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * Wake Neon by running a simple query. Neon serverless Postgres suspends after
 * idle periods; the first connection can take 3-8s. Warming up here ensures
 * Prisma's fixed advisory lock timeout (10s) isn't eaten by the cold start.
 */
async function warmUpDatabase() {
  if (!getDatabaseConnectionString()) return;
  console.log('[prisma:deploy] Warming up database connection...');

  try {
    await withDatabaseClient((client) => client.query('SELECT 1'));
    console.log('[prisma:deploy] Database is warm.');
  } catch (error) {
    console.warn('[prisma:deploy] Warm-up query did not succeed, proceeding anyway...');
    if (error instanceof Error) {
      console.warn(error.message);
    }
  }
}

function runPrismaDeploy() {
  const prismaBin = path.join(process.cwd(), 'node_modules', '.bin', 'prisma');
  return spawnSync(prismaBin, ['migrate', 'deploy'], {
    env: process.env,
    encoding: 'utf8',
  });
}

async function waitForAdvisoryLockAvailability() {
  if (!getDatabaseConnectionString()) return;

  const lockId = parsePositiveInt(
    process.env.PRISMA_DEPLOY_ADVISORY_LOCK_ID,
    DEFAULT_PRISMA_POSTGRES_ADVISORY_LOCK_ID
  );
  const maxWaitMs = parsePositiveInt(process.env.PRISMA_DEPLOY_LOCK_WAIT_TIMEOUT_MS, 180000);
  const pollIntervalMs = parsePositiveInt(process.env.PRISMA_DEPLOY_LOCK_POLL_INTERVAL_MS, 2000);
  const deadline = Date.now() + maxWaitMs;
  let waitLogged = false;

  while (Date.now() <= deadline) {
    let acquired = false;

    try {
      acquired = await withDatabaseClient(async (client) => {
        const result = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [lockId]);
        const hasLock = result.rows[0]?.acquired === true;

        if (hasLock) {
          await client.query('SELECT pg_advisory_unlock($1)', [lockId]);
        }

        return hasLock;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[prisma:deploy] Advisory lock probe failed (${message}). Continuing with Prisma CLI...`);
      return;
    }

    if (acquired) {
      if (waitLogged) {
        console.log('[prisma:deploy] Prisma advisory lock is available.');
      }
      return;
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;

    const delayMs = Math.min(pollIntervalMs, remainingMs);
    console.log(`[prisma:deploy] Prisma advisory lock is busy. Waiting ${delayMs}ms before retrying...`);
    waitLogged = true;
    await sleep(delayMs);
  }

  console.warn('[prisma:deploy] Advisory lock wait window elapsed. Falling back to Prisma CLI retries.');
}

async function main() {
  const maxAttempts = parsePositiveInt(process.env.PRISMA_DEPLOY_MAX_ATTEMPTS, 4);
  const baseDelayMs = parsePositiveInt(process.env.PRISMA_DEPLOY_RETRY_DELAY_MS, 5000);

  // Wake Neon before the first migrate attempt
  await warmUpDatabase();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await waitForAdvisoryLockAvailability();
    console.log(`[prisma:deploy] Attempt ${attempt}/${maxAttempts}`);
    const result = runPrismaDeploy();

    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);

    if (result.status === 0) {
      process.exit(0);
    }

    const combinedOutput = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    const retryable = /P1001|P1002|Can't reach database server|advisory lock/i.test(combinedOutput);

    if (!retryable || attempt === maxAttempts) {
      if (result.error) {
        console.error('[prisma:deploy] Failed to execute Prisma CLI:', result.error.message);
      }
      process.exit(result.status ?? 1);
    }

    const delayMs = baseDelayMs * (2 ** (attempt - 1));
    console.error(
      `[prisma:deploy] Retryable database connectivity failure detected. Retrying in ${delayMs}ms...`
    );
    await sleep(delayMs);
    await warmUpDatabase();
  }
}

main().catch((error) => {
  console.error('[prisma:deploy] Unexpected failure:', error);
  process.exit(1);
});
