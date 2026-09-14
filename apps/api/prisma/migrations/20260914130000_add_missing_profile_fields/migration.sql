-- Adds the profile fields the mobile app's edit screens have been collecting
-- with no backend storage: Applicant.city, Applicant.preferredRoles (job
-- roles the applicant is suited for — distinct from the existing
-- preferredJobTypes, which is event types), a richer 3-state
-- StaffAvailabilityStatus on User (staffAvailable stays as-is and gets kept
-- in sync, since existing matching/marketplace logic reads that boolean),
-- and Client.description/address/city.
CREATE TYPE "StaffAvailabilityStatus" AS ENUM ('AVAILABLE', 'LIMITED', 'UNAVAILABLE');

ALTER TABLE "Applicant" ADD COLUMN "city" TEXT;
ALTER TABLE "Applicant" ADD COLUMN "preferredRoles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "User" ADD COLUMN "availabilityStatus" "StaffAvailabilityStatus" NOT NULL DEFAULT 'UNAVAILABLE';

-- Backfill from the existing boolean so users who already marked themselves
-- available don't silently flip to unavailable.
UPDATE "User" SET "availabilityStatus" = 'AVAILABLE' WHERE "staffAvailable" = true;

ALTER TABLE "Client" ADD COLUMN "description" TEXT;
ALTER TABLE "Client" ADD COLUMN "address" TEXT;
ALTER TABLE "Client" ADD COLUMN "city" TEXT;
