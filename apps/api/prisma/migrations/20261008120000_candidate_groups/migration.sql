-- Admin-named candidate groups ("Good bartenders"). Additive only: two new tables.

-- CreateTable
CREATE TABLE "CandidateGroup" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" VARCHAR(80) NOT NULL,

    CONSTRAINT "CandidateGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateGroupMember" (
    "groupId" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedBy" VARCHAR(100),

    CONSTRAINT "CandidateGroupMember_pkey" PRIMARY KEY ("groupId","applicantId")
);

-- CreateIndex
CREATE UNIQUE INDEX "CandidateGroup_name_key" ON "CandidateGroup"("name");

-- CreateIndex
CREATE INDEX "CandidateGroupMember_applicantId_idx" ON "CandidateGroupMember"("applicantId");

-- AddForeignKey
ALTER TABLE "CandidateGroupMember" ADD CONSTRAINT "CandidateGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CandidateGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateGroupMember" ADD CONSTRAINT "CandidateGroupMember_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

