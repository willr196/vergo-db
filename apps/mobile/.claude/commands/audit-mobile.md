Audit the mobile app for issues in: $ARGUMENTS

Check ALL of the following:
1. API integration: Do frontend API calls match backend endpoints and response shapes?
2. Type safety: Are types in src/types/index.ts accurate to what the API returns?
3. Navigation: Are all screen params correctly typed in RootStackParamList?
4. State: Are Zustand stores handling loading, error, and empty states correctly?
5. UX: Are there missing loading indicators, error messages, or empty states?
6. Status enums: Do application/job status strings match the backend exactly?

List ALL issues found with file paths and line numbers, then fix them all.
Run `npx tsc --noEmit` after all fixes.
