-- AlterTable
ALTER TABLE "Applicant"
ADD COLUMN     "averageRating" DECIMAL(3,2),
ADD COLUMN     "bio" TEXT,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "hourlyRate" DECIMAL(10,2),
ADD COLUMN     "postcode" TEXT,
ADD COLUMN     "preferredJobTypes" TEXT,
ADD COLUMN     "profileVisible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "promotedToGoldAt" TIMESTAMP(3),
ADD COLUMN     "staffTier" TEXT NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "totalBookings" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "yearsExperience" INTEGER;

-- AlterTable
ALTER TABLE "Application"
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
