const { spawnSync } = require('node:child_process');
const path = require('node:path');

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    console.log(`[prisma:deploy] Attempt ${attempt}/${maxAttempts}`);
    const result = runPrismaDeploy();

    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);

    if (result.status === 0) {
      process.exit(0);
    }

    const combinedOutput = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    const retryable = /P1001|Can't reach database server/i.test(combinedOutput);

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
  }
}

main().catch((error) => {
  console.error('[prisma:deploy] Unexpected failure:', error);
  process.exit(1);
});
