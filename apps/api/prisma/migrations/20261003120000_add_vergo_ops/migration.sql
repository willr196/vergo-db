-- VERGO Ops. Additive only: new enums and tables, and nullable or defaulted
-- columns on Client, Booking and RightToWorkCheck. No existing column is
-- dropped, renamed or retyped, and no data is rewritten. Generated with
-- prisma migrate diff from the schema before and after this change.

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('BUSINESS_HIRER', 'PRIVATE_CONSUMER', 'AGENCY', 'VENUE', 'CATERER', 'PRODUCTION', 'OTHER');

-- CreateEnum
CREATE TYPE "WorkerActiveStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'LEFT');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('NOT_ADDED', 'PENDING', 'ACTIVE', 'LEAVER');

-- CreateEnum
CREATE TYPE "PensionStatus" AS ENUM ('NOT_ASSESSED', 'NOT_ELIGIBLE_CURRENTLY', 'ELIGIBLE', 'ENROLLED', 'OPTED_IN', 'OPTED_OUT', 'ENTITLED_WORKER', 'POSTPONED', 'REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "HolidayPayMethod" AS ENUM ('ROLLED_UP', 'ACCRUED');

-- CreateEnum
CREATE TYPE "OpsDocumentType" AS ENUM ('KEY_INFORMATION_DOCUMENT', 'ZERO_HOURS_AGREEMENT', 'ASSIGNMENT_CONFIRMATION', 'RTW_CHECKLIST', 'ONBOARDING_CHECKLIST');

-- CreateEnum
CREATE TYPE "WorkerDocumentStatus" AS ENUM ('ISSUED', 'ACCEPTED', 'SUPERSEDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "OpsBookingStatus" AS ENUM ('DRAFT', 'QUOTED', 'CONFIRMED', 'STAFFING', 'FULLY_STAFFED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'INVOICED', 'PAID');

-- CreateEnum
CREATE TYPE "OpsCostKind" AS ENUM ('CHARGE', 'COST');

-- CreateEnum
CREATE TYPE "TransferFeeStatus" AS ENUM ('NOT_APPLICABLE', 'POSSIBLE', 'INVOICED', 'PAID', 'WAIVED');

-- AlterTable
ALTER TABLE "RightToWorkCheck" ADD COLUMN     "followUpDue" TIMESTAMP(3),
ADD COLUMN     "performedBy" VARCHAR(100),
ADD COLUMN     "prescribedCheckConfirmed" BOOLEAN;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "billingAddress" VARCHAR(500),
ADD COLUMN     "clientType" "ClientType" NOT NULL DEFAULT 'BUSINESS_HIRER',
ADD COLUMN     "paymentTerms" VARCHAR(200),
ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsAcceptedBy" VARCHAR(200),
ADD COLUMN     "termsSentAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" VARCHAR(40),
ADD COLUMN     "tradingName" VARCHAR(200),
ADD COLUMN     "venueAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "breakMins" INTEGER,
ADD COLUMN     "holidayPayMethod" "HolidayPayMethod",
ADD COLUMN     "opsBookingId" TEXT,
ADD COLUMN     "replacedByBookingId" TEXT,
ADD COLUMN     "requirementId" TEXT,
ADD COLUMN     "role" VARCHAR(80),
ADD COLUMN     "timesheetAdminApprovedAt" TIMESTAMP(3),
ADD COLUMN     "timesheetAdminApprovedBy" VARCHAR(100),
ADD COLUMN     "timesheetClientApprovedAt" TIMESTAMP(3),
ADD COLUMN     "timesheetClientApprovedBy" VARCHAR(200),
ADD COLUMN     "timesheetDisputeReason" VARCHAR(500),
ADD COLUMN     "timesheetDisputedAt" TIMESTAMP(3),
ADD COLUMN     "warningOverrideReason" VARCHAR(500);

-- CreateTable
CREATE TABLE "WorkerProfile" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "activeStatus" "WorkerActiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "qualifications" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "experienceNotes" VARCHAR(2000),
    "internalNotes" VARCHAR(2000),
    "internalRating" INTEGER,
    "availabilityNotes" VARCHAR(1000),
    "emergencyContactName" VARCHAR(120),
    "emergencyContactPhone" VARCHAR(40),
    "rtwBlocked" BOOLEAN NOT NULL DEFAULT false,
    "rtwBlockedReason" VARCHAR(500),
    "payrollStatus" "PayrollStatus" NOT NULL DEFAULT 'NOT_ADDED',
    "payrollExternalReference" VARCHAR(120),
    "pensionStatus" "PensionStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
    "pensionLastAssessedAt" TIMESTAMP(3),
    "pensionNotes" VARCHAR(1000),
    "readyOverride" BOOLEAN NOT NULL DEFAULT false,
    "readyOverrideReason" VARCHAR(500),
    "readyOverrideBy" VARCHAR(100),
    "readyOverrideAt" TIMESTAMP(3),

    CONSTRAINT "WorkerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "OpsDocumentType" NOT NULL,
    "version" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "changeNote" VARCHAR(500),
    "createdBy" VARCHAR(100) NOT NULL,
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerDocument" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "type" "OpsDocumentType" NOT NULL,
    "version" INTEGER NOT NULL,
    "bookingId" TEXT,
    "status" "WorkerDocumentStatus" NOT NULL DEFAULT 'ISSUED',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedBy" VARCHAR(100) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedName" VARCHAR(200),
    "acceptanceMethod" VARCHAR(200),
    "acceptanceRecordedBy" VARCHAR(100),
    "supersededAt" TIMESTAMP(3),
    "renderedBody" TEXT NOT NULL,

    CONSTRAINT "WorkerDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsBooking" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reference" VARCHAR(20) NOT NULL,
    "clientId" TEXT NOT NULL,
    "quoteRequestId" TEXT,
    "bookingType" VARCHAR(80),
    "eventType" VARCHAR(120),
    "venue" VARCHAR(200),
    "address" VARCHAR(500),
    "eventDate" DATE NOT NULL,
    "startTime" VARCHAR(5) NOT NULL,
    "expectedFinish" VARCHAR(5) NOT NULL,
    "actualFinish" VARCHAR(5),
    "guestNumbers" INTEGER,
    "onSiteContactName" VARCHAR(120),
    "onSiteContactPhone" VARCHAR(40),
    "vergoLead" VARCHAR(120),
    "status" "OpsBookingStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" VARCHAR(4000),
    "consumerTermsRequired" BOOLEAN NOT NULL DEFAULT false,
    "termsVersionAtBooking" VARCHAR(40),
    "invoiceRef" VARCHAR(80),
    "invoicedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "actualWagesPence" INTEGER,
    "actualHolidayPayPence" INTEGER,
    "actualEmployerCostsPence" INTEGER,
    "actualPayrollNote" VARCHAR(500),
    "actualPayrollRecordedBy" VARCHAR(100),
    "actualPayrollRecordedAt" TIMESTAMP(3),

    CONSTRAINT "OpsBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsRequirement" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "opsBookingId" TEXT NOT NULL,
    "role" VARCHAR(80) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "clientChargeRate" DECIMAL(10,2) NOT NULL,
    "workerPayRate" DECIMAL(10,2) NOT NULL,
    "minimumHours" DECIMAL(5,2),
    "afterMidnightMultiplier" DECIMAL(4,2),
    "travelContribution" DECIMAL(10,2),
    "expenses" DECIMAL(10,2),
    "breakMins" INTEGER NOT NULL DEFAULT 0,
    "requiredExperience" VARCHAR(500),
    "requiredQualifications" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dressCode" VARCHAR(500),
    "equipment" VARCHAR(500),
    "duties" VARCHAR(2000),
    "healthSafetyRisks" VARCHAR(2000),
    "riskControls" VARCHAR(2000),
    "breakInfo" VARCHAR(500),

    CONSTRAINT "OpsRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsBookingCost" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opsBookingId" TEXT NOT NULL,
    "kind" "OpsCostKind" NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "amountPence" INTEGER NOT NULL,
    "createdBy" VARCHAR(100) NOT NULL,

    CONSTRAINT "OpsBookingCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricPayment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,
    "workerName" VARCHAR(200) NOT NULL,
    "paymentDate" DATE NOT NULL,
    "hours" DECIMAL(7,2),
    "basePay" DECIMAL(10,2),
    "holidayPay" DECIMAL(10,2),
    "grossTransferred" DECIMAL(10,2) NOT NULL,
    "notes" VARCHAR(1000),
    "payrollCorrected" BOOLEAN NOT NULL DEFAULT false,
    "fpsSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "hmrcReconciled" BOOLEAN NOT NULL DEFAULT false,
    "importBatch" VARCHAR(60),
    "createdBy" VARCHAR(100) NOT NULL,

    CONSTRAINT "HistoricPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectHireTracking" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "lastAssignmentDate" DATE,
    "relevantPeriodEnd" DATE,
    "directHireReported" BOOLEAN NOT NULL DEFAULT false,
    "directHireReportedAt" TIMESTAMP(3),
    "extendedHireOption" BOOLEAN NOT NULL DEFAULT false,
    "transferFeeStatus" "TransferFeeStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "notes" VARCHAR(1000),

    CONSTRAINT "DirectHireTracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsSetting" (
    "key" VARCHAR(80) NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" VARCHAR(100) NOT NULL,

    CONSTRAINT "OpsSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" VARCHAR(100) NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "entityType" VARCHAR(40) NOT NULL,
    "entityId" VARCHAR(40) NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "reason" VARCHAR(1000),

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkerProfile_userId_key" ON "WorkerProfile"("userId");

-- CreateIndex
CREATE INDEX "WorkerProfile_activeStatus_idx" ON "WorkerProfile"("activeStatus");

-- CreateIndex
CREATE INDEX "WorkerProfile_payrollStatus_idx" ON "WorkerProfile"("payrollStatus");

-- CreateIndex
CREATE INDEX "WorkerProfile_pensionStatus_idx" ON "WorkerProfile"("pensionStatus");

-- CreateIndex
CREATE INDEX "DocumentTemplate_type_retiredAt_idx" ON "DocumentTemplate"("type", "retiredAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplate_type_version_key" ON "DocumentTemplate"("type", "version");

-- CreateIndex
CREATE INDEX "WorkerDocument_userId_type_idx" ON "WorkerDocument"("userId", "type");

-- CreateIndex
CREATE INDEX "WorkerDocument_bookingId_idx" ON "WorkerDocument"("bookingId");

-- CreateIndex
CREATE INDEX "WorkerDocument_status_idx" ON "WorkerDocument"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OpsBooking_reference_key" ON "OpsBooking"("reference");

-- CreateIndex
CREATE INDEX "OpsBooking_clientId_idx" ON "OpsBooking"("clientId");

-- CreateIndex
CREATE INDEX "OpsBooking_eventDate_idx" ON "OpsBooking"("eventDate");

-- CreateIndex
CREATE INDEX "OpsBooking_status_idx" ON "OpsBooking"("status");

-- CreateIndex
CREATE INDEX "OpsRequirement_opsBookingId_idx" ON "OpsRequirement"("opsBookingId");

-- CreateIndex
CREATE INDEX "OpsBookingCost_opsBookingId_idx" ON "OpsBookingCost"("opsBookingId");

-- CreateIndex
CREATE INDEX "HistoricPayment_userId_idx" ON "HistoricPayment"("userId");

-- CreateIndex
CREATE INDEX "HistoricPayment_paymentDate_idx" ON "HistoricPayment"("paymentDate");

-- CreateIndex
CREATE INDEX "DirectHireTracking_clientId_idx" ON "DirectHireTracking"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "DirectHireTracking_userId_clientId_key" ON "DirectHireTracking"("userId", "clientId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "Booking_opsBookingId_idx" ON "Booking"("opsBookingId");

-- CreateIndex
CREATE INDEX "Booking_staffId_eventDate_idx" ON "Booking"("staffId", "eventDate");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_opsBookingId_fkey" FOREIGN KEY ("opsBookingId") REFERENCES "OpsBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "OpsRequirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerProfile" ADD CONSTRAINT "WorkerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerDocument" ADD CONSTRAINT "WorkerDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerDocument" ADD CONSTRAINT "WorkerDocument_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerDocument" ADD CONSTRAINT "WorkerDocument_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsBooking" ADD CONSTRAINT "OpsBooking_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsBooking" ADD CONSTRAINT "OpsBooking_quoteRequestId_fkey" FOREIGN KEY ("quoteRequestId") REFERENCES "QuoteRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsRequirement" ADD CONSTRAINT "OpsRequirement_opsBookingId_fkey" FOREIGN KEY ("opsBookingId") REFERENCES "OpsBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsBookingCost" ADD CONSTRAINT "OpsBookingCost_opsBookingId_fkey" FOREIGN KEY ("opsBookingId") REFERENCES "OpsBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricPayment" ADD CONSTRAINT "HistoricPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectHireTracking" ADD CONSTRAINT "DirectHireTracking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectHireTracking" ADD CONSTRAINT "DirectHireTracking_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

