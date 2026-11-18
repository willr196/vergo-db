-- Day-before shift reminders (18 November 2026): when the reminder email was
-- claimed for a shift, so it is sent once even with two machines running.
-- Nullable and empty to start; running it twice changes nothing.
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "reminderSentAt" TIMESTAMP(3);

-- Login by email link for staff: a hash of the one-time token and its expiry.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "loginLinkHash" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "loginLinkExp" TIMESTAMP(3);

-- Timesheet confirmation on the staff website: agreed, or queried with a note.
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "timesheetConfirmedAt" TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "timesheetQuery" TEXT;
