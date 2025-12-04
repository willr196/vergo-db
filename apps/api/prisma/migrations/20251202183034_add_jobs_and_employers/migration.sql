/*
  Warnings:

  - You are about to drop the column `notes` on the `Application` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "JobSource" AS ENUM ('VERGO_INTERNAL', 'EXTERNAL_EMPLOYER');

-- CreateEnum
CREATE TYPE "JobVisibility" AS ENUM ('PUBLIC', 'ROSTER_ONLY', 'INVITE_ONLY');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'FILLED');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('TEMP', 'PERM', 'CONTRACT', 'PART_TIME', 'FULL_TIME', 'CASUAL');

-- CreateEnum
CREATE TYPE "JobApplicationStatus" AS ENUM ('APPLIED', 'SHORTLISTED', 'REJECTED', 'HIRED', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "Application" DROP COLUMN "notes";

-- CreateTable
CREATE TABLE "Employer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "employmentType" "EmploymentType" NOT NULL,
    "rateFrom" INTEGER,
    "rateTo" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "roleId" TEXT,
    "source" "JobSource" NOT NULL DEFAULT 'VERGO_INTERNAL',
    "visibility" "JobVisibility" NOT NULL DEFAULT 'ROSTER_ONLY',
    "status" "JobStatus" NOT NULL DEFAULT 'OPEN',
    "validThrough" TIMESTAMP(3) NOT NULL,
    "employerId" TEXT,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobApplication" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "jobId" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "applicationId" TEXT,
    "status" "JobApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "notes" TEXT,

    CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Employer_email_idx" ON "Employer"("email");

-- CreateIndex
CREATE INDEX "JobApplication_jobId_status_idx" ON "JobApplication"("jobId", "status");

-- CreateIndex
CREATE INDEX "JobApplication_applicantId_idx" ON "JobApplication"("applicantId");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
