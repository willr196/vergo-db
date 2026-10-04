-- CreateEnum
CREATE TYPE "OpsLeadChannel" AS ENUM ('EMAIL', 'PHONE', 'IN_PERSON', 'OTHER');

-- CreateEnum
CREATE TYPE "OpsLeadStage" AS ENUM ('CONTACTED', 'REPLIED', 'WON', 'LOST');

-- CreateTable
CREATE TABLE "OpsLead" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "company" VARCHAR(200) NOT NULL,
    "contactName" VARCHAR(120),
    "contactEmail" VARCHAR(255),
    "contactPhone" VARCHAR(40),
    "contactedOn" DATE NOT NULL,
    "channel" "OpsLeadChannel" NOT NULL DEFAULT 'EMAIL',
    "stage" "OpsLeadStage" NOT NULL DEFAULT 'CONTACTED',
    "notes" VARCHAR(4000),
    "clientId" TEXT,

    CONSTRAINT "OpsLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsScheduleItem" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "opsBookingId" TEXT NOT NULL,
    "time" VARCHAR(5),
    "title" VARCHAR(200) NOT NULL,
    "assignee" VARCHAR(120),
    "notes" VARCHAR(1000),

    CONSTRAINT "OpsScheduleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsLegacyImport" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entity" VARCHAR(40) NOT NULL,
    "legacyId" VARCHAR(40) NOT NULL,
    "newId" VARCHAR(40) NOT NULL,

    CONSTRAINT "OpsLegacyImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OpsLead_clientId_key" ON "OpsLead"("clientId");

-- CreateIndex
CREATE INDEX "OpsLead_stage_contactedOn_idx" ON "OpsLead"("stage", "contactedOn");

-- CreateIndex
CREATE INDEX "OpsScheduleItem_opsBookingId_time_idx" ON "OpsScheduleItem"("opsBookingId", "time");

-- CreateIndex
CREATE UNIQUE INDEX "OpsLegacyImport_entity_legacyId_key" ON "OpsLegacyImport"("entity", "legacyId");

-- AddForeignKey
ALTER TABLE "OpsLead" ADD CONSTRAINT "OpsLead_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsScheduleItem" ADD CONSTRAINT "OpsScheduleItem_opsBookingId_fkey" FOREIGN KEY ("opsBookingId") REFERENCES "OpsBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

