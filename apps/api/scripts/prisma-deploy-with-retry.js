const { spawnSync } = require('node:child_process');
const path = require('node:path');

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wake Neon by running a simple query. Neon serverless Postgres suspends after
 * idle periods; the first connection can take 3-8s. Warming up here ensures
 * Prisma's advisory lock timeout (10s) isn't eaten by the cold start.
 */
function warmUpDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  const prismaBin = path.join(process.cwd(), 'node_modules', '.bin', 'prisma');
  console.log('[prisma:deploy] Warming up database connection...');

  // Use prisma db execute to run a simple query — this wakes Neon
  const result = spawnSync(prismaBin, ['db', 'execute', '--stdin', '--schema', 'prisma/schema.prisma'], {
    input: 'SELECT 1;',
    env: process.env,
    encoding: 'utf8',
    timeout: 30000,
  });

  if (result.status === 0) {
    console.log('[prisma:deploy] Database is warm.');
  } else {
    console.warn('[prisma:deploy] Warm-up query did not succeed, proceeding anyway...');
    if (result.stderr) console.warn(result.stderr);
  }
}

function runPrismaDeploy() {
  const prismaBin = path.join(process.cwd(), 'node_modules', '.bin', 'prisma');
  return spawnSync(prismaBin, ['migrate', 'deploy'], {
    env: process.env,
    encoding: 'utf8',
  });
}

async function main() {
  const maxAttempts = parsePositiveInt(process.env.PRISMA_DEPLOY_MAX_ATTEMPTS, 4);
  const baseDelayMs = parsePositiveInt(process.env.PRISMA_DEPLOY_RETRY_DELAY_MS, 5000);

  // Wake Neon before the first migrate attempt
  warmUpDatabase();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
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
    warmUpDatabase();
  }
}

main().catch((error) => {
  console.error('[prisma:deploy] Unexpected failure:', error);
  process.exit(1);
});
