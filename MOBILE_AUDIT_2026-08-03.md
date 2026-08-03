# VERGO Mobile App Audit — 2026-08-03

Fresh audit of `apps/mobile`, done after removing the Job.tier system, deleting
the orphaned client job-management flow (MyJobsScreen + 5 downstream screens),
and fixing the missing `react-native-worklets` peer dependency. All findings
below were verified against real call sites (imports, navigator registrations,
actual backend route/response shapes) — not just name/pattern matching.

Status: **report only — nothing below has been fixed yet.**

---

## Critical

### 1. Job-seeker profile edits are silently discarded except firstName/lastName/phone

- `apps/mobile/src/screens/jobseeker/EditProfileScreen.tsx` collects bio, city,
  postcode, availability, preferredRoles, yearsExperience, and
  minimumHourlyRate, and calls `updateProfile()` →
  `authApi.updateJobSeekerProfile()` (`apps/mobile/src/api/auth.ts:253`), which
  PUTs the whole object to `/api/v1/user/mobile/profile`.
- The backend schema there only accepts `firstName`/`lastName`/`phone`
  (`apps/api/src/routes/userAuth.ts:1017-1021`) — zod silently strips
  everything else. The request returns 200 with a "Profile updated" toast,
  but nothing else is saved.
- Worse: `GET /api/v1/user/mobile/me` (`shapeMobileUser`,
  `userAuth.ts:356-386`) never returns bio/city/postcode/availability/
  preferredRoles/yearsExperience/skills/hasDBSCheck/rightToWork/etc. Every
  `checkAuth()`/login refresh resets `ProfileScreen.tsx`'s completion %,
  DBS/Right-to-Work badges, skills, and preferred roles to blank/0/false.
  This happens on every cold start, not just an edge case.

### 2. Client profile: description/address/city can't be saved; postcode disappears after refresh

- `EditClientProfileScreen.tsx` has full Description/Address/City fields, but
  the Prisma `Client` model has no such columns
  (`apps/api/prisma/schema.prisma:122-161`) and `updateProfileSchema`
  (`clientAuth.ts:1160`) doesn't accept them — `authApi.updateClientProfile`
  (`api/auth.ts:268`) doesn't even send them.
- `postcode` *is* accepted on PUT, but `GET /api/v1/client/mobile/me`'s select
  clause omits it (`clientAuth.ts:865-884`), so it vanishes again on the next
  profile load despite a successful save.

---

## High

### 3. Stale "already applied" state causes failed duplicate applications

- `applicationsStore.applications` (used by `hasAppliedToJob` in
  `JobDetailScreen.tsx:60`) is only populated by `fetchApplications()`, which
  is called solely from `ApplicationsScreen.tsx` and the offline-reconnect
  callback — never on login/app start.
- A user who opens a job from `JobsScreen` before ever visiting the
  Applications tab sees "Apply Now" for a job they already applied to, goes
  through the 3-step `ApplyToJobScreen` flow, and gets a generic failure
  alert when the backend rejects it (`mobileJobApplications.ts:45-47`,
  "Already applied").

### 4. Offline apply/withdraw queue can silently drop a withdrawal

- Offline `applyToJob` creates an optimistic `Application` with id
  `pending_<timestamp>` (`applicationsStore.ts:162`) and no `job` field, so it
  doesn't even render in `ApplicationsScreen.tsx` (`renderApplication` returns
  `null` when `item.job` is falsy).
- If a withdraw is queued referencing that placeholder id before the apply
  syncs, `networkStore.replayQueue()` (`store/networkStore.ts:92-111`)
  processes actions serially but the withdraw targets a server id that
  doesn't exist yet; any failure is caught and silently discarded
  (`logger.warn` only).
- Zero test coverage exists for this queue/replay path, or for `client.ts`'s
  single-flight token refresh — exactly the concurrency-sensitive code where
  this kind of bug hides.

---

## Medium

### 5. Stale Job.tier content + mislabeled stats in `CompanyProfileScreen.tsx`

- `SERVICE_PRICING` (lines 33-49) still advertises "Standard / Shortlist /
  Gold" job-posting pricing — leftover from the deleted Job.tier system;
  there's no job-posting flow anymore.
- Same screen labels `stats.totalQuotes` as "Jobs Posted" and
  `stats.activeQuotes` as "Staff Hired" (lines 206-213) — both are actually
  quote-request counts, not jobs or hires.

### 6. MyQuotesScreen has no detail view or cancel action

- Quote cards in `MyQuotesScreen.tsx` are non-touchable and there's no cancel
  button, even though the backend supports `DELETE /client/mobile/quotes/:id`
  while status is `new`.
- `clientApi.getQuote` and `cancelQuote` exist but have zero callers anywhere
  — dead, unreachable features.

### 7. Unvalidated free-text event date in CreateQuoteScreen

- `eventDate` is a plain text input (placeholder "e.g., 15 March 2025") with
  no format check on mobile or backend (`z.string().optional()` in
  `clientAuth.ts:17`).
- Typing something like "flexible" or "TBC" — words the field's own hint
  invites — produces `Invalid Date`, which fails when creating the Prisma
  record, surfacing as an opaque 500 to the user.

---

## Low / Dead code (verified — no reachable call sites)

- `apps/mobile/src/api/jobs.ts`: `createJob`, `updateJob`, `closeJob`,
  `getClientJob`, `getClientJobs`, `updateClientJob`, `createClientJob`,
  `getRoles`, `getCities`, `getRecommendedJobs` — leftover from the deleted
  MyJobsScreen flow; backend routes still exist, just orphaned client-side.
- `apps/mobile/src/api/applications.ts`: `getClientApplication`,
  `getJobApplications`, `updateApplicationStatus`, `shortlistApplicant`,
  `hireApplicant`, `rejectApplicant`, `getClientStats` — all unused.
  `getClientStats` (line 279) still expects the old job-based stats shape
  (`totalApplications/pendingReview/...`) while the real
  `/client/mobile/stats` response is quote-based — would silently show zeros
  if ever reconnected.
- `JobDetailScreen.tsx:410-506` — ~100 lines of unused tier-badge/tier-callout
  styles left over from the removed Job.tier system.

---

## Not a bug (checked and clean)

Token storage (SecureStore, correct token-refresh single-flight logic, no
hardcoded secrets), deep-link prefixes, and marketplace/booking normalizers
all checked out against actual backend response shapes.

---

## Suggested order of attack

1. **#1 and #2** — two entire profile-editing screens are lying to users
   (edits silently discarded, data vanishing on refresh). Fix backend schemas
   + select clauses (and Client model columns for #2) to actually persist and
   return what the mobile UI already collects.
2. **#3** — load applications on login/app start (not just on tab visit) so
   "already applied" state is accurate everywhere it's checked.
3. **#4** — either block queuing a withdraw against a still-pending optimistic
   application, or make replay handle that dependency correctly; add test
   coverage for the queue/replay path and the token-refresh single-flight
   logic.
4. **#5–#7** — smaller UX/content fixes, can batch together.
5. **Dead code list** — safe to delete in one pass once someone confirms the
   backend routes behind `api/jobs.ts`/`api/applications.ts` aren't needed for
   anything else.
