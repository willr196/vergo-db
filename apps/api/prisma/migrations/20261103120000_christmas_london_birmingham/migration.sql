-- The Christmas page goes to London and Birmingham, core staff prices only
-- (3 November 2026). Festive characters and New Year's Eve are quoted on
-- request, so their FAQ answers stop naming a fee, an uplift or other regions.
--
-- Answers are changed only where they are still the old default, so an edit
-- made in the admin stands. Running it twice changes nothing.

UPDATE "Faq" SET "answer" = 'We can often arrange Santa, Mrs Claus and elves. Send us the date and we''ll let you know.'
WHERE "pageKey" = 'special-events/christmas' AND "answer" = 'Yes. Santa, Mrs Claus and elves for office parties, grottos and family events. Santas booked for children''s events are DBS-checked.';

UPDATE "Faq" SET "answer" = 'If we''re arranging characters, we''ll sort the costumes too.'
WHERE "pageKey" = 'special-events/christmas' AND "answer" = 'Yes. The festive team arrives in costume, or we can style yours. Costume and styling is {{COSTUME_FEE}} per booking.';

UPDATE "Faq" SET "answer" = 'Sometimes. It''s the busiest night of the year, so send us the date and we''ll tell you what we can do.'
WHERE "pageKey" = 'special-events/christmas' AND "answer" = 'Yes. From {{NYE_FROM}} on New Year''s Eve, hours are charged at +{{NYE_UPLIFT_PCT}}%. It''s the busiest night of the year, so send the date early.';

UPDATE "Faq" SET "answer" = 'We''ll have a replacement on site within the hour. If we can''t, that shift isn''t charged.'
WHERE "pageKey" = 'special-events/christmas' AND "answer" = 'In London and Birmingham, we have a replacement on site within the hour. If we can''t, that shift isn''t charged. Elsewhere, we agree the backup plan in the quote.';
