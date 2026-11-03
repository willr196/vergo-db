-- Seasonal (3 November 2026): "Special events" becomes "Seasonal" in the
-- header, with Christmas and New Year's Eve under it, and New Year's Eve gets
-- a page of its own (/special-events/new-years-eve) with its own banner.
--
-- Only on a database whose site content has been imported (the contentSeeded
-- marker): before that the site serves site/defaults.ts, which carries these.
-- Inserts skip what already exists and updates match the old default only, so
-- an edit made in the admin stands. Running it twice changes nothing.

INSERT INTO "SeasonalPromo" ("id", "key", "navLabel", "bannerText", "href", "homeHeading", "homeLines", "homeCtaLabel", "homeCtaHref", "startsAt", "endsAt", "published", "updatedAt")
SELECT 'promo_new_years_eve', 'new-years-eve', 'New Year’s Eve', 'New Year’s Eve staff: now booking', '/special-events/new-years-eve',
       'New Year’s Eve: teams for the biggest night of the year', '[]'::jsonb, 'New Year’s Eve staff', '/special-events/new-years-eve',
       '2026-11-01 00:00:00', '2026-12-31 23:59:59.999', true, CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "SiteSetting" WHERE "key" = 'contentSeeded')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Faq" ("id", "pageKey", "question", "answer", "order", "published", "updatedAt")
SELECT 'faq_nye_' || f."order", 'special-events/new-years-eve', f."question", f."answer", f."order", true, CURRENT_TIMESTAMP
FROM (VALUES
  (0, 'Why is New Year''s Eve quoted rather than priced?', 'It''s the busiest night of the year for event staff. We quote on the date, the hours and the team you need.'),
  (1, 'How early should we book?', 'As early as you can. Send the date now, even without numbers, and we''ll hold what we can.'),
  (2, 'Can the team stay past midnight?', 'Yes. Tell us the finish time and we''ll staff the night through to close and clear-down.')
) AS f ("order", "question", "answer")
WHERE EXISTS (SELECT 1 FROM "SiteSetting" WHERE "key" = 'contentSeeded')
  AND NOT EXISTS (SELECT 1 FROM "Faq" WHERE "pageKey" = 'special-events/new-years-eve')
ON CONFLICT ("id") DO NOTHING;

-- The Christmas answer points at the new page.
UPDATE "Faq" SET "answer" = 'Sometimes. It''s the busiest night of the year, so <a href="/special-events/new-years-eve">send us the date</a> and we''ll tell you what we can do.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "pageKey" = 'special-events/christmas' AND "answer" = 'Sometimes. It''s the busiest night of the year, so send us the date and we''ll tell you what we can do.';
