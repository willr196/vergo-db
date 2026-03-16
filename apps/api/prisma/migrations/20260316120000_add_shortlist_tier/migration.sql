-- CreateEnum
CREATE TYPE "JobTier" AS ENUM ('STANDARD', 'SHORTLIST', 'GOLD');

-- AlterTable: Job — add tier and shortlistReviewedAt
ALTER TABLE "Job" ADD COLUMN "tier" "JobTier" NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "Job" ADD COLUMN "shortlistReviewedAt" TIMESTAMP(3);

-- AlterTable: JobApplication — add rateUplift for Shortlist bookings
ALTER TABLE "JobApplication" ADD COLUMN "rateUplift" DECIMAL(10,2);

-- AlterTable: User — add shortlistSelections performance counter
ALTER TABLE "User" ADD COLUMN "shortlistSelections" INTEGER NOT NULL DEFAULT 0;
