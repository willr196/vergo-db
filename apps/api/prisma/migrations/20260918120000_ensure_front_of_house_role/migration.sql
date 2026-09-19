-- Front of House is a role on the admin roster filters, the apply form and the
-- quote form, but the Role row only ever came from seed-jobs.ts. Admin job
-- creation picks roles from this table, so make sure the row exists. No-op if
-- any spelling of it is already there.
INSERT INTO "Role" ("id", "name")
SELECT 'role_front_of_house', 'Front of House'
WHERE NOT EXISTS (
    SELECT 1 FROM "Role" WHERE lower("name") = 'front of house'
);
