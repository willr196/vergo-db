# VERGO Mobile App (`apps/mobile`)

React Native (Expo) mobile client for VERGO job seekers and client companies.

## Current Scope

The app supports two authenticated user journeys:
- Job seeker: browse jobs, apply, track application status, manage profile.
- Client: post/manage jobs, review applicants, hire/reject, manage company profile.

## MVP Status

All MVP features are complete:
- [x] JWT authentication for job seekers and clients
- [x] Job board with search/filter support
- [x] Job detail and apply flow
- [x] Application tracking with status timeline
- [x] Client dashboard (stats + recent applications)
- [x] Client job creation/edit/close flow
- [x] Applicant shortlist/hire/reject actions
- [x] Job seeker + client profile management
- [x] Avatar/logo upload
- [x] Push notification registration and deep-link routing
- [x] Offline-aware caching/queue support for core actions

## Tech Stack

- Expo SDK 54
- React Native 0.81
- TypeScript
- React Navigation v7
- Zustand (auth/jobs/applications/network/ui/notifications stores)
- Axios (JWT bearer token interceptors)
- Expo SecureStore / Expo Notifications / Expo Image Picker / Expo Local Authentication

## Setup

### Prerequisites

- Node.js 18+
- npm
- Expo-compatible simulator or physical device
- EAS CLI (for cloud builds): `npm i -g eas-cli`

### Install

```bash
cd apps/mobile
npm install
cp .env.example .env
```

### Environment Variables

Required:
- `EXPO_PUBLIC_API_URL` (example: `https://vergo-app.fly.dev`)

Optional (for Firebase push setup if used in your environment):
- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID`

## Run Locally

From `apps/mobile`:

```bash
npm run start
```

### On a Physical Device

1. Install Expo Go (or use a development client build).
2. Run `npm run start`.
3. Scan the QR code shown in the terminal/browser.

### On Simulators

```bash
# Android emulator
npm run android

# iOS simulator (macOS + Xcode)
npm run ios
```

Other useful commands:

```bash
npm run web
npm run tunnel
npm run clear
```

## Quality Checks

```bash
npm run lint
npm run typecheck
npm test
```

## Build Profiles (EAS)

`eas.json` contains these primary profiles:
- `dev`: internal distribution, development client, Android debug APK.
- `preview`: internal distribution preview builds (Android APK / iOS device build).
- `production`: store-ready builds (Android AAB / iOS production build, auto-increment enabled).

Also present:
- `development`: legacy alias profile matching development-client behavior.

Example build commands:

```bash
# Development client build
EAS_NO_VCS=1 eas build --platform android --profile dev

# Preview build
EAS_NO_VCS=1 eas build --platform ios --profile preview

# Production build
EAS_NO_VCS=1 eas build --platform android --profile production
```

## App Configuration Notes

- `app.json` is configured for dark brand defaults:
  - `expo.userInterfaceStyle = "dark"`
  - `expo.splash.backgroundColor = "#0a0a0a"`
- Bundle/package identifiers are set:
  - iOS: `com.vergoevents.app`
  - Android: `com.vergoevents.app`

## Project Structure

```text
apps/mobile/
├── App.tsx
├── app.json
├── eas.json
├── src/
│   ├── api/                    # auth/jobs/applications/client APIs + normalizers
│   ├── components/             # shared UI components + loading/error/empty states
│   ├── constants/
│   ├── navigation/             # RootNavigator + typed navigation ref
│   ├── screens/
│   │   ├── auth/
│   │   ├── client/
│   │   └── jobseeker/
│   ├── store/                  # Zustand stores + typed selectors
│   ├── theme/
│   ├── types/                  # app/domain/navigation types
│   └── utils/                  # logger, notifications, network, biometrics, date helpers
├── assets/
└── README.md
```

## API Contract (Mobile)

Mobile app calls JWT-based mobile endpoints only:
- `/api/v1/mobile/*`
- `/api/v1/user/mobile/*`
- `/api/v1/client/mobile/*`

No cookie-session web endpoints are used in the mobile API layer.
