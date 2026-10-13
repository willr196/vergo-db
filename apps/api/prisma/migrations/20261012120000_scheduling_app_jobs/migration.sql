-- VERGO Scheduling jobs linked to Admin > Jobs listings.
ALTER TABLE "Job" ADD COLUMN "schedSynced" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "sched_job" ADD COLUMN "appJobId" TEXT;
CREATE INDEX "sched_job_appJobId_idx" ON "sched_job"("appJobId");
ALTER TABLE "sched_job" ADD CONSTRAINT "sched_job_appJobId_fkey" FOREIGN KEY ("appJobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
