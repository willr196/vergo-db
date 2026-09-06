-- CreateTable
CREATE TABLE "JobDay" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "jobId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "staffNeeded" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "JobDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobAssignment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobDayId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "JobAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobDay_jobId_idx" ON "JobDay"("jobId");

-- CreateIndex
CREATE INDEX "JobDay_date_idx" ON "JobDay"("date");

-- CreateIndex
CREATE UNIQUE INDEX "JobDay_jobId_date_key" ON "JobDay"("jobId", "date");

-- CreateIndex
CREATE INDEX "JobAssignment_jobDayId_idx" ON "JobAssignment"("jobDayId");

-- CreateIndex
CREATE INDEX "JobAssignment_userId_idx" ON "JobAssignment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "JobAssignment_jobDayId_userId_key" ON "JobAssignment"("jobDayId", "userId");

-- AddForeignKey
ALTER TABLE "JobDay" ADD CONSTRAINT "JobDay_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAssignment" ADD CONSTRAINT "JobAssignment_jobDayId_fkey" FOREIGN KEY ("jobDayId") REFERENCES "JobDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAssignment" ADD CONSTRAINT "JobAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing dated job gets one JobDay per calendar day it spans,
-- each seeded with the job's current headcount. Jobs with no eventDate stay
-- dayless until an admin gives them dates.
INSERT INTO "JobDay" ("id", "createdAt", "updatedAt", "jobId", "date", "staffNeeded")
SELECT
    'jd_' || md5(j."id" || d::text),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    j."id",
    d::date,
    GREATEST(j."staffNeeded", 1)
FROM "Job" j
CROSS JOIN LATERAL generate_series(
    j."eventDate"::date,
    COALESCE(j."eventEndDate", j."eventDate")::date,
    interval '1 day'
) AS d
WHERE j."eventDate" IS NOT NULL
  AND COALESCE(j."eventEndDate", j."eventDate")::date >= j."eventDate"::date
ON CONFLICT ("jobId", "date") DO NOTHING;
