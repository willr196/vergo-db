-- The Christmas 2026 price list (30 October 2026): elves and festive hosts go
-- to £22/hr, the performer rate becomes the carollers' rate, and Santa and Mrs
-- Claus, face painting and event chefs (from) get rates of their own. New
-- Year's Eve goes from +25% to +50% from 7pm. Chefs are from £24/hr everywhere,
-- the costume FAQ names the £15 fee, and Christmas sits in the header for the
-- whole season rather than from 1 November.
--
-- Only on a card that already has rows: an empty table serves the defaults in
-- site/rates.ts, which carry these figures. Amounts are changed only where they
-- are still the old default, so an edit made in the admin stands. Running it
-- twice changes nothing.

INSERT INTO "Rate" ("id", "key", "label", "amountPence", "unit", "category", "visibility", "active", "sortOrder", "updatedBy", "updatedAt")
SELECT 'rate_' || card."key", card."key", card."label", card."amountPence", 'hour', card."category", 'public', true, card."sortOrder", 'migration', CURRENT_TIMESTAMP
FROM (VALUES
  ('santa_claus', 'Santa and Mrs Claus', 3500, 'seasonal', 4),
  ('face_painting', 'Face painting', 5500, 'specialist', 6),
  ('event_chef', 'Event chefs (from)', 2400, 'specialist', 7)
) AS card ("key", "label", "amountPence", "category", "sortOrder")
WHERE EXISTS (SELECT 1 FROM "Rate")
ON CONFLICT ("key") DO NOTHING;

UPDATE "Rate" SET "amountPence" = 2200, "updatedBy" = 'migration', "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'themed_hospitality' AND "amountPence" = 2100;

UPDATE "Rate" SET "label" = 'Elves and festive hosts'
WHERE "key" = 'themed_hospitality' AND "label" = 'Themed hospitality staff';

UPDATE "Rate" SET "label" = 'Carollers (per singer)'
WHERE "key" = 'character_performer' AND "label" = 'Character performers';

UPDATE "Rate" SET "sortOrder" = 5
WHERE "key" = 'makeup_artist' AND "sortOrder" = 4;

-- The uplift lives in the "rates" settings row once the admin has saved it.
UPDATE "SiteSetting" SET "value" = jsonb_set("value"::jsonb, '{newYearsEveUpliftPct}', '50'), "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'rates' AND "value"::jsonb ->> 'newYearsEveUpliftPct' = '25';

-- "Chefs from £24/hr;" now leads this line wherever it shows.
UPDATE "SiteSetting" SET "value" = jsonb_set("value"::jsonb, '{seniorRolesQuoted}', '"Managers, cleaners and security quoted separately."'), "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'terms' AND "value"::jsonb ->> 'seniorRolesQuoted' = 'Chefs, managers, cleaners and security quoted separately.';

UPDATE "Faq" SET "answer" = 'From {{CHEF_FROM_RATE}}/hr per chef. The menu, the hours and the kind of kitchen set the rate, and we agree it before you book.'
WHERE "pageKey" = 'hire/event-chefs' AND "answer" = 'Quoted on the brief, by headcount, hours and the kind of kitchen.';

UPDATE "Faq" SET "answer" = 'Yes. The festive team arrives in costume, or we can style yours. Costume and styling is {{COSTUME_FEE}} per booking.'
WHERE "pageKey" = 'special-events/christmas' AND "answer" = 'Yes. The festive team arrives in costume, or we can style yours.';

-- Only the window the defaults set: a header window chosen in the admin stands.
UPDATE "SeasonalPromo" SET "navStartsAt" = NULL, "navEndsAt" = NULL
WHERE "key" = 'christmas' AND "navStartsAt" = '2026-11-01 00:00:00' AND "navEndsAt" = '2026-12-20 23:59:59.999';
