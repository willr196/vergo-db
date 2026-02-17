Check that the mobile API layer is in sync with the backend for: $ARGUMENTS

1. Read the relevant mobile API service file(s) in src/api/
2. Read the corresponding backend route file(s) in apps/api/src/routes/
3. Compare: endpoint URLs, HTTP methods, request payloads, response shapes
4. Check that TypeScript types in src/types/index.ts match the actual backend response
5. Check the normalizer functions in src/api/normalizers.ts handle all fields
6. Report any mismatches and fix them
7. Run `npx tsc --noEmit` to verify
