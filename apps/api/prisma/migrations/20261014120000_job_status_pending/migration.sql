-- JobStatus.PENDING has been in schema.prisma, and in the live databases, since
-- it was added there out-of-band; no migration ever created it. A database
-- built from migrations alone (CI, a fresh container) lacked it, and the
-- Scheduling sync's `status: { not: 'PENDING' }` failed on every run.
-- IF NOT EXISTS makes this a no-op wherever the value is already there.
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'PENDING';
