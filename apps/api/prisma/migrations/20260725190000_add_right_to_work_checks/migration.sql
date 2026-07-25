-- CreateEnum
CREATE TYPE "RtwMethod" AS ENUM ('SHARE_CODE', 'DOCUMENT', 'IDSP');

-- CreateEnum
CREATE TYPE "RtwOutcome" AS ENUM ('PENDING', 'PASS', 'FAIL');

-- CreateTable
CREATE TABLE "RightToWorkCheck" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "applicantId" TEXT NOT NULL,
    "method" "RtwMethod" NOT NULL,
    "documentType" VARCHAR(120),
    "reference" VARCHAR(120),
    "validFrom" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "outcome" "RtwOutcome" NOT NULL DEFAULT 'PENDING',
    "checkedBy" VARCHAR(100) NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documentKey" VARCHAR(500),
    "notes" VARCHAR(1000),

    CONSTRAINT "RightToWorkCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RightToWorkCheck_applicantId_idx" ON "RightToWorkCheck"("applicantId");

-- CreateIndex
CREATE INDEX "RightToWorkCheck_outcome_idx" ON "RightToWorkCheck"("outcome");

-- CreateIndex
CREATE INDEX "RightToWorkCheck_expiresAt_idx" ON "RightToWorkCheck"("expiresAt");

-- AddForeignKey
ALTER TABLE "RightToWorkCheck" ADD CONSTRAINT "RightToWorkCheck_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

