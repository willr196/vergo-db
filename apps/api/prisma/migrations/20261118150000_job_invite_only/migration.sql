-- Selected staff only (18 November 2026): a job the office shows just to the
-- staff it invites. Every existing job stays visible to everyone.
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "inviteOnly" BOOLEAN NOT NULL DEFAULT false;
