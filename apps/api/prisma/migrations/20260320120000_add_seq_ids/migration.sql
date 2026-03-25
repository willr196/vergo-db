ALTER TABLE "User" ADD COLUMN "seqId" SERIAL;
CREATE UNIQUE INDEX "User_seqId_key" ON "User"("seqId");

ALTER TABLE "Client" ADD COLUMN "seqId" SERIAL;
CREATE UNIQUE INDEX "Client_seqId_key" ON "Client"("seqId");
