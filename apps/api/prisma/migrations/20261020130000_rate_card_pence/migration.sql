-- The rate card as rows in whole pence. Until now the five charge rates sat as
-- pounds inside the "rates" SiteSetting JSON. This creates the table and, if it
-- is empty, fills it from that row's figures (so an amount already edited in
-- the admin carries over), falling back to the rates in config/pricing.ts.
-- The old figures stay in the JSON row, unread, so the previous release still
-- works if it has to be redeployed.

CREATE TABLE IF NOT EXISTS "Rate" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "amountPence" INTEGER,
    "unit" VARCHAR(10) NOT NULL DEFAULT 'hour',
    "category" VARCHAR(20) NOT NULL DEFAULT 'standard',
    "visibility" VARCHAR(20) NOT NULL DEFAULT 'public',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedBy" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Rate_key_key" ON "Rate"("key");
CREATE INDEX IF NOT EXISTS "Rate_active_sortOrder_idx" ON "Rate"("active", "sortOrder");

-- Only on a database whose site content has been imported: before that, the
-- site ignores these tables and the import writes the rows itself.
WITH s AS (SELECT "value" AS v FROM "SiteSetting" WHERE "key" = 'rates'),
     marker AS (SELECT 1 FROM "SiteSetting" WHERE "key" = 'contentSeeded'),
     card ("key", "label", "field", "fallback", "category", "sortOrder") AS (VALUES
       ('standard', 'Standard (waiting, bar, kitchen porters, runners, hosts)', 'standardRate', 1900, 'standard', 0),
       ('premium', 'Premium (2+ years'' event experience)', 'premiumRate', 2400, 'standard', 1),
       ('themed_hospitality', 'Themed hospitality staff', 'themedHospitality', 2100, 'seasonal', 2),
       ('character_performer', 'Character performers and scare actors', 'characterPerformer', 2600, 'seasonal', 3),
       ('makeup_artist', 'Makeup artists', 'makeupArtist', 3500, 'specialist', 4))
INSERT INTO "Rate" ("id", "key", "label", "amountPence", "unit", "category", "visibility", "active", "sortOrder", "updatedBy", "updatedAt")
SELECT 'rate_' || card."key", card."key", card."label",
       COALESCE((SELECT ROUND((s.v ->> card."field")::numeric * 100)::int FROM s WHERE s.v ? card."field"), card."fallback"),
       'hour', card."category", 'public', true, card."sortOrder", 'migration', CURRENT_TIMESTAMP
FROM card
WHERE EXISTS (SELECT 1 FROM marker)
ON CONFLICT ("key") DO NOTHING;
