-- Removes the Job posting tier system (STANDARD/SHORTLIST/GOLD) and the
-- fields that only existed to support it. Applicant.staffTier (the
-- STANDARD/GOLD staff-recognition badge) and User.staffTier (the
-- STANDARD/ELITE marketplace pricing tier) are unrelated and untouched.
ALTER TABLE "User" DROP COLUMN "shortlistSelections";
ALTER TABLE "JobApplication" DROP COLUMN "rateUplift";
ALTER TABLE "Job" DROP COLUMN "tier";
ALTER TABLE "Job" DROP COLUMN "shortlistReviewedAt";
DROP TYPE "JobTier";
