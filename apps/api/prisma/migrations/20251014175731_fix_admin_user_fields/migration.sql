/*
  Warnings:

  - You are about to drop the `ApplicantRole` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."ApplicantRole" DROP CONSTRAINT "ApplicantRole_applicantId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ApplicantRole" DROP CONSTRAINT "ApplicantRole_roleId_fkey";

-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "failedAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3);

-- DropTable
DROP TABLE "public"."ApplicantRole";

-- CreateTable
CREATE TABLE "ApplicationRole" (
    "applicationId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "ApplicationRole_pkey" PRIMARY KEY ("applicationId","roleId")
);

-- CreateIndex
CREATE INDEX "AdminUser_username_idx" ON "AdminUser"("username");

-- AddForeignKey
ALTER TABLE "ApplicationRole" ADD CONSTRAINT "ApplicationRole_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationRole" ADD CONSTRAINT "ApplicationRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
