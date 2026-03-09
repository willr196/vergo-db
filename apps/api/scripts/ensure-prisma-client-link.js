const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
const packagePrismaDir = path.join(projectRoot, 'node_modules', '@prisma', 'client', '.prisma');
const generatedPrismaDir = path.join(projectRoot, 'node_modules', '.prisma');

try {
  if (!fs.existsSync(generatedPrismaDir)) {
    process.exit(0);
  }

  try {
    fs.lstatSync(packagePrismaDir);
    process.exit(0);
  } catch {
    // Missing package-local prisma directory; create the link below.
  }

  fs.symlinkSync(path.relative(path.dirname(packagePrismaDir), generatedPrismaDir), packagePrismaDir, 'dir');
  console.log('[PRISMA] Linked node_modules/@prisma/client/.prisma -> node_modules/.prisma');
} catch (error) {
  if (error && typeof error === 'object' && error.code === 'EEXIST') {
    process.exit(0);
  }
  console.warn('[PRISMA] Failed to ensure generated client link:', error instanceof Error ? error.message : error);
}
