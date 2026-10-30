-- Halloween is gone from the site (30 October 2026): the page, its promo, its
-- FAQs and the photo that put it on the homepage. /special-events/halloween
-- now redirects to /special-events. Deletes only, so running it twice, or on a
-- database that never held these rows, changes nothing.

-- Drafts first: they point at the rows by id.
DELETE FROM "ContentDraft"
WHERE "rowId" IN (SELECT "id" FROM "SeasonalPromo" WHERE "key" = 'halloween')
   OR "rowId" IN (SELECT "id" FROM "Faq" WHERE "pageKey" = 'special-events/halloween')
   OR "data"->>'key' = 'halloween'
   OR "data"->>'pageKey' = 'special-events/halloween';

DELETE FROM "SeasonalPromo" WHERE "key" = 'halloween';

DELETE FROM "Faq" WHERE "pageKey" = 'special-events/halloween';

DELETE FROM "GalleryPhoto" WHERE "path" LIKE '/images/special-events/halloween-%';

-- The performer rate stays (Christmas sells it); only the label loses the
-- scare actors.
UPDATE "Rate" SET "label" = 'Character performers'
WHERE "key" = 'character_performer' AND "label" = 'Character performers and scare actors';
