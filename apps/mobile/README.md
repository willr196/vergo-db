# VERGO Mobile App (`apps/mobile`)

React Native (Expo) app for the people who work VERGO shifts and the clients
who book them.

## Current Scope

Workers and clients (decisions and reasoning in `docs/mobile-mvp-scope.md`).
Clients request staff and follow their bookings; VERGO picks who goes. There
is no browse-and-book marketplace.

## MVP Status

The client journey is built and tested:
- [x] Register, verify, get approved, sign in
- [x] Request staff; the office and the client are both emailed
- [x] Follow requests; see bookings with the named worker and recorded hours
- [x] Change or cancel by call or email (live contact details and terms from the API)
- [x] Edit company profile

The worker journey is built and tested:
- [x] Register, sign in, stay signed in (JWT, refresh, biometrics)
- [x] Browse, search and save jobs; apply; track and withdraw applications
- [x] Receive a shift, see the terms, confirm or decline it
- [x] Check in, check out, add a note
- [x] See recorded hours
- [x] Edit profile, upload avatar
- [x] Push notification registration and deep-link routing
- [x] Crash reporting (Sentry, once `EXPO_PUBLIC_SENTRY_DSN` is set)

Not done, and blocking a phone install: the EAS project id, Apple and Google
developer accounts, push credentials and the app-link files. See "Still open"
in `docs/mobile-mvp-scope.md`.

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

The canonical public deep-link domain is `https://vergoltd.com/app`. The API
host may remain `vergo-app.fly.dev`; it is intentionally separate from the
public link domain.

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
