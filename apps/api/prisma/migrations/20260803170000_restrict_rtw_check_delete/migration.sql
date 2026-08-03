-- RightToWorkCheck rows are compliance evidence and must survive an applicant
-- record being deleted, so replace the cascade with a restrict: deleting an
-- applicant that still has RTW check history now fails instead of silently
-- wiping that history.
ALTER TABLE "RightToWorkCheck" DROP CONSTRAINT "RightToWorkCheck_applicantId_fkey";
ALTER TABLE "RightToWorkCheck" ADD CONSTRAINT "RightToWorkCheck_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
