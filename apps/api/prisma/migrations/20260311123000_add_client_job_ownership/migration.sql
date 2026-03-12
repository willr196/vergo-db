ALTER TABLE "Job"
ADD COLUMN "clientId" TEXT;

CREATE INDEX "Job_clientId_idx" ON "Job"("clientId");

ALTER TABLE "Job"
ADD CONSTRAINT "Job_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
