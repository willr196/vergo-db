-- CreateEnum
CREATE TYPE "BookingLane" AS ENUM ('FLEX', 'SELECT', 'MANAGED');

-- AlterTable
ALTER TABLE "QuoteRequest"
ADD COLUMN "requestedLane" "BookingLane";

-- AlterTable
ALTER TABLE "Booking"
ADD COLUMN "bookingLane" "BookingLane" NOT NULL DEFAULT 'FLEX';

-- Backfill existing marketplace bookings based on the staff tier that was booked.
UPDATE "Booking"
SET "bookingLane" = CASE
  WHEN "staffTierAtBooking" = 'ELITE' THEN 'SELECT'
  ELSE 'FLEX'
END;

-- CreateIndex
CREATE INDEX "QuoteRequest_requestedLane_idx" ON "QuoteRequest"("requestedLane");

-- CreateIndex
CREATE INDEX "Booking_bookingLane_idx" ON "Booking"("bookingLane");
