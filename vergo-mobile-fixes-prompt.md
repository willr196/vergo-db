# VERGO Mobile App — Fix & Harden Prompt

> **Usage:** Copy this file into your project root and run:
> ```bash
> cat vergo-mobile-fixes-prompt.md | claude
> ```
> Or reference it directly:
> ```bash
> claude "$(cat vergo-mobile-fixes-prompt.md)"
> ```

---

## Context

You are working on the VERGO Events mobile app (`apps/mobile/`). It's a React Native / Expo app with:
- React Navigation v7 (native-stack + bottom-tabs)
- Zustand for state management
- Axios API client with JWT auth + token refresh
- Express.js backend on Fly.io with Prisma

The app has two user types: **job seekers** (browse/apply for event jobs) and **clients** (post jobs, manage applicants). Below is a prioritised list of bugs, performance issues, and UX improvements. Please implement ALL fixes across the codebase in a single pass.

---

## HIGH PRIORITY — Bugs

### 1. Application status enum mismatch (CRITICAL)

The frontend `ApplicationStatus` type uses lowercase values that don't match the Prisma backend enums. The app's status filters and status badges are broken because of this.

**Frontend** (`src/types/index.ts`):
`'pending' | 'received' | 'reviewing' | 'shortlisted' | 'hired' | 'rejected' | 'withdrawn'`

**Backend** (Prisma `JobApplicationStatus`):
`PENDING | REVIEWED | SHORTLISTED | CONFIRMED | REJECTED | WITHDRAWN`

**Fix required:**
- Create a `normalizeApplicationStatus()` function in `src/api/normalizers.ts` that maps backend → frontend:
  - `PENDING` → `'pending'`
  - `REVIEWED` → `'reviewing'`
  - `SHORTLISTED` → `'shortlisted'`
  - `CONFIRMED` → `'hired'`
  - `REJECTED` → `'rejected'`
  - `WITHDRAWN` → `'withdrawn'`
