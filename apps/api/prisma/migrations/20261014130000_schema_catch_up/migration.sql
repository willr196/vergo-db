-- Everything schema.prisma has that no migration ever made. These were applied
-- to the live databases out-of-band (db push / manual SQL), so a database built
-- from migrations alone (CI, a fresh container, a restore) was missing them and
-- job applications 500'd on it. Every statement checks first, so on a database
-- that already has them this migration changes nothing.

-- Enums
DO $$ BEGIN
  CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'COMPLAINED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ScheduledEmailStatus" AS ENUM ('SCHEDULED', 'SENT', 'CANCELLED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ContactType lost EVENT_ENQUIRY. Only rebuilt where the old value is still
-- there; a contact still using it stops the migration rather than being
-- silently reclassified.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'ContactType' AND e.enumlabel = 'EVENT_ENQUIRY'
  ) THEN
    IF EXISTS (SELECT 1 FROM "Contact" WHERE "type"::text = 'EVENT_ENQUIRY') THEN
      RAISE EXCEPTION 'Contact rows still use ContactType EVENT_ENQUIRY; reclassify them before migrating';
    END IF;
    CREATE TYPE "ContactType_new" AS ENUM ('STAFF_REQUEST', 'GENERAL');
    ALTER TABLE "Contact" ALTER COLUMN "type" TYPE "ContactType_new" USING ("type"::text::"ContactType_new");
    ALTER TYPE "ContactType" RENAME TO "ContactType_old";
    ALTER TYPE "ContactType_new" RENAME TO "ContactType";
    DROP TYPE "ContactType_old";
  END IF;
END $$;

-- Columns
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "cvFileSize" INTEGER,
ADD COLUMN IF NOT EXISTS "cvMimeType" TEXT,
ADD COLUMN IF NOT EXISTS "cvUploadedAt" TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "ApplicationRole" ADD COLUMN IF NOT EXISTS "experienceLevel" TEXT;

-- Tables
CREATE TABLE IF NOT EXISTS "Email" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resendId" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "emailType" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "userId" TEXT,
    "clientId" TEXT,

    CONSTRAINT "Email_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EmailEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventType" TEXT NOT NULL,
    "payload" JSONB,
    "emailId" TEXT NOT NULL,

    CONSTRAINT "EmailEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EmailPreferences" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,
    "clientId" TEXT,
    "marketing" BOOLEAN NOT NULL DEFAULT true,
    "notifications" BOOLEAN NOT NULL DEFAULT true,
    "jobAlerts" BOOLEAN NOT NULL DEFAULT true,
    "quoteUpdates" BOOLEAN NOT NULL DEFAULT true,
    "unsubscribeToken" TEXT NOT NULL,

    CONSTRAINT "EmailPreferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ScheduledEmail" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "jobId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "ScheduledEmailStatus" NOT NULL DEFAULT 'SCHEDULED',
    "emailType" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "ScheduledEmail_pkey" PRIMARY KEY ("id")
);

-- The web session store (connect-pg-simple also creates this on boot).
CREATE TABLE IF NOT EXISTS "user_sessions" (
    "sid" VARCHAR NOT NULL,
    "sess" JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "Email_resendId_key" ON "Email"("resendId");
CREATE INDEX IF NOT EXISTS "Email_resendId_idx" ON "Email"("resendId");
CREATE INDEX IF NOT EXISTS "Email_userId_idx" ON "Email"("userId");
CREATE INDEX IF NOT EXISTS "Email_clientId_idx" ON "Email"("clientId");
CREATE INDEX IF NOT EXISTS "Email_status_idx" ON "Email"("status");
CREATE INDEX IF NOT EXISTS "Email_createdAt_idx" ON "Email"("createdAt");
CREATE INDEX IF NOT EXISTS "EmailEvent_emailId_idx" ON "EmailEvent"("emailId");
CREATE INDEX IF NOT EXISTS "EmailEvent_eventType_idx" ON "EmailEvent"("eventType");
CREATE INDEX IF NOT EXISTS "EmailEvent_createdAt_idx" ON "EmailEvent"("createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "EmailPreferences_userId_key" ON "EmailPreferences"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "EmailPreferences_clientId_key" ON "EmailPreferences"("clientId");
CREATE UNIQUE INDEX IF NOT EXISTS "EmailPreferences_unsubscribeToken_key" ON "EmailPreferences"("unsubscribeToken");
CREATE INDEX IF NOT EXISTS "EmailPreferences_unsubscribeToken_idx" ON "EmailPreferences"("unsubscribeToken");
CREATE UNIQUE INDEX IF NOT EXISTS "ScheduledEmail_jobId_key" ON "ScheduledEmail"("jobId");
CREATE INDEX IF NOT EXISTS "ScheduledEmail_status_idx" ON "ScheduledEmail"("status");
CREATE INDEX IF NOT EXISTS "ScheduledEmail_scheduledFor_idx" ON "ScheduledEmail"("scheduledFor");
CREATE INDEX IF NOT EXISTS "ScheduledEmail_recipientId_idx" ON "ScheduledEmail"("recipientId");
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "user_sessions"("expire");

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "EmailEvent" ADD CONSTRAINT "EmailEvent_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "Email"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
