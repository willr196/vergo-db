-- No performers or makeup artists (3 November 2026): the Christmas page drops
-- its Santa and costume questions. Matched on the question, so they go even if
-- the answer was edited in the admin. Running it twice changes nothing.

DELETE FROM "Faq"
WHERE "pageKey" = 'special-events/christmas'
  AND "question" IN ('Can Santa come to our office party?', 'Do you supply the costumes?');
