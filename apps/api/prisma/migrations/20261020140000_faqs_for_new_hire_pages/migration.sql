-- FAQs for the hire pages added after the site content was first imported:
-- cleaners and security (October 2026), front of house, event chefs and
-- private parties. A page only shows the FAQ rows the database holds once the
-- content is imported, so each page gets its defaults (src/site/defaults-faqs.json)
-- here. Only on a database that has been imported (some FAQ rows exist) and
-- only for a page with none, so running it twice, or before the import (which
-- brings these from the defaults itself), changes nothing.

INSERT INTO "Faq" ("id", "pageKey", "question", "answer", "order", "published", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, v."pageKey", v."question", v."answer", v."order", true, now(), now()
FROM (VALUES
  ('hire/cleaners', 'When do your cleaners work?', 'Before the doors open, during service, or once the last guest has gone. Book one shift or all three.', 0),
  ('hire/cleaners', 'Do they bring cleaning kit?', 'Tell us what the venue has. Cleaning kit and consumables are quoted on the brief if you need us to bring them.', 1),
  ('hire/cleaners', 'How are cleaners priced?', 'Quoted on the brief, by headcount, hours and the size of the job.', 2)
) AS v("pageKey", "question", "answer", "order")
WHERE EXISTS (SELECT 1 FROM "Faq")
  AND NOT EXISTS (SELECT 1 FROM "Faq" WHERE "pageKey" = 'hire/cleaners');

INSERT INTO "Faq" ("id", "pageKey", "question", "answer", "order", "published", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, v."pageKey", v."question", v."answer", v."order", true, now(), now()
FROM (VALUES
  ('hire/security', 'Are your security staff licensed?', 'Yes. Anyone we send to a licensable security role holds a current SIA licence, and we check it before they''re booked.', 0),
  ('hire/security', 'How many security staff do we need?', 'It depends on guest numbers, the venue, alcohol and the licence conditions. Send the brief and we''ll recommend a number.', 1),
  ('hire/security', 'How is security priced?', 'Quoted on the brief, by headcount, hours and the type of event.', 2)
) AS v("pageKey", "question", "answer", "order")
WHERE EXISTS (SELECT 1 FROM "Faq")
  AND NOT EXISTS (SELECT 1 FROM "Faq" WHERE "pageKey" = 'hire/security');

INSERT INTO "Faq" ("id", "pageKey", "question", "answer", "order", "published", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, v."pageKey", v."question", v."answer", v."order", true, now(), now()
FROM (VALUES
  ('hire/front-of-house', 'What can front of house staff cover?', 'Greeting, guest lists and wristbands, cloakroom, seating guests and running between rooms. Tell us what the night needs.', 0),
  ('hire/front-of-house', 'Are hosts the same rate as waiting staff?', 'Yes. Hosts, runners, waiting and bar staff share one rate and can go on one booking.', 1),
  ('hire/front-of-house', 'Can they match our dress code?', 'Yes. Send it with the brief and they arrive dressed for it.', 2)
) AS v("pageKey", "question", "answer", "order")
WHERE EXISTS (SELECT 1 FROM "Faq")
  AND NOT EXISTS (SELECT 1 FROM "Faq" WHERE "pageKey" = 'hire/front-of-house');

INSERT INTO "Faq" ("id", "pageKey", "question", "answer", "order", "published", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, v."pageKey", v."question", v."answer", v."order", true, now(), now()
FROM (VALUES
  ('hire/event-chefs', 'Do your chefs plan the menu?', 'They cook to your menu or your caterer''s. For the food planned and handled too, see <a href="/book-an-event">full events</a>.', 0),
  ('hire/event-chefs', 'Can you send kitchen porters with them?', 'Yes. Chefs and kitchen porters go on the same booking, so the wash-up is covered.', 1),
  ('hire/event-chefs', 'How are chefs priced?', 'Quoted on the brief, by headcount, hours and the kind of kitchen.', 2)
) AS v("pageKey", "question", "answer", "order")
WHERE EXISTS (SELECT 1 FROM "Faq")
  AND NOT EXISTS (SELECT 1 FROM "Faq" WHERE "pageKey" = 'hire/event-chefs');

INSERT INTO "Faq" ("id", "pageKey", "question", "answer", "order", "published", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, v."pageKey", v."question", v."answer", v."order", true, now(), now()
FROM (VALUES
  ('hire/private-parties', 'Do you staff parties at home?', 'Yes, at houses, gardens and flats as well as hired venues. Tell us about access and the kitchen.', 0),
  ('hire/private-parties', 'How many staff do we need?', 'Tell us guest numbers, how drinks and food are served, and the timings. We''ll recommend a team.', 1),
  ('hire/private-parties', 'Do you bring the drinks and glasses?', 'On a staff booking we send people only. For food and drink too, see <a href="/book-an-event">full events</a>.', 2)
) AS v("pageKey", "question", "answer", "order")
WHERE EXISTS (SELECT 1 FROM "Faq")
  AND NOT EXISTS (SELECT 1 FROM "Faq" WHERE "pageKey" = 'hire/private-parties');
