-- Repeating Ops bookings (ongoing contracts). Additive only: one new table, one
-- nullable column on OpsBooking and a unique (seriesId, eventDate) so a day is
-- never created twice, even if two machines fill ahead at the same moment.

-- AlterTable
ALTER TABLE "OpsBooking" ADD COLUMN     "seriesId" TEXT;

-- CreateTable
CREATE TABLE "OpsBookingSeries" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientId" TEXT NOT NULL,
    "patternBookingId" TEXT NOT NULL,
    "weekdays" INTEGER[],
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "aheadWeeks" INTEGER NOT NULL DEFAULT 6,
    "generatedThrough" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" VARCHAR(100),

    CONSTRAINT "OpsBookingSeries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OpsBookingSeries_active_idx" ON "OpsBookingSeries"("active");

-- CreateIndex
CREATE INDEX "OpsBookingSeries_clientId_idx" ON "OpsBookingSeries"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "OpsBooking_seriesId_eventDate_key" ON "OpsBooking"("seriesId", "eventDate");

-- AddForeignKey
ALTER TABLE "OpsBooking" ADD CONSTRAINT "OpsBooking_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "OpsBookingSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsBookingSeries" ADD CONSTRAINT "OpsBookingSeries_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsBookingSeries" ADD CONSTRAINT "OpsBookingSeries_patternBookingId_fkey" FOREIGN KEY ("patternBookingId") REFERENCES "OpsBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

