-- Reset pricing rows before tier conversion (new matrix will be reseeded)
TRUNCATE TABLE "PricingTier";

-- Additive columns required by updated marketplace spec
ALTER TABLE "PricingTier"
ADD COLUMN "isBookable" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "User"
ADD COLUMN "staffHighlights" TEXT;

-- Rebuild SubscriptionTier enum: BASIC/PRO/PREMIUM -> STANDARD/PREMIUM
CREATE TYPE "SubscriptionTier_new" AS ENUM ('STANDARD', 'PREMIUM');

ALTER TABLE "Client" ALTER COLUMN "subscriptionTier" DROP DEFAULT;

ALTER TABLE "Client"
ALTER COLUMN "subscriptionTier" TYPE "SubscriptionTier_new"
USING (
  CASE
    WHEN "subscriptionTier"::text = 'BASIC' THEN 'STANDARD'
    WHEN "subscriptionTier"::text = 'PRO' THEN 'PREMIUM'
    WHEN "subscriptionTier"::text = 'PREMIUM' THEN 'PREMIUM'
    ELSE 'STANDARD'
  END
)::"SubscriptionTier_new";

ALTER TABLE "Booking"
ALTER COLUMN "clientTierAtBooking" TYPE "SubscriptionTier_new"
USING (
  CASE
    WHEN "clientTierAtBooking"::text = 'BASIC' THEN 'STANDARD'
    WHEN "clientTierAtBooking"::text = 'PRO' THEN 'PREMIUM'
    WHEN "clientTierAtBooking"::text = 'PREMIUM' THEN 'PREMIUM'
    ELSE 'STANDARD'
  END
)::"SubscriptionTier_new";

ALTER TABLE "PricingTier"
ALTER COLUMN "clientTier" TYPE "SubscriptionTier_new"
USING (
  CASE
    WHEN "clientTier"::text = 'BASIC' THEN 'STANDARD'
    WHEN "clientTier"::text = 'PRO' THEN 'PREMIUM'
    WHEN "clientTier"::text = 'PREMIUM' THEN 'PREMIUM'
    ELSE 'STANDARD'
  END
)::"SubscriptionTier_new";

ALTER TYPE "SubscriptionTier" RENAME TO "SubscriptionTier_old";
ALTER TYPE "SubscriptionTier_new" RENAME TO "SubscriptionTier";
DROP TYPE "SubscriptionTier_old";

ALTER TABLE "Client" ALTER COLUMN "subscriptionTier" SET DEFAULT 'STANDARD';

-- Rebuild StaffTier enum: BRONZE/SILVER/GOLD -> STANDARD/ELITE
CREATE TYPE "StaffTier_new" AS ENUM ('STANDARD', 'ELITE');

ALTER TABLE "User"
ALTER COLUMN "staffTier" TYPE "StaffTier_new"
USING (
  CASE
    WHEN "staffTier"::text = 'BRONZE' THEN 'STANDARD'
    WHEN "staffTier"::text = 'SILVER' THEN 'STANDARD'
    WHEN "staffTier"::text = 'GOLD' THEN 'ELITE'
    ELSE NULL
  END
)::"StaffTier_new";

ALTER TABLE "Booking"
ALTER COLUMN "staffTierAtBooking" TYPE "StaffTier_new"
USING (
  CASE
    WHEN "staffTierAtBooking"::text = 'BRONZE' THEN 'STANDARD'
    WHEN "staffTierAtBooking"::text = 'SILVER' THEN 'STANDARD'
    WHEN "staffTierAtBooking"::text = 'GOLD' THEN 'ELITE'
    ELSE 'STANDARD'
  END
)::"StaffTier_new";

ALTER TABLE "PricingTier"
ALTER COLUMN "staffTier" TYPE "StaffTier_new"
USING (
  CASE
    WHEN "staffTier"::text = 'BRONZE' THEN 'STANDARD'
    WHEN "staffTier"::text = 'SILVER' THEN 'STANDARD'
    WHEN "staffTier"::text = 'GOLD' THEN 'ELITE'
    ELSE 'STANDARD'
  END
)::"StaffTier_new";

ALTER TYPE "StaffTier" RENAME TO "StaffTier_old";
ALTER TYPE "StaffTier_new" RENAME TO "StaffTier";
DROP TYPE "StaffTier_old";

-- New subscription plan reference table
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tier" "SubscriptionTier" NOT NULL,
    "name" TEXT NOT NULL,
    "weeklyPrice" DECIMAL(10,2) NOT NULL,
    "monthlyPrice" DECIMAL(10,2),
    "annualPrice" DECIMAL(10,2),
    "features" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubscriptionPlan_tier_key" ON "SubscriptionPlan"("tier");
