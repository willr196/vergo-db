-- Drafts for Admin > Site content (FAQs and seasonal promos). A new table only;
-- nothing existing changes, and the old code never reads it.

CREATE TABLE IF NOT EXISTS "ContentDraft" (
    "id" TEXT NOT NULL,
    "collection" VARCHAR(20) NOT NULL,
    "rowId" VARCHAR(191),
    "data" JSONB NOT NULL,
    "who" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentDraft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ContentDraft_collection_rowId_idx" ON "ContentDraft"("collection", "rowId");