- Remove `'received'` from the `ApplicationStatus` type (it doesn't exist in the backend)
- Apply the normalizer inside `applicationsApi.normalizeApplication()`
- Update the `STATUS_FILTERS` array in `ApplicationsScreen.tsx` to remove the `'received'` option and ensure labels match the mapped values
- When sending status updates TO the backend, reverse-map: `'hired'` → `'CONFIRMED'`, `'reviewing'` → `'REVIEWED'`, etc.

### 2. Wire up real client screens (replace placeholders)

In `src/navigation/RootNavigator.tsx`, the `ClientDashboard`, `ClientMyJobs`, and `ClientProfile` inline placeholder components ("Coming soon...") need to be replaced with the actual screen imports.

**Fix required:**
- Import real client screens from `src/screens/client/`:
  - `DashboardScreen` (or `ClientDashboardScreen`)
  - `MyJobsScreen`
  - `CompanyProfileScreen`
- Replace the three inline placeholder components in `RootNavigator.tsx` with the real imports
- Check that the client screen `index.ts` barrel export exists; create one if missing:
  ```ts
  // src/screens/client/index.ts
  export { ClientDashboardScreen } from './ClientDashboardScreen';
  export { MyJobsScreen } from './MyJobsScreen';
  export { CompanyProfileScreen } from './CompanyProfileScreen';
  export { ClientJobDetailScreen } from './ClientJobDetailScreen';
  ```

### 3. Register client detail screens in ClientStack

The `ClientStack` navigator only registers `ClientTabs`. Detail screens defined in `RootStackParamList` are missing, so navigating to them crashes.

**Fix required:**
Add these screens to `ClientStack` in `RootNavigator.tsx`:
```tsx
<Stack.Screen name="ClientJobDetail" component={ClientJobDetailScreen} />
<Stack.Screen name="ApplicantList" component={ApplicantListScreen} />
<Stack.Screen name="ApplicantDetail" component={ApplicantDetailScreen} />
<Stack.Screen name="CreateJob" component={CreateJobScreen} />
<Stack.Screen name="EditJob" component={EditJobScreen} />
```
- For screens that don't exist yet (`ApplicantListScreen`, `ApplicantDetailScreen`, `CreateJobScreen`, `EditJobScreen`), create minimal placeholder screen files in `src/screens/client/` with proper TypeScript types and navigation props. They should display a "Coming Soon" message styled consistently with the app theme (dark background, gold accent).
- Export them from the client screens barrel file.

### 4. Login error alert shows stale value

In `LoginScreen.tsx`, the catch block references `error` from the outer scope (captured at render time), not the error from the failed `login()` call.

**Fix required:**
```tsx
const handleLogin = async () => {
  clearError();
  if (!validate()) return;

  try {
    await login({
      email: email.trim().toLowerCase(),
      password,
      userType,
    });
  } catch (err: unknown) {
    const message = err instanceof Error
      ? err.message
      : 'Please check your credentials and try again.';
    Alert.alert('Login Failed', message);
  }
};
```

---

## MEDIUM PRIORITY — Performance & Reliability

### 5. Add search debounce on JobsScreen

In `JobsScreen.tsx`, every keystroke triggers an API call. Add a debounce.

**Fix required:**
- Add a `useRef` timer for debouncing search input
- Debounce the `handleSearch` / `setFilters` call by 400ms
- Cancel the timer on unmount
- Example pattern:
```tsx
const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

const handleSearchChange = (text: string) => {
  setSearchQuery(text);
  if (searchTimer.current) clearTimeout(searchTimer.current);
  searchTimer.current = setTimeout(() => {
    setFilters({ search: text.trim() || undefined });
    fetchJobs();
  }, 400);
};

useEffect(() => {
  return () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
  };
}, []);
```

### 6. Separate `isLoadingMore` from `isLoading` in stores

In both `jobsStore.ts` and `applicationsStore.ts`, the `isLoading` flag is shared between initial load and pagination. This causes the full-screen loader to appear when loading page 2+.

**Fix required:**
- Add `isLoadingMore: boolean` to both store interfaces
- In `fetchMoreJobs` / `fetchMoreApplications`, set `isLoadingMore: true` instead of `isLoading: true`
- In the screen components, use `isLoadingMore` to show a footer spinner on the FlatList instead of `isLoading`
- Add a `ListFooterComponent` to the FlatLists:
```tsx
ListFooterComponent={isLoadingMore ? <ActivityIndicator color={colors.primary} style={{ padding: 16 }} /> : null}
```

### 7. Fix pull-to-refresh on ApplicationsScreen

The `ApplicationsScreen` doesn't have a working pull-to-refresh because `applicationsStore` lacks an `isRefreshing` flag.

**Fix required:**
- Add `isRefreshing: boolean` to `ApplicationsState`
- In `fetchApplications`, when `refresh === true`, set `isRefreshing: true` (and `isLoading: false`)
- Reset `isRefreshing: false` in the finally/success path
- Wire up `RefreshControl` in the FlatList:
```tsx
refreshControl={
  <RefreshControl
    refreshing={isRefreshing}
    onRefresh={() => fetchApplications(true)}
    tintColor={colors.primary}
    colors={[colors.primary]}
  />
}
```

---

## LOW PRIORITY — UX Polish

### 8. Add `keyboardDismissMode` to JobsScreen FlatList

**Fix:** Add `keyboardDismissMode="on-drag"` to the `FlatList` in `JobsScreen.tsx`.

### 9. Increase auth timeout

In `App.tsx`, bump `AUTH_TIMEOUT` from `5000` to `10000` (10 seconds) to handle slower mobile connections.

### 10. Add timeout to token refresh call

In `src/api/client.ts`, the refresh token call uses raw `axios` with no timeout. Add a 10-second timeout:

```tsx
const response = await axios.post(refreshEndpoint, { refreshToken }, { timeout: 10000 });
```

---

## Implementation Notes

- Run `npx tsc --noEmit` after all changes to verify TypeScript compiles cleanly
- Do NOT change any backend/API code — only `apps/mobile/` files
- Keep all existing styling and theme usage consistent
- Preserve the existing dark theme colour scheme
- When creating new placeholder screens, follow the pattern of existing screens (SafeAreaView wrapper, consistent header styling, proper TypeScript navigation prop types)
- Test that all imports resolve correctly and barrel exports are complete
