# VERGO Mobile App

React Native/Expo event staffing app. Two user types: **job seekers** and **clients**.

## Commands
```
npm start              # Dev server
npm run typecheck      # ALWAYS run after changes
npx expo start -c      # Clear cache + start
eas build --platform android --profile preview   # Test APK
```

## Architecture
```
src/
├── api/            # Axios client + service modules
│   ├── client.ts   # Base instance, JWT interceptors, token refresh
│   ├── auth.ts     # Login/register (jobseeker + client endpoints)
│   ├── jobs.ts     # Job listing/detail
│   └── applications.ts  # Apply, withdraw, status tracking
├── components/     # Reusable: Button, Input, JobCard, StatusBadge, LoadingStates
├── navigation/     # RootNavigator.tsx — auth flow + tab navigators
├── screens/
│   ├── auth/       # Welcome, Login, Register, ForgotPassword
│   ├── jobseeker/  # Jobs, JobDetail, Applications, ApplicationDetail, Profile, EditProfile, ApplyToJob
│   └── client/     # Dashboard, MyJobs, CompanyProfile (WIP)
├── store/          # Zustand: authStore, jobsStore, applicationsStore
├── theme/          # Colors, spacing, typography, borderRadius
└── types/          # All TypeScript interfaces + navigation params
```

## Auth System
- JWT-based: access tokens (15m) + refresh tokens (30d)
- Tokens stored in expo-secure-store
- Job seeker endpoints: /api/v1/user/mobile/*
- Client endpoints: /api/v1/client/mobile/*
- Shared endpoints: /api/v1/mobile/* (jobs, applications)
- API responses always wrapped: { ok: true, ... }
- Token refresh handled automatically in client.ts interceptor

## Navigation Structure
- Auth: Welcome → Login/Register → ForgotPassword
- JobSeeker: Tabs(Jobs, Applications, Profile) + stack screens (JobDetail, ApplyToJob, ApplicationDetail, EditProfile)
- Client: Tabs(Dashboard, MyJobs, CompanyProfile) — client screens still being built

## Design System — IMPORTANT
- Background: #0a0a0a, Surface: #1a1a1a, Primary/Gold: #D4AF37
- Text: primary #ffffff, secondary #999999
- Success: #28a745, Error: #ff6b6b
- Use colors, spacing, borderRadius, typography from ../theme
- System fonts, consistent sizing: xs(12) sm(14) md(16) lg(18) xl(20) xxl(24)
- All screens use SafeAreaView from react-native-safe-area-context

## State Management
- Zustand stores with selectors exported from store/index.ts
- Auth state: useAuthStore — isAuthenticated, userType, user, login/logout/checkAuth
- Jobs: useJobsStore — jobs list, filters, pagination, search
- Applications: useApplicationsStore — user applications, status filter, fetch/withdraw

## Code Patterns
- Screens use CompositeScreenProps for nested navigation typing
- API services return normalized data (see api/normalizers.ts)
- Application status values: received, reviewing, shortlisted, hired, rejected, withdrawn
- All API calls go through the Axios instance in client.ts — never use raw fetch
- Use LoadingScreen and EmptyState components for loading/empty states

## Common Pitfalls
- Application status enums must match backend exactly (lowercase)
- Client mobile endpoints differ from web session endpoints — check api/README.md
- Navigation params are typed in types/index.ts — update RootStackParamList when adding screens
- The user object in authStore can be either JobSeeker or ClientCompany — always type-narrow
