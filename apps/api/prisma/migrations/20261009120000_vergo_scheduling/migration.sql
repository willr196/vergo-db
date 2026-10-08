-- CreateEnum
CREATE TYPE "SchedJobStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SchedInvoiceStatus" AS ENUM ('NOT_INVOICED', 'INVOICED', 'PAID');

-- CreateEnum
CREATE TYPE "SchedStaffStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "SchedLeadChannel" AS ENUM ('EMAIL', 'PHONE', 'IN_PERSON', 'OTHER');

-- CreateEnum
CREATE TYPE "SchedLeadStage" AS ENUM ('CONTACTED', 'REPLIED', 'WON', 'LOST');

-- CreateTable
CREATE TABLE "sched_client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "defaultChargeRate" DECIMAL(10,2),
    "notes" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sched_client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sched_job" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "clientId" TEXT,
    "title" TEXT NOT NULL,
    "venueName" TEXT,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "endDate" DATE,
    "ongoing" BOOLEAN NOT NULL DEFAULT false,
    "repeatDays" INTEGER[],
    "seriesId" TEXT,
    "staffNeeded" INTEGER,
    "roleNeeded" TEXT,
    "chargeRate" DECIMAL(10,2) NOT NULL,
    "status" "SchedJobStatus" NOT NULL DEFAULT 'CONFIRMED',
    "invoiceStatus" "SchedInvoiceStatus" NOT NULL DEFAULT 'NOT_INVOICED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sched_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sched_staff" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "hourlyRate" DECIMAL(10,2),
    "status" "SchedStaffStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sched_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sched_assignment" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "hours" DECIMAL(5,2) NOT NULL,
    "rateOverride" DECIMAL(10,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sched_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sched_job_schedule_item" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "time" TEXT,
    "title" TEXT NOT NULL,
    "assignee" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sched_job_schedule_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sched_lead" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "contactedOn" DATE NOT NULL,
    "channel" "SchedLeadChannel" NOT NULL DEFAULT 'EMAIL',
    "stage" "SchedLeadStage" NOT NULL DEFAULT 'CONTACTED',
    "notes" TEXT,
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sched_lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sched_client_archived_name_idx" ON "sched_client"("archived", "name");

-- CreateIndex
CREATE UNIQUE INDEX "sched_job_reference_key" ON "sched_job"("reference");

-- CreateIndex
CREATE INDEX "sched_job_date_idx" ON "sched_job"("date");

-- CreateIndex
CREATE INDEX "sched_job_clientId_date_idx" ON "sched_job"("clientId", "date");

-- CreateIndex
CREATE INDEX "sched_job_status_date_idx" ON "sched_job"("status", "date");

-- CreateIndex
CREATE INDEX "sched_job_invoiceStatus_status_date_idx" ON "sched_job"("invoiceStatus", "status", "date");

-- CreateIndex
CREATE INDEX "sched_job_seriesId_date_idx" ON "sched_job"("seriesId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "sched_staff_email_key" ON "sched_staff"("email");

-- CreateIndex
CREATE INDEX "sched_staff_status_lastName_idx" ON "sched_staff"("status", "lastName");

-- CreateIndex
CREATE INDEX "sched_assignment_staffId_idx" ON "sched_assignment"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "sched_assignment_jobId_staffId_key" ON "sched_assignment"("jobId", "staffId");

-- CreateIndex
CREATE INDEX "sched_job_schedule_item_jobId_time_idx" ON "sched_job_schedule_item"("jobId", "time");

-- CreateIndex
CREATE UNIQUE INDEX "sched_lead_clientId_key" ON "sched_lead"("clientId");

-- CreateIndex
CREATE INDEX "sched_lead_stage_contactedOn_idx" ON "sched_lead"("stage", "contactedOn");

-- AddForeignKey
ALTER TABLE "sched_job" ADD CONSTRAINT "sched_job_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "sched_client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sched_assignment" ADD CONSTRAINT "sched_assignment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "sched_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sched_assignment" ADD CONSTRAINT "sched_assignment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "sched_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sched_job_schedule_item" ADD CONSTRAINT "sched_job_schedule_item_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "sched_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sched_lead" ADD CONSTRAINT "sched_lead_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "sched_client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

