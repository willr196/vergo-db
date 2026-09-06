ALTER TABLE "JobApplication"
ADD COLUMN "applyIdempotencyKey" TEXT;

CREATE UNIQUE INDEX "JobApplication_applyIdempotencyKey_key"
ON "JobApplication"("applyIdempotencyKey");
