-- CreateTable
CREATE TABLE "FileUploadVerification" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(500) NOT NULL,
    "applicantId" VARCHAR(36) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "FileUploadVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FileUploadVerification_key_key" ON "FileUploadVerification"("key");

-- CreateIndex
CREATE INDEX "FileUploadVerification_key_idx" ON "FileUploadVerification"("key");

-- CreateIndex
CREATE INDEX "FileUploadVerification_expiresAt_idx" ON "FileUploadVerification"("expiresAt");
