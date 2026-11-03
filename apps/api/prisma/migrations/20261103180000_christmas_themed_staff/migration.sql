-- Christmas themed staff (3 November 2026): the bar and floor team dressed to
-- the theme, at £25/hr on the Christmas page (was £22, "Elves and festive
-- hosts"). New Year's Eve themed staff stay quoted. Changed only where still
-- the old default, so an edit made in the admin stands. Running it twice
-- changes nothing.

UPDATE "Rate" SET "amountPence" = 2500, "updatedBy" = 'migration', "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'themed_hospitality' AND "amountPence" = 2200;

UPDATE "Rate" SET "label" = 'Themed staff (Christmas)', "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'themed_hospitality' AND "label" = 'Elves and festive hosts';
