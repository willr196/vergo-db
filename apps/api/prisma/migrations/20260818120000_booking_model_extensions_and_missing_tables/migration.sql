-- CreateEnum
CREATE TYPE "JobInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "clientPaidAt" TIMESTAMP(3),
ADD COLUMN     "invoiceRef" TEXT,
ADD COLUMN     "invoicedAt" TIMESTAMP(3),
ADD COLUMN     "staffPaidAt" TIMESTAMP(3),
ADD COLUMN     "staffPayDueAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "niLiable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pensionEnrolled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Availability" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "dateFrom" DATE NOT NULL,
    "dateTo" DATE NOT NULL,
    "notes" VARCHAR(200),

    CONSTRAINT "Availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobInvite" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "jobId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "JobInviteStatus" NOT NULL DEFAULT 'PENDING',
    "adminNote" VARCHAR(500),
    "workerNote" VARCHAR(500),
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "JobInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingReview" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bookingId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" VARCHAR(1000),

    CONSTRAINT "BookingReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Availability_userId_idx" ON "Availability"("userId");

-- CreateIndex
CREATE INDEX "Availability_dateFrom_dateTo_idx" ON "Availability"("dateFrom", "dateTo");

-- CreateIndex
CREATE INDEX "JobInvite_jobId_idx" ON "JobInvite"("jobId");

-- CreateIndex
CREATE INDEX "JobInvite_userId_idx" ON "JobInvite"("userId");

-- CreateIndex
CREATE INDEX "JobInvite_status_idx" ON "JobInvite"("status");

-- CreateIndex
CREATE UNIQUE INDEX "JobInvite_jobId_userId_key" ON "JobInvite"("jobId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingReview_bookingId_key" ON "BookingReview"("bookingId");

-- CreateIndex
CREATE INDEX "BookingReview_staffId_idx" ON "BookingReview"("staffId");

-- CreateIndex
CREATE INDEX "BookingReview_clientId_idx" ON "BookingReview"("clientId");

-- CreateIndex
CREATE INDEX "Booking_clientPaidAt_staffPaidAt_idx" ON "Booking"("clientPaidAt", "staffPaidAt");

-- AddForeignKey
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobInvite" ADD CONSTRAINT "JobInvite_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobInvite" ADD CONSTRAINT "JobInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingReview" ADD CONSTRAINT "BookingReview_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

