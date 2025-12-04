/*
  Warnings:

  - The values [APPLIED,HIRED] on the enum `JobApplicationStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `currency` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `employerId` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `employmentType` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `rateFrom` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `rateTo` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `source` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `validThrough` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `visibility` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `applicantId` on the `JobApplication` table. All the data in the column will be lost.
  - You are about to drop the column `applicationId` on the `JobApplication` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `JobApplication` table. All the data in the column will be lost.
  - You are about to drop the `Employer` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[userId,jobId]` on the table `JobApplication` will be added. If there are existing duplicate values, this will fail.
  - Made the column `roleId` on table `Job` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `userId` to the `JobApplication` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "PayType" AS ENUM ('HOURLY', 'DAILY', 'FIXED');

-- AlterEnum
BEGIN;
CREATE TYPE "JobApplicationStatus_new" AS ENUM ('PENDING', 'REVIEWED', 'SHORTLISTED', 'CONFIRMED', 'REJECTED', 'WITHDRAWN');
ALTER TABLE "public"."JobApplication" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "JobApplication" ALTER COLUMN "status" TYPE "JobApplicationStatus_new" USING ("status"::text::"JobApplicationStatus_new");
ALTER TYPE "JobApplicationStatus" RENAME TO "JobApplicationStatus_old";
ALTER TYPE "JobApplicationStatus_new" RENAME TO "JobApplicationStatus";
DROP TYPE "public"."JobApplicationStatus_old";
ALTER TABLE "JobApplication" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- DropForeignKey
ALTER TABLE "public"."Job" DROP CONSTRAINT "Job_employerId_fkey";

-- DropIndex
DROP INDEX "public"."JobApplication_applicantId_idx";

-- DropIndex
DROP INDEX "public"."JobApplication_jobId_status_idx";

-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "Job" DROP COLUMN "currency",
DROP COLUMN "employerId",
DROP COLUMN "employmentType",
DROP COLUMN "rateFrom",
DROP COLUMN "rateTo",
DROP COLUMN "source",
DROP COLUMN "validThrough",
DROP COLUMN "visibility",
ADD COLUMN     "closingDate" TIMESTAMP(3),
ADD COLUMN     "companyName" TEXT,
ADD COLUMN     "eventDate" TIMESTAMP(3),
ADD COLUMN     "eventEndDate" TIMESTAMP(3),
ADD COLUMN     "externalUrl" TEXT,
ADD COLUMN     "payRate" DECIMAL(10,2),
ADD COLUMN     "payType" "PayType" NOT NULL DEFAULT 'HOURLY',
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "requirements" TEXT,
ADD COLUMN     "shiftEnd" TEXT,
ADD COLUMN     "shiftStart" TEXT,
ADD COLUMN     "staffConfirmed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "staffNeeded" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "type" "JobType" NOT NULL DEFAULT 'INTERNAL',
ADD COLUMN     "venue" TEXT,
ALTER COLUMN "roleId" SET NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "JobApplication" DROP COLUMN "applicantId",
DROP COLUMN "applicationId",
DROP COLUMN "notes",
ADD COLUMN     "adminNotes" TEXT,
ADD COLUMN     "coverNote" TEXT,
ADD COLUMN     "userId" TEXT NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- DropTable
DROP TABLE "public"."Employer";

-- DropEnum
DROP TYPE "public"."EmploymentType";

-- DropEnum
DROP TYPE "public"."JobSource";

-- DropEnum
DROP TYPE "public"."JobVisibility";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifyToken" TEXT,
    "resetToken" TEXT,
    "resetTokenExp" TIMESTAMP(3),
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "applicantId" TEXT,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedJob" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,

    CONSTRAINT "SavedJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_applicantId_key" ON "User"("applicantId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "SavedJob_userId_jobId_key" ON "SavedJob"("userId", "jobId");

-- CreateIndex
CREATE INDEX "Job_status_type_idx" ON "Job"("status", "type");

-- CreateIndex
CREATE INDEX "Job_roleId_idx" ON "Job"("roleId");

-- CreateIndex
CREATE INDEX "Job_eventDate_idx" ON "Job"("eventDate");

-- CreateIndex
CREATE INDEX "Job_publishedAt_idx" ON "Job"("publishedAt");

-- CreateIndex
CREATE INDEX "JobApplication_status_idx" ON "JobApplication"("status");

-- CreateIndex
CREATE INDEX "JobApplication_createdAt_idx" ON "JobApplication"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobApplication_userId_jobId_key" ON "JobApplication"("userId", "jobId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
