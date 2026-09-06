-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "checkedInAt" TIMESTAMP(3),
ADD COLUMN     "checkedOutAt" TIMESTAMP(3),
ADD COLUMN     "hoursWorked" DECIMAL(5,2),
ADD COLUMN     "workerShiftNotes" TEXT;

-- CreateIndex
CREATE INDEX "Booking_checkedInAt_checkedOutAt_idx" ON "Booking"("checkedInAt", "checkedOutAt");
