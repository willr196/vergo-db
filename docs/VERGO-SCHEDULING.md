# VERGO Scheduling

The desktop admin tool (`Documents/vergo_admin`) on the website, with its exact
screens and structure: Dashboard, Jobs (calendar and list), Awaiting payment,
Completed, Rota, People, Clients, Outreach, job detail with runs and margin,
and the printable schedule sheet.

One difference from the desktop: the Jobs list is the default view, and a
client with more than one day on the board (POPCORN's weekday kitchen porters)
is one header row, closed until clicked, that opens into its jobs and runs.

It is separate from VERGO Ops: its clients, people and jobs are not Ops
clients, workers or bookings. Ops is for the employment-business side
(compliance, documents, assignments, timesheets, invoicing); Scheduling is the
quick booking board you already know. Its jobs are Admin > Jobs, though (below).

## Scheduling and Admin > Jobs

One set of jobs. The board owns the work; Admin > Jobs ("Jobs in the app")
owns the listing workers see. `src/scheduling/appJobs.ts`, one function,
`syncAppJobs()`, run after every change on the board and before Admin reads.

| | Set on the board | Set in Admin > Jobs |
|---|---|---|
| Dates, times, venue, client, headcount per day | ✓ (greyed in Admin) | |
| Crew | ✓ | ✓ Staffing: add anyone, it lands on the board |
| Description, pay, requirements, deadline | | ✓ |
| Published in the worker app | | ✓ Publish / Unpublish |

- Every run (or single day) with a day still to come is one Admin job, made as
  a **draft**: nothing reaches the app until Publish. A run wholly in the past
  is left alone. Cancelling or deleting all its days closes the listing.
- An **internal** job made in Admin with dates goes onto the board (one day per
  job day, client made by name, charge rate £0 with a "Charge rate needed"
  note), then follows it. External jobs (other companies' listings and website
  submissions) never go on the board: they have no dates and VERGO doesn't staff them.
- **Crew** lives on the board. A board person whose email is a worker account is
  rostered on that day in the app; that roster is rewritten by the sync, never
  edited on its own. In Admin > Jobs > Staffing you can add a worker, someone
  already on the board, or a name typed in (no account needed), on every day to
  come or one day. The board's rule holds: no hourly rate, no job (the job's
  hourly pay is used if the person has none).
- **Confirming** an application puts the worker on every day to come;
  un-confirming or deleting it takes them off.
- A linked job can't be deleted in Admin (it would come back); close it, or
  cancel or delete it on the board. Days are added and removed on the board.
- Link: `sched_job.appJobId` → `Job`, and `Job.schedSynced` (migration
  `20261012120000_scheduling_app_jobs`). Tests: `schedulingAppJobs.test.ts`.

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
  VERGO mark, links at the foot of the sidebar (Restore a desktop
  backup, Jobs in the app, back to the Admin panel, Sign out), and `min-width: 0` on `.main` so every screen
  fits a phone (tables scroll inside their box; on a computer nothing changes).
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

A backup whose run was cut short (the file stops part way, as on 8 Oct 2026)
is refused as incomplete, wherever it stops, so part of the data is never taken
for all of it. `backup.ps1` now also refuses to keep one (see its README).

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
`App.svelte`, `lib/api.ts`, `pages/Restore.svelte`, the client grouping in
`pages/Jobs.svelte`, and the `foot-link` rules
and `.main` min-width in `app.css`).

## Tests

| What | Command |
|---|---|
| The desktop's costing and run tests | `npm test` in `apps/api` |
| The API on a real database (auth, a working day, runs, outreach, restoring a backup) | `npm run test:integration` (`scheduling.test.ts`) |

## Deploying

The migration only adds the six `sched_*` tables and their enums; nothing
existing changes. Deploy as usual (see VERGO-OPS.md, "Deploying to Fly.io
safely"), then open `/scheduling/` and restore the latest desktop backup.
