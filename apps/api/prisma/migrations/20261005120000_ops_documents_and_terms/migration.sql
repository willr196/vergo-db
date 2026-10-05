-- VERGO Ops: worker documents and client Terms of Business.
-- Additive only: new enum value, new tables, nullable or defaulted columns.

-- AlterEnum
-- The new value is not used anywhere in this migration (Postgres refuses a
-- newly added enum value inside the same transaction).
ALTER TYPE "OpsDocumentType" ADD VALUE 'CLIENT_TERMS_OF_BUSINESS';

-- CreateEnum
CREATE TYPE "DocumentLinkKind" AS ENUM ('WORKER_PACK', 'CLIENT_TERMS');

-- AlterTable
ALTER TABLE "DocumentTemplate" ADD COLUMN     "effectiveDate" DATE,
ADD COLUMN     "requiresReacceptance" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "variables" JSONB;

-- Existing versions took effect when they were created.
UPDATE "DocumentTemplate" SET "effectiveDate" = ("createdAt" AT TIME ZONE 'Europe/London')::date WHERE "effectiveDate" IS NULL;

-- AlterTable
ALTER TABLE "OpsBooking" ADD COLUMN     "advancePaymentRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paymentTermsDays" INTEGER;

-- AlterTable
ALTER TABLE "OpsRequirement" ADD COLUMN     "otherCharges" VARCHAR(500),
ADD COLUMN     "overtimeAfterHours" DECIMAL(5,2),
ADD COLUMN     "overtimeChargeRate" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "WorkerDocument" ADD COLUMN     "acceptanceIp" VARCHAR(64),
ADD COLUMN     "acceptanceStatement" VARCHAR(500),
ADD COLUMN     "acceptanceUserAgent" VARCHAR(300),
ADD COLUMN     "acceptedAuthUserId" VARCHAR(40),
ADD COLUMN     "acceptedViaLinkId" VARCHAR(40),
ADD COLUMN     "acknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "acknowledgedVia" VARCHAR(60),
ADD COLUMN     "bodySha256" VARCHAR(64);

-- CreateTable
CREATE TABLE "ClientDocument" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "WorkerDocumentStatus" NOT NULL DEFAULT 'ISSUED',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedBy" VARCHAR(100) NOT NULL,
    "renderedBody" TEXT NOT NULL,
    "bodySha256" VARCHAR(64) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "legalBusinessName" VARCHAR(200),
    "acceptedByName" VARCHAR(200),
    "acceptedByJobTitle" VARCHAR(120),
    "typedName" VARCHAR(200),
    "acceptanceMethod" VARCHAR(200),
    "acceptanceStatement" VARCHAR(500),
    "acceptanceRecordedBy" VARCHAR(100),
    "acceptedViaLinkId" VARCHAR(40),
    "acceptanceIp" VARCHAR(64),
    "acceptanceUserAgent" VARCHAR(300),
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "ClientDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentLink" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" "DocumentLinkKind" NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "userId" TEXT,
    "clientId" TEXT,
    "createdBy" VARCHAR(100) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastOpenedAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),

    CONSTRAINT "DocumentLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientDocument_clientId_status_idx" ON "ClientDocument"("clientId", "status");

-- CreateIndex
CREATE INDEX "ClientDocument_templateId_idx" ON "ClientDocument"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentLink_tokenHash_key" ON "DocumentLink"("tokenHash");

-- CreateIndex
CREATE INDEX "DocumentLink_userId_idx" ON "DocumentLink"("userId");

-- CreateIndex
CREATE INDEX "DocumentLink_clientId_idx" ON "DocumentLink"("clientId");

-- AddForeignKey
ALTER TABLE "ClientDocument" ADD CONSTRAINT "ClientDocument_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientDocument" ADD CONSTRAINT "ClientDocument_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
