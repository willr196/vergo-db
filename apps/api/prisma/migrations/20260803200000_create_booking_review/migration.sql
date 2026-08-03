-- BookingReview and its live route (POST .../client/bookings/:id/review in
-- webAuth.ts) have existed since the "Portal auth, onboarding flow, admin
-- improvements" commit, but no migration ever actually created the table —
-- every client review submission has been hitting a table that doesn't
-- exist. This creates it, with real foreign keys on staffId/clientId (the
-- schema previously only indexed them, unlike every comparable relation
-- elsewhere in the schema).
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

CREATE UNIQUE INDEX "BookingReview_bookingId_key" ON "BookingReview"("bookingId");

CREATE INDEX "BookingReview_staffId_idx" ON "BookingReview"("staffId");

CREATE INDEX "BookingReview_clientId_idx" ON "BookingReview"("clientId");

ALTER TABLE "BookingReview" ADD CONSTRAINT "BookingReview_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BookingReview" ADD CONSTRAINT "BookingReview_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BookingReview" ADD CONSTRAINT "BookingReview_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
