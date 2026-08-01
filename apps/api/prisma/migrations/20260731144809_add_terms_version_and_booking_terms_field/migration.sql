-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "termsVersionAtConfirmation" TEXT;

-- CreateTable
CREATE TABLE "TermsVersion" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "sections" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "TermsVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TermsVersion_version_key" ON "TermsVersion"("version");

-- CreateIndex
CREATE INDEX "TermsVersion_publishedAt_idx" ON "TermsVersion"("publishedAt");

