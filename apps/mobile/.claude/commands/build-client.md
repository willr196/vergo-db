Build the client-side screen/feature: $ARGUMENTS

The client side of the app is still being built. Follow these steps:
1. Check what client API endpoints exist: src/api/ files and the backend at apps/api/
2. Check client mobile endpoints: /api/v1/client/mobile/* and /api/v1/mobile/*
3. Replace the placeholder in navigation/RootNavigator.tsx with a real screen
4. Create the screen in src/screens/client/
5. Add any needed API service methods to src/api/
6. Update types/index.ts with any new types or navigation params
7. Export from src/screens/client/index.ts
8. Match job seeker screens for quality: loading states, empty states, error handling, pull-to-refresh
9. Use the existing theme and component library
10. Run `npx tsc --noEmit` to verify
