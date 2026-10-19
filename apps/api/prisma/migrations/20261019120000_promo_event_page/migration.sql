-- Seasonal promos also drive their event page: the dates line it shows while
-- in season, and the day it switches to "Now booking <next year>". Adds two
-- nullable columns and fills them for this year's two promos where empty, so
-- running it twice, or on a database without the promos, changes nothing.

ALTER TABLE "SeasonalPromo" ADD COLUMN IF NOT EXISTS "pageLine" VARCHAR(200);
ALTER TABLE "SeasonalPromo" ADD COLUMN IF NOT EXISTS "pageUntil" TIMESTAMP(3);

-- The line /special-events/halloween carried in its template until now.
UPDATE "SeasonalPromo" SET "pageLine" = 'Now booking 23–24 and 30–31 October.'
WHERE "key" = 'halloween' AND "pageLine" IS NULL;

-- Christmas sells New Year's Eve too, so its page stays in season to the end
-- of 31 December 2026 (London), past the banner's 20 December.
UPDATE "SeasonalPromo" SET "pageUntil" = '2026-12-31 23:59:59.999'
WHERE "key" = 'christmas' AND "pageUntil" IS NULL AND "endsAt" < '2027-01-01';

-- The Halloween FAQ that repeated the dates now carries the promo's line as a
-- token, so it says "Now booking Halloween 2027." after the season too.
UPDATE "Faq" SET "answer" = replace("answer", 'Now booking 23–24 and 30–31 October.', '{{SEASON_LINE_HALLOWEEN}}')
WHERE "pageKey" = 'special-events/halloween' AND "answer" LIKE 'Now booking 23–24 and 30–31 October.%';
