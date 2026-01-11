# VERGO Events Mobile App

A premium React Native mobile app for VERGO Events - London's premier event staffing agency.

## Overview

VERGO connects:
- **Job seekers** (bartenders, servers, chefs, event staff) with event work opportunities
- **Client companies** (venues, corporate clients, production companies) with premium event staff

## Tech Stack

- **Framework**: React Native (Expo managed workflow)
- **Language**: TypeScript
- **Navigation**: React Navigation v7
- **State Management**: Zustand
- **API Client**: Axios
- **Storage**: Expo SecureStore
- **Notifications**: Expo Notifications + FCM

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- Expo Go app on your phone (for testing)

### Installation

```bash
# Clone the repo
git clone <repository-url>
cd vergo-app

# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Edit .env with your API URL

# Start the development server
npm start
```

### Running on Device

1. Install the **Expo Go** app on your Android/iOS device
2. Run `npm start` in the project directory
3. Scan the QR code with Expo Go (Android) or Camera app (iOS)

### Running on Emulator

```bash
# Android
npm run android

# iOS (macOS only)
npm run ios
```

## Project Structure

```
vergo-app/
├── App.tsx                 # Entry point
├── src/
│   ├── api/               # API client and services
│   │   ├── client.ts      # Axios instance with interceptors
│   │   ├── auth.ts        # Auth endpoints
│   │   ├── jobs.ts        # Jobs endpoints
│   │   └── applications.ts # Applications endpoints
│   ├── components/        # Reusable UI components
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── JobCard.tsx
│   │   ├── StatusBadge.tsx
│   │   └── LoadingStates.tsx
│   ├── navigation/        # Navigation configuration
│   │   └── RootNavigator.tsx
│   ├── screens/           # Screen components
│   │   ├── auth/          # Login, Register, Welcome
│   │   ├── jobseeker/     # Job seeker screens
│   │   └── client/        # Client screens (TBD)
│   ├── store/             # Zustand stores
│   │   ├── authStore.ts
│   │   ├── jobsStore.ts
│   │   └── applicationsStore.ts
│   ├── theme/             # Design system
│   │   └── index.ts
│   ├── types/             # TypeScript types
│   │   └── index.ts
│   └── utils/             # Utility functions
├── assets/                # Images, fonts
└── .env                   # Environment variables
```

## Design System

### Colors

| Name | Hex | Usage |
|------|-----|-------|
| Background | `#0a0a0a` | Main app background |
| Surface | `#1a1a1a` | Cards, inputs |
| Primary | `#D4AF37` | Gold accent, CTAs |
| Text Primary | `#ffffff` | Main text |
| Text Secondary | `#999999` | Muted text |
| Success | `#28a745` | Positive status |
| Error | `#ff6b6b` | Errors, warnings |

### Typography

- Uses system fonts for native feel
- Consistent font sizes: xs(12), sm(14), md(16), lg(18), xl(20), xxl(24)

## Features

### MVP Features (v1.0)

- [x] User authentication (login/register)
- [x] Job seeker and client user types
- [x] Job board with search and filters
- [x] Job detail view
- [x] Application submission
- [x] Application tracking
- [x] Profile management
- [ ] Push notifications
- [ ] Client dashboard
- [ ] Job posting (clients)

### Future Features

- In-app messaging
- Payment processing
- Staff scheduling
- Reviews and ratings
- Offline support

## API Integration

The app connects to an existing Express.js backend. Key endpoints:

```
POST /api/auth/login
POST /api/auth/register
GET  /api/jobs
GET  /api/jobs/:id
POST /api/applications
GET  /api/applications/me
```

## Building for Production

### Android

```bash
# Build APK
eas build --platform android --profile preview

# Build AAB (for Play Store)
eas build --platform android --profile production
```

### iOS

Requires macOS with Xcode:

```bash
eas build --platform ios --profile production
```

## Contributing

1. Create a feature branch from `main`
2. Make your changes
3. Run type checking: `npm run typecheck`
4. Submit a pull request

## License

Private - VERGO Events Ltd.
