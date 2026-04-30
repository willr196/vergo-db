# Claude Code Prompt — `useFocusEffect` Consistency

_Targets: `apps/mobile/src/screens/jobseeker/JobsScreen.tsx`, `apps/mobile/src/screens/jobseeker/ApplicationsScreen.tsx`. Run in a fresh Claude Code session with `/clear`. **Use Sonnet** — small mechanical change. Bundle-friendly with the small hygiene pass if you prefer; otherwise standalone is fine._

---

## Context

`MyJobsScreen` (client side) uses `useFocusEffect` to refetch when the screen regains focus — correct, since the list can change while the user is on a detail screen (e.g. they apply, withdraw, or come back from a deep link).

`JobsScreen` (jobseeker) and `ApplicationsScreen` (jobseeker) use plain `useEffect(fetchJobs, [fetchJobs])`, which only runs on mount and on dependency change. Result: user applies to a job, navigates back, list still shows pre-apply state until they pull to refresh.

## Task

Switch the two jobseeker screens to use `useFocusEffect` from `@react-navigation/native`, mirroring the pattern in `MyJobsScreen`.

### Pattern to apply

In `MyJobsScreen` it looks like (paraphrased):

```ts
import { useFocusEffect } from '@react-navigation/native';

useFocusEffect(
  useCallback(() => {
    fetchJobs();
  }, [fetchJobs])
);
```

### Specifics

**`JobsScreen.tsx`:**
- Replace the existing `useEffect(() => { fetchJobs(); }, [fetchJobs])` with `useFocusEffect(useCallback(() => { fetchJobs(); }, [fetchJobs]))`.
- The `useEffect` that handles search debouncing or filter changes (if any) stays as `useEffect` — only the focus-driven fetch changes.
- Don't introduce a new fetch loop; the store's internal logic guards against concurrent refetches.

**`ApplicationsScreen.tsx`:**
- Same swap: `useEffect(() => { fetchApplications(); }, [fetchApplications])` becomes the `useFocusEffect` equivalent.
- If the screen has any other `useEffect` calls (e.g. for filter changes triggering refetch), leave them as-is.

### Edge cases to handle correctly

- `useFocusEffect` runs both on mount **and** on every subsequent focus. Make sure that's OK with the store's loading-state behaviour. The existing stores set `isLoading: true` only when `refresh = false` and there's no cached data, so refetches on focus should be silent (no flash). If `isLoading` flickers visibly on tab switch after this change, flag it.
- Don't pass `true` (refresh mode) to the focus-driven call. Refresh mode is for pull-to-refresh, not focus.
- Imports: `useFocusEffect` from `@react-navigation/native`, `useCallback` from `react` (likely already imported).

## Verification

1. From `apps/mobile`: `npm run typecheck` and `npm run lint` — must pass clean.
2. From `apps/mobile`: `npm test` — existing tests pass. If any test asserts on `useEffect`-based fetch timing, update it to expect `useFocusEffect` behaviour.
3. Skim both screens and confirm there's no orphaned `useEffect` for the data fetch left behind.

## Out of scope

- Don't touch `MyJobsScreen` (already correct).
- Don't touch any screen that loads detail data on mount (`JobDetail`, `ApplicationDetail`) — those don't have the same problem.
- Don't change the store actions or API calls.
- Don't add a "stale data" indicator or any UI affordance — silent refetch is the goal.

## Deliverable

Edits to:
- `apps/mobile/src/screens/jobseeker/JobsScreen.tsx`
- `apps/mobile/src/screens/jobseeker/ApplicationsScreen.tsx`

Brief note at the end of the run on whether either screen has any `useEffect` that looked like a fetch but was left in place (and why).
