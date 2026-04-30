# Claude Code Prompt — Client Stores (Match Jobseeker Pattern)

_Targets: `apps/mobile/src/store/`, several client screens. Run in a fresh Claude Code session with `/clear`. **Use Sonnet** — well-defined pattern work, mirrors existing stores. Do not bundle._

---

## Context

The jobseeker side uses Zustand stores (`useJobsStore`, `useApplicationsStore`) with cache-first offline fallback, automatic refetch on reconnect (via `registerRefreshCallback` in `RootNavigator`), and a single source of truth across the app.

The client side does not. `MyJobsScreen`, `ClientJobDetailScreen`, `ApplicantListScreen`, and `EditJobScreen` all use local `useState` for jobs/applications/pagination/loading and call `jobsApi`/`applicationsApi` directly.

Consequences:
- No offline cache for client data (clients on bad signal get blank screens).
- No refetch on reconnect — `registerRefreshCallback` only refreshes jobseeker stores.
- Pagination logic duplicated across three or more screens.
- State lost on every navigation.

The pattern from `useJobsStore` and `useApplicationsStore` is good. We're going to mirror it for clients.

## Task

Add two new stores and migrate the four client screens to use them. Backend and API services are unchanged.

### 1. Create `apps/mobile/src/store/clientJobsStore.ts`

Mirror the shape of `jobsStore.ts` but for client-owned jobs. State and actions:

- **State:** `jobs: Job[]`, `selectedJob: Job | null`, `isLoading`, `isRefreshing`, `isLoadingMore`, `error: string | null`, `currentPage`, `totalPages`, `hasMore`, `statusFilter: JobStatusFilter` (where `JobStatusFilter = 'all' | 'active' | 'closed'`).
- **Actions:**
  - `fetchJobs(refresh?: boolean)` — calls `jobsApi.getClientJobs(toApiStatus(statusFilter), 1)`. Cache-first when offline, mirroring `jobsStore`. Use a new cache key `CACHE_KEYS.CLIENT_JOBS`.
  - `fetchMoreJobs()` — appends next page. Same guard logic as jobseeker.
  - `fetchJob(jobId)` — calls `jobsApi.getClientJob(jobId)`, sets `selectedJob`. **Important:** this is the client-scoped variant (any status), not the public one.
  - `setStatusFilter(filter)` — updates filter, resets `currentPage`, auto-fetches.
  - `closeJob(jobId)` — calls `jobsApi.closeJob`, updates the job in `jobs` and `selectedJob` if matching.
  - `updateJob(jobId, payload)` — calls `jobsApi.updateClientJob`, updates in-place in `jobs` and `selectedJob`.
  - `createJob(payload)` — calls `jobsApi.createClientJob`, prepends to `jobs`.
  - `clearSelectedJob()`.
  - `clearError()`.
- **Helper:** keep the existing `toApiStatus` mapping logic from `MyJobsScreen` inside the store (or in a small helper file shared between store and screen). Don't duplicate it.

Add `CLIENT_JOBS` to `CACHE_KEYS` in `apps/mobile/src/utils/network.ts`.

### 2. Create `apps/mobile/src/store/clientApplicationsStore.ts`

