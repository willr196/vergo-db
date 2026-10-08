# VERGO Scheduling

The desktop admin tool (`Documents/vergo_admin`) on the website, with its exact
screens and structure: Dashboard, Jobs (calendar and list), Awaiting payment,
Completed, Rota, People, Clients, Outreach, job detail with runs and margin,
and the printable schedule sheet.

It is its own thing, separate from VERGO Ops. Its clients, people and jobs are
not Ops clients, workers or bookings, and nothing in it reaches the worker app.
Ops is for the employment-business side (compliance, documents, assignments,
timesheets, invoicing); Scheduling is the quick booking board you already know.

## Where it lives

| | |
|---|---|
| Page | `https://vergoltd.com/scheduling/` (Admin > Operations > VERGO Scheduling) |
| Login | The admin login, the same as the rest of admin and Ops |
| Screens (source) | `apps/scheduling/` (Svelte 5 + Vite), copied from `vergo_admin/apps/admin` |
| Screens (built) | `apps/api/public/scheduling/`, committed, served as they are |
| API | `/api/v1/scheduling/*`, `apps/api/src/scheduling/` |
| Tables | `sched_client`, `sched_job`, `sched_staff`, `sched_assignment`, `sched_job_schedule_item`, `sched_lead` (migration `20261009120000_vergo_scheduling`) |

### Kept exact on purpose

- The screens are the desktop's Svelte source, unchanged apart from: the
  login (the admin login replaces the desktop's own), "Scheduling" under the
  VERGO mark, and three links at the foot of the sidebar (Restore a desktop
  backup, VERGO Ops, Sign out).
- The API routes are the desktop's own route files
  (`src/scheduling/routes/*.ts`), run through a small Fastify-to-Express
  adapter (`fastifyShim.ts`) so they did not need rewriting. Only their imports
  and table names changed. The desktop's `/api/jobs/:id` is
  `/api/v1/scheduling/jobs/:id` here; the screens' API client maps one to the
  other.
- Costing and runs (`costing/`, `costingService.ts`, `schedule.ts`) are the
  desktop's files as they were, and so are their 28 tests
  (`src/__tests__/schedulingCosting.test.ts`, `schedulingSchedule.test.ts`),
  run through a small `expect` adapter.

So the rules are the desktop's: one job per day (a run is one job per day with
a shared series), people need an hourly rate before they can go on a job,
holiday pay at 12.07% on top, margin shown without employer NI and red under
£2/hour, deleting someone on jobs makes them inactive, deleting a client with
jobs archives it.

## Desktop backups

**Restore a desktop backup** (foot of the sidebar) takes a
`vergo_admin/backups/vergo-ops-*.sql` file. It shows what it would change, then
restores on a click.

- Rows are matched by id, so the same job is the same row in both places.
- New rows are added. A row edited more recently on the desktop (its
  `updatedAt`) replaces the web copy; one edited more recently on the web is
  kept. Nothing is ever deleted. Restoring the same backup twice changes
  nothing.
- If a row would clash with a different one here on a unique field (a VJ
  reference, a person's email, the same person twice on one job), it lists
  them and restores nothing until they are sorted out. Jobs made on both sides
  will clash on their VJ numbers, because each side counts from its own
  highest.

Only the COPY blocks of the file are read; nothing in it is run. The desktop's
login (AdminUser) is never read.

This is separate from **Ops > Import**, which turns the same backups into Ops
clients, workers and bookings. Use whichever matches where you want the
bookings to live; using both puts the same booking in both places.

## Changing the screens

```
cd apps/scheduling
npm ci
npm run check        # svelte-check
npm run build        # writes apps/api/public/scheduling/
```

Commit the built files with the source. For hot reload, run the API on 4310
(`PORT=4310 npm run dev` in `apps/api`) and `npm run dev` here; sign in at
`http://localhost:5173/login`.

If the desktop tool changes, copy its `apps/admin/src` over `apps/scheduling/src`
again and redo the edits listed under "Kept exact on purpose" (all in
`App.svelte`, `lib/api.ts`, `pages/Restore.svelte` and the `foot-link` rule in
`app.css`).

## Tests

| What | Command |
|---|---|
| The desktop's costing and run tests | `npm test` in `apps/api` |
| The API on a real database (auth, a working day, runs, outreach, restoring a backup) | `npm run test:integration` (`scheduling.test.ts`) |

## Deploying

The migration only adds the six `sched_*` tables and their enums; nothing
existing changes. Deploy as usual (see VERGO-OPS.md, "Deploying to Fly.io
safely"), then open `/scheduling/` and restore the latest desktop backup.
