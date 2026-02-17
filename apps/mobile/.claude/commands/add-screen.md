Create a new screen for: $ARGUMENTS

Follow these patterns:
1. Create the screen component in the correct folder (src/screens/jobseeker/ or src/screens/client/)
2. Use SafeAreaView, import theme values (colors, spacing, borderRadius, typography)
3. Use CompositeScreenProps for navigation typing
4. Add the screen to types/index.ts RootStackParamList
5. Register the screen in navigation/RootNavigator.tsx
6. Export from the screens barrel file (src/screens/jobseeker/index.ts or src/screens/client/index.ts)
7. Include loading state (LoadingScreen) and error handling
8. Match the dark theme: background #0a0a0a, surface #1a1a1a, gold accent #D4AF37
9. Run `npx tsc --noEmit` to verify
