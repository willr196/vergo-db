# Claude Code Prompt — Backend Response Shape Consolidation

_Targets: `apps/api/src/routes/mobile*.ts`, `apps/mobile/src/api/*.ts`. Run in a fresh Claude Code session with `/clear`. **Use Opus** — this is contract design across both apps with mechanical migration after. Do not bundle. Largest of the prompts; budget for it. Run **last**, after all other prompts have been completed and committed._

---

## Context

The mobile API responses currently support a dual envelope:

```json
{ "ok": true, "job": {...}, "data": {...} }
{ "ok": true, "jobs": [...], "data": [...] }
```

Every mobile API service handler unwraps with fallback chains:

```ts
return normalizeJob(response.data.job ?? response.data.data!);
return (response.data.jobs || []).map(normalizeJob);
const job = response.data.job || response.data.data;
```

This exists because the backend started returning, e.g., `{ ok: true, job }` and was later modified to also include `data: shaped` for some kind of forward compatibility. The result is:

- `BackendResponse<T>` in `apps/mobile/src/api/jobs.ts` allows `job?`, `jobs?`, **and** `data?` simultaneously.
- Every unwrap site has to consider all three.
- Adding new endpoints invites guesses about which shape to follow.

## Goal

Pick one envelope, migrate the backend to emit it, and simplify the mobile client to expect it.

## Decision (already made — implement, don't redebate)

- **Singular resources:** `{ ok: true, data: T }`
- **Lists:** `{ ok: true, data: T[], pagination?: {...} }`
- **No more** `job`, `jobs`, `application`, `applications`, `cities`, `roles` as top-level keys. Everything goes under `data`.
- **Errors stay as they are:** `{ ok: false, error: string, code?: string, details?: unknown }`. No change.
- The wrapping `{ ok: boolean, ... }` envelope stays.

## Task

### 1. Inventory

Before editing, inventory every mobile-facing route handler in `apps/api/src/routes/` (mobile* files only — leave web routes alone). For each, note:
- Endpoint path + method
- Current response shape (which top-level keys it puts data under)
- Whether it duplicates into `data`

Output this inventory as a comment block at the top of a new file `apps/api/src/routes/RESPONSE_SHAPES.md` so the migration is auditable. After migration, this file documents the canonical shape with a few examples.

### 2. Backend migration

For every mobile-facing route handler:
- Replace `res.json({ ok: true, job: shaped, data: shaped })` with `res.json({ ok: true, data: shaped })`.
- Replace `res.json({ ok: true, jobs: shaped, pagination, data: { jobs: shaped, pagination } })` and similar with `res.json({ ok: true, data: shaped, pagination })`.
- For meta endpoints (`/meta/roles`, `/cities`): `res.json({ ok: true, data: cities })` — drop the `cities`/`roles` keys.
- For endpoints that returned only an action result (`{ ok: true }`): leave them alone.

Do this for **mobile routes only**:
- `apps/api/src/routes/mobileJobs.ts`
- `apps/api/src/routes/mobileClient.ts`
- `apps/api/src/routes/mobileJobApplications.ts` (and any sibling `mobile*` files)

Web/session-based routes (`apps/api/src/routes/jobs.ts`, `jobApplications.ts`, etc.) **stay as they are**. The web frontend depends on the existing shape.

### 3. Mobile migration

In `apps/mobile/src/api/`:

- Simplify `BackendResponse<T>` to:
  ```ts
  interface BackendResponse<T> {
    ok: boolean;
    error?: string;
    code?: string;
    data?: T;
    pagination?: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean };
  }
  ```
  Remove `job`, `jobs`, `application`, `applications`, `cities`, `roles` from this type.

- Update every unwrap site to read from `response.data.data` only:
  - `response.data.job ?? response.data.data` → `response.data.data`
  - `(response.data.jobs || []).map(...)` → `(response.data.data || []).map(...)` (note: `data` is now the array for list endpoints)
  - Same for applications, cities, roles.

- Files to update: `apps/mobile/src/api/jobs.ts`, `applications.ts`, `auth.ts`, `marketplace.ts`, `clientApi.ts`, and any other service module.

- The `auth.ts` service uses a separate `BackendAuthResponse` type — leave that alone unless its endpoints are being migrated. If they are (e.g. `/api/v1/user/mobile/login`), migrate them too. **Decision call:** auth endpoints currently return `{ ok, user, token, refreshToken }`. Migrating those touches the login flow, which is high-risk. **Defer auth migration** — leave login/register/refresh endpoints on their current shape, document the exception in `RESPONSE_SHAPES.md`. Migrate everything else.

### 4. Tests

- Update any backend tests in `apps/api/__tests__/` (or wherever they live) that assert on response shape. Adjust to match the new envelope.
- Update mobile tests that mock API responses with the old shape.
- If a test asserts `response.body.job` or similar, change to `response.body.data`.

### 5. Verification gates

This is the riskiest prompt. Before declaring done:
1. `npm run typecheck` from both `apps/api` and `apps/mobile` — clean.
2. `npm run lint` from both — clean.
3. `npm test` from both — clean.
4. Grep for any remaining `\.job\b`, `\.jobs\b`, `\.application\b`, `\.applications\b`, `\.cities\b`, `\.roles\b` in `apps/mobile/src/api/` (excluding type definitions of the domain objects themselves). Confirm no leftover unwrap sites.
5. Grep for `data: shaped, jobs: shaped` or similar dual-emission patterns in `apps/api/src/routes/mobile*.ts`. Confirm none remain.

## Coordination

This prompt assumes the **single-flight refresh prompt has already been run and the auth endpoints are stable**. If auth migration is pulled into scope mid-session, stop and flag — that's a separate decision.

This is a contract-breaking change. Mobile clients running an old build will continue to fetch `response.data.job` from a server that now only returns `response.data.data`, and they will break. Coordinate the deploy:
- Backend deploys first.
- Mobile build deploys second, ideally as a forced update or with a prior version known to handle both shapes (it currently does — the fallback chains tolerate either).
- Because the mobile fallback is `response.data.job ?? response.data.data`, an in-flight client already handles the new shape gracefully. Mobile-side breakage only affects clients whose build predates the dual-emission. **Confirm with Will when this prompt is run that no in-the-wild mobile build expects only `.job` / `.jobs`.**

## Out of scope

- Don't migrate web/session-based routes.
- Don't change the auth envelope (login/register/refresh stay as-is — see decision in step 3).
- Don't change error shapes.
- Don't introduce a versioned response (`v1`/`v2`).
- Don't change Prisma queries or shape helpers (`shapeJob`, `shapeMobileJob`) — they still produce the same domain object, only the envelope changes.

## Deliverable

Edits to:
- All `apps/api/src/routes/mobile*.ts` files
- All `apps/mobile/src/api/*.ts` service files (except `auth.ts`, except for the parts that aren't auth endpoints)
- Any tests that assert on response shape
- New file: `apps/api/src/routes/RESPONSE_SHAPES.md` with the inventory + canonical pattern + auth exception documented

Wrap-up note covering:
- The full inventory (number of endpoints migrated, any that were skipped and why)
- Whether any handlers had genuinely unique response shapes that didn't fit the singular/list pattern (and how they were handled)
- Confirmation that the auth endpoints were left alone
- Any remaining grep matches that look like leftover unwrap sites but were intentional (with reason)