Mirror `applicationsStore.ts` but for the client view (applicants for a specific job, not the user's own applications).

- **State:** `applicationsByJobId: Record<string, Application[]>` (keyed by jobId since one client may flip between several job applicant lists), `selectedApplication: Application | null`, `isLoading`, `isRefreshing`, `isLoadingMore`, `error`, `currentPage`, `totalPages`, `hasMore`, `statusFilter: ApplicationStatus | 'all'`.
- **Actions:**
  - `fetchJobApplications(jobId, refresh?)` — calls `applicationsApi.getJobApplications(jobId, ...)`. Stores under `applicationsByJobId[jobId]`. Cache-first when offline; cache key derived per jobId, e.g. `${CACHE_KEYS.CLIENT_APPLICATIONS}:${jobId}`.
  - `fetchMoreJobApplications(jobId)` — appends page for that jobId.
  - `fetchApplication(applicationId)` — calls `applicationsApi.getApplication`, sets `selectedApplication`.
  - `updateApplicationStatus(applicationId, action)` where `action` is `'shortlist' | 'hire' | 'reject' | 'review'` (match the existing API surface). Calls the corresponding `applicationsApi` method, then updates the application in-place wherever it appears (in `applicationsByJobId` and `selectedApplication`).
  - `setStatusFilter(filter)` — updates filter, refetches for the currently active jobId.
  - `clearSelectedApplication()`.
  - `clearError()`.
- **Selector:** export `selectApplicationsForJob(jobId)` for screens to subscribe.

Add `CLIENT_APPLICATIONS` to `CACHE_KEYS`.

### 3. Wire to `registerRefreshCallback`

In `apps/mobile/src/navigation/RootNavigator.tsx` (or wherever `registerRefreshCallback` lives), register the new stores' fetch actions so they refresh on reconnect, **but only when the user is a client**. Use `useAuthStore`'s userType to gate. Mirror exactly how the jobseeker stores are registered.

### 4. Export from `apps/mobile/src/store/index.ts`

Add the new stores and selectors to the central export.

### 5. Migrate screens

For each screen below: replace local `useState` data + pagination + loading flags with subscriptions to the new store. Keep UI behaviour identical. The only state that should remain in `useState` is genuinely UI-local (e.g. `searchQuery`, `showFilters`, `actingOnId`).

- **`apps/mobile/src/screens/client/MyJobsScreen.tsx`** — use `useClientJobsStore`. The `useFocusEffect`-based refetch stays (calls `fetchJobs(true)` on focus).
- **`apps/mobile/src/screens/client/ClientJobDetailScreen.tsx`** — use `useClientJobsStore` for the job, `useClientApplicationsStore` for the applicants list. The screen currently fetches both in parallel — keep that, but via the store actions.
- **`apps/mobile/src/screens/client/ApplicantListScreen.tsx`** — use `useClientApplicationsStore`. Subscribe via the `selectApplicationsForJob(jobId)` selector.
- **`apps/mobile/src/screens/client/EditJobScreen.tsx`** — if it currently fetches the job via `jobsApi.getClientJob` directly, route through `useClientJobsStore.fetchJob`. If it calls `jobsApi.updateClientJob` on save, route through `useClientJobsStore.updateJob` instead, so the `MyJobs` list reflects the change without a refetch.

### 6. Tests

Existing `apps/mobile/src/screens/client/__tests__/MyJobsScreen.test.tsx` mocks `jobsApi.getClientJobs` directly. Update the test to mock the new `useClientJobsStore` instead, following the pattern of any existing jobseeker screen tests that mock stores. If you can't find a clear pattern, mock the API and let the store call through — but flag that in the wrap-up note.

## Verification

1. From `apps/mobile`: `npm run typecheck` and `npm run lint` — must pass clean.
2. From `apps/mobile`: `npm test` — existing tests pass, updated test passes.
3. Manually verify (or describe expected behaviour for) the four screens: data loads, pagination works, status filter works, pull-to-refresh works, navigating away and back retains state.
4. Confirm `registerRefreshCallback` registers client stores only when authed as client.

## Out of scope

- Don't change any backend route or API service method.
- Don't change the jobseeker stores.
- Don't touch any screen outside the four listed (no opportunistic cleanup).
- Don't change the Application or Job types.
- Don't add a `clientNotificationsStore` or any other store.
- Don't refactor `BackendResponse` (separate task).

## Deliverable

New files:
- `apps/mobile/src/store/clientJobsStore.ts`
- `apps/mobile/src/store/clientApplicationsStore.ts`

Edits:
- `apps/mobile/src/store/index.ts`
- `apps/mobile/src/utils/network.ts` (cache keys)
- `apps/mobile/src/navigation/RootNavigator.tsx` (refresh callback registration)
- The four client screens listed above
- `apps/mobile/src/screens/client/__tests__/MyJobsScreen.test.tsx`

Brief note at the end of the run on:
- Any client screens beyond the four listed that also use local `useState` + direct API calls (which I might want to migrate next).
- Whether `applicationsApi.getJobApplications` returns `applications` directly or wrapped — so I know what shape the store is unwrapping.
