# Database environments

There are three, and only one of them is the business.

| Name | Where | Port | Used for |
| --- | --- | --- | --- |
| Production | Neon, `ep-lucky-hall-...eu-west-2.aws.neon.tech` | 5432 | The live business. Real bookings, real workers, real clients. |
| Local dev | Docker, `vergo-dev-db` | **5435** | Day-to-day development. Disposable. |
| Local test | Docker, `vergo-test-db` | **5434** | Integration tests. Wiped on every `down`. |

`apps/api/.env` points at **local dev**. The production URLs are kept at the
bottom of that file, commented out, so the values are not lost. Production reads
its own values from Fly secrets and does not use that file.

## Getting a local database

```
docker compose -f infra/docker-compose.yml up -d db
cd apps/api
npm run prisma:deploy     # applies all 32 migrations from scratch
npm run seed              # creates the admin user
npm run dev
```

Both containers run Postgres 16, matching Neon. The old Compose file used
Postgres 15, so a migration could pass locally and behave differently in
production.

Port 5435 rather than 5432 because an unrelated project already holds 5432 on
this machine.

## The guard

`apps/api/scripts/guard-db-target.js` runs before every Prisma script and
refuses a non-local target:

```
[db-guard] prisma migrate deploy
[db-guard] target: ep-lucky-hall-abf3d96e.eu-west-2.aws.neon.tech:5432/neondb (from DIRECT_DATABASE_URL)

[db-guard] REFUSED: this is a remote database.
```

To act on production on purpose:

```
ALLOW_REMOTE_DB=1 npm run prisma:deploy
```

Fly sets `ALLOW_REMOTE_DB = "1"` in `fly.toml`, so the release command still
migrates production on deploy. Nothing about normal deployment changed.

Guarded scripts: `prisma`, `prisma:deploy`, `prisma:deploy:raw`, `migrate`,
`seed`, `seed:jobs`, `seed:marketplace`, `db:reset`.

"Local" means localhost, 127.x, ::1, a Docker bridge address (172.16–172.31.x),
a private LAN address (192.168.x), `host.docker.internal`, or a Compose service
name (`db`, `db-test`, `postgres`).

## Why this exists

On 6 September 2026 a `prisma migrate deploy` intended for a throwaway test
container was applied to the live Neon database.

The command passed `DATABASE_URL` inline, which looked sufficient. It was not.
`schema.prisma` sets:

```prisma
datasource db {
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_DATABASE_URL")
}
```

Prisma Migrate prefers `directUrl`, and the Prisma CLI loads `apps/api/.env`
itself. So the target was `DIRECT_DATABASE_URL` from `.env`, pointing at
production, and the inline `DATABASE_URL` was never consulted. The `.env` file
carried a warning comment about exactly this. A comment is not a control.

Four migrations were applied. All were additive — nullable columns, two new
tables, indexes, and a backfill that only inserted into the newly created
`JobDay` table. No existing row was modified or deleted, and the running API was
unaffected because it does not read columns it has never heard of. They would
have been applied by the next deploy of this branch in any case.

Two changes came out of it: the guard above, and pointing local development at a
local database instead of production.

## Still worth doing

- **A Neon dev branch.** Neon can branch a database cheaply. A dev branch would
  give local work production-shaped data without production consequences, which
  is what the original `.env` comment was asking for.
- **Rotate the secrets in `apps/api/.env`.** That file was populated from the
  production Fly machine environment and holds live JWT secrets and API keys. It
  is gitignored, so it has not leaked through the repository, but production
  credentials sitting in a working directory is worth fixing separately from
  the database question.
