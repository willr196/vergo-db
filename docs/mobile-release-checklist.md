# Mobile release checklist

Everything the app needs before it can install on a real phone. The code is
ready; this list is almost entirely accounts and credentials, and it is the
critical path for release one.

Scope for this release is in [mobile-mvp-scope.md](./mobile-mvp-scope.md).

## Placeholders that must be replaced

These are the values that currently stop a build. Grep for them:

```
grep -rn "YOUR_\|your-" apps/mobile/app.json apps/mobile/eas.json
```

| Where | Key | Current value | Comes from |
| --- | --- | --- | --- |
| `app.json` | `extra.eas.projectId` | `your-eas-project-id` | `eas init` |
| `eas.json` | `submit.production.ios.appleId` | `your-apple-id@example.com` | Apple Developer account |
| `eas.json` | `submit.production.ios.ascAppId` | `your-app-store-connect-app-id` | App Store Connect, after the app record is made |
| `eas.json` | `submit.production.ios.appleTeamId` | `YOUR_TEAM_ID` | Apple Developer, Membership page |
| `eas.json` | `submit.production.android.serviceAccountKeyPath` | `./google-services-key.json` | Google Play Console service account (file is absent) |

## Order of work

### 1. Accounts (do first, they gate everything and involve waiting)

- **Apple Developer Program**, £79/$99 a year. Enrolment commonly takes a few
  days and longer if Apple asks for business verification of Vergo Ltd. Start
  this before anything else.
- **Google Play Console**, one-off $25. Usually same day.

### 2. EAS

```
cd apps/mobile
npx eas login
npx eas init          # writes the real projectId into app.json
npx eas build --profile preview --platform android
```

The Android preview build is the fastest way to get the app onto a phone, and
it does not need the Apple account. Do that first to find out what breaks.

### 3. Push notifications

The app already registers for push and the API already sends it. Neither has
run against a real build.

- iOS: an APNs key from the Apple Developer account, uploaded with
  `eas credentials`.
- Android: an FCM v1 service account JSON, uploaded the same way.
- Then test all five notification types the app routes on: `shift_request`,
  `shift_confirmed`, `shift_declined`, `application_update`, `new_job`.

### 4. Deep links

`app.json` claims `applinks:vergoltd.com` and the `https://vergoltd.com/app`
path prefix, but the association files do not exist yet. Until they are
published, every link falls back to the browser.

Write both into `apps/api/public/.well-known/` (see the README there):

- `apple-app-site-association` with the real Team ID and `com.vergoevents.app`
- `assetlinks.json` with the SHA-256 fingerprint of the Play signing cert

They must be served over HTTPS with no redirect. Test cold, warm, signed in and
signed out, on both platforms.

### 5. Crash reporting

The SDK is wired up (`src/utils/errorReporting.ts`) and does nothing until a DSN
is set, exactly like the API.

- Create a `vergo-mobile` project in the same Sentry org the API uses.
- Put the DSN in `EXPO_PUBLIC_SENTRY_DSN` in the `preview` and `production` env
  blocks of `eas.json`. A DSN is a public write-only key, so it is safe to
  commit; the auth token below is not.
- For readable stack traces, add `organization` and `project` to the
  `@sentry/react-native/expo` plugin in `app.json` and set `SENTRY_AUTH_TOKEN`
  as an EAS secret. Without these, crashes still arrive, just minified.
- Verify by calling `reportError(new Error('test'))` once from a preview build.

What is reported: native crashes, caught render crashes from `ErrorBoundary`,
and 5xx responses from the API. Not reported: 4xx (usually the user) and
requests that never got a response (usually venue wifi).

What is sent about a person: their user id and account type only, bound to the
cache scope in `activateUserCache`. Never name, email or phone. Authorization
headers, cookies, passwords and tokens are scrubbed from every event and
breadcrumb.

### 6. Store listings

- Privacy policy URL: `https://vergoltd.com/privacy` (exists).
- Apple privacy nutrition labels. The app collects a user id for crash
  reporting, and photos for profile pictures.
- Android data safety form, same content.
- Screenshots, description, support URL, and an age rating.

## Before you call it done

From the audit's definition of a safe first release, narrowed to worker-only:

- [ ] A signed build installs on a real iPhone and a real Android phone
- [ ] Push arrives on both, and tapping it opens the right screen
- [ ] Deep links open the app cold, warm, signed in and signed out
- [ ] A worker can register, apply, get a shift, confirm it, check in and check out
- [ ] The hours appear in the ops console timesheet view
- [ ] Signing out and signing in as a different worker shows none of the first
      worker's cached data
- [ ] A forced test crash appears in Sentry with a readable stack trace
- [ ] An offline check-out is not silently lost

## Known and deliberate

- Client screens are in the repo but unreachable. See
  [mobile-mvp-scope.md](./mobile-mvp-scope.md).
- `hoursWorked` and `hoursEstimated` are shown side by side and nothing applies
  the four-hour minimum automatically. That rule is still an open policy
  question.
- `readinessAndWebhook.test.ts` fails on a homepage `theme-color` assertion.
  Pre-existing, unrelated to the app: the test expects `#0c0b0a`, `index.html`
  says `#16130f`, and the blog pages use `#0a0a0a`.
