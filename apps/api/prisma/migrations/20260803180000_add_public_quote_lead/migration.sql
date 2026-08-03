-- Anonymous public "get a quote" submissions get their own table, kept
-- deliberately separate from QuoteRequest (which requires a Client) so this
-- one never has to trust a caller-supplied client identity.
CREATE TABLE "PublicQuoteLead" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "company" TEXT,
    "eventType" TEXT NOT NULL,
    "eventDate" TEXT,
    "duration" INTEGER,
    "location" TEXT,
    "venue" TEXT,
    "shiftStart" TEXT,
    "shiftEnd" TEXT,
    "guestCount" INTEGER,
    "requestedLane" "BookingLane",
    "staffNeeded" INTEGER NOT NULL,
    "roles" TEXT,
    "message" TEXT,
    "estimatedTotal" DECIMAL(10,2),

    CONSTRAINT "PublicQuoteLead_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PublicQuoteLead_createdAt_idx" ON "PublicQuoteLead"("createdAt");

CREATE INDEX "PublicQuoteLead_email_idx" ON "PublicQuoteLead"("email");
