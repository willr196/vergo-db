-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "templateId" TEXT;

-- CreateTable
CREATE TABLE "BookingTemplate" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "role" TEXT,
    "weekdays" INTEGER[],
    "shiftStart" TEXT NOT NULL,
    "shiftEnd" TEXT NOT NULL,
    "breakMins" INTEGER NOT NULL DEFAULT 0,
    "hourlyRateCharged" DECIMAL(10,2),
    "staffPayRate" DECIMAL(10,2),
    "bookingLane" "BookingLane" NOT NULL DEFAULT 'FLEX',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BookingTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingTemplate_clientId_idx" ON "BookingTemplate"("clientId");

-- CreateIndex
CREATE INDEX "BookingTemplate_staffId_idx" ON "BookingTemplate"("staffId");

-- CreateIndex
CREATE INDEX "BookingTemplate_active_idx" ON "BookingTemplate"("active");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_templateId_eventDate_key" ON "Booking"("templateId", "eventDate");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "BookingTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingTemplate" ADD CONSTRAINT "BookingTemplate_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingTemplate" ADD CONSTRAINT "BookingTemplate_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

