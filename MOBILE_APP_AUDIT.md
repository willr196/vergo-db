# VERGO Mobile App: Detailed Product, Technical, and Release Audit

**Audit date:** 30 August 2026  
**Scope:** `apps/mobile`, with contract checks against the mobile API routes in `apps/api`  
**Assessment type:** read-only architecture, code, API-contract, configuration, and automated-test review  
**Changes made as part of this audit:** none

## Executive summary

The VERGO mobile application is a capable internal-beta foundation. It already contains the main building blocks of a staffing product: authentication, job discovery and applications, a client marketplace, bookings, quotes, notifications, profiles, and a newly introduced shift-confirmation journey.

It is **not yet ready for a dependable public production release**. The main reasons are:

1. Production delivery configuration contains placeholders for EAS and push notifications.
2. Public-domain and deep-link configuration are inconsistent, which can break notification and web-to-app journeys.
3. Offline storage is not scoped to a user or cleared on sign-out, creating privacy and correctness risks on shared devices.
4. Several visible controls do not work end-to-end, notably the DBS job filter and rejection reason.
5. The operational lifecycle that makes a staffing app useful after a booking is very incomplete: availability, location matching, decline/rematch, calendars, check-in/out, timesheets, payment, and compliance self-service.
6. The client experience currently contains two overlapping product models—legacy jobs/applicants and the newer quotes/marketplace/bookings flow—with no clear single source of truth.

The recommended approach is to stabilise release foundations first, correct the confirmed contract defects, then complete one narrow end-to-end staffing lifecycle before adding breadth.

## How this audit was performed

The review covered:

- Mobile app structure, navigation, screens, state, API client, configuration, offline behaviour, notifications, and automated tests.
- The backend routes mounted for the mobile app to validate that client filters, request bodies, and lifecycle actions are actually honoured by the API.
- Release configuration in Expo/EAS files, package scripts, and documentation.
- Static quality checks already available in the repository.

The following checks were run from `apps/mobile`:

| Check | Result | Notes |
| --- | --- | --- |
| TypeScript typecheck | Passed | No type errors found. |
| Jest suite | Passed | 12 suites and 162 tests passed. |
| ESLint | Passed with warnings | Two warnings in the new Shift screens; both concern ternary-expression statements. |
| Device/simulator validation | Not performed | Requires real device/simulator configuration and production service credentials. |
| Mobile end-to-end test suite | Not present | No Detox/Maestro-style end-to-end coverage was found. |

The passing unit tests are useful, but they do not demonstrate that a real installed build can register for pushes, open a web link, complete a booking, or recover safely after offline use.

## Current mobile product surface

### Jobseeker-facing journeys

The app currently contains screens and supporting APIs for:

| Journey | Current capability | Assessment |
| --- | --- | --- |
| Authentication | Welcome, login, register, password reset, persisted login, token refresh, optional biometric lock | Good foundation. |
| Job discovery | Browse jobs, search, filters, job detail, city/meta endpoints | Present, but matching and filters need correction. |
| Applying | Application form, application list/detail, withdraw, offline queue for apply/withdraw | Core journey exists; offline reliability needs work. |
| Profile | View/edit profile and basic preference data | Present, but not yet a meaningful availability or compliance hub. |
| Saved jobs | API and store support exist | Not exposed as a usable UI journey. |
| Recommendations | API endpoint exists | Not personalised and apparently not surfaced in the user flow. |
| Shifts | New list, detail and confirm journey | Early implementation; critical lifecycle pieces missing. |

### Client-facing journeys

The application currently contains two partially overlapping client product areas.

**Newer marketplace and booking flow**

- Client dashboard.
- Browse staff marketplace.
- Staff detail.
- Create quote.
- Quote list.
- Create booking.
- Booking list/detail.
- Company profile and edit profile.

**Older job and applicant flow**

- My jobs.
- Create/edit job.
- Client job detail.
- Applicant list.
- Applicant detail/review.

The active client tabs favour the marketplace/booking route. However, legacy job screens remain in the navigator, types, tests, and notification routing. This needs an intentional product decision; otherwise both systems will continue to diverge.

## Architecture overview

### Mobile stack

The app is an Expo/React Native app built with TypeScript. It uses React Navigation for routing, Zustand for app state, Axios for API access, SecureStore for authentication tokens, AsyncStorage for cached/offline data, Expo Notifications for push notifications, Expo Image Picker for profile images, and Expo Local Authentication for biometrics.

This is a sensible, mainstream stack. The primary risks are not framework choice; they are release configuration, inconsistent feature maturity, and missing reliability guardrails.

### Navigation

The primary role-specific tab structure is:

```text
Jobseeker
├── Jobs
├── Shifts
├── Applications
└── Profile

Client
├── Dashboard
├── Browse Staff
├── Bookings
└── Profile
```

The stack also retains older client job/applicant screens. Notifications route to a mixture of new and old paths:

| Notification type | Destination |
| --- | --- |
| `application_update` | Application detail |
| `new_applicant` | Legacy client job detail |
| `new_job` | Job detail |
| `shift_request` | Shift detail |
| `shift_confirmed` | Booking detail |

This mapping is another indication that client workflows are not fully consolidated.

### Authentication and session handling

Positive aspects:

- Access and refresh tokens are stored in Expo SecureStore rather than plain AsyncStorage.
- The Axios client includes token refresh handling and avoids multiple simultaneous refresh attempts.
- Authenticated state can be restored after app launch.
- Biometric protection is supported where enabled.

Items to validate or improve:

- If a user has enabled biometrics but biometrics becomes unavailable on the device, the current fallback behaviour should be explicitly defined and tested.
- Sign-out must clear all user-owned cached data, not only SecureStore tokens.
- Add tests for token-refresh failure, reuse detection, forced sign-out, expired sessions, and app relaunch while refresh is in progress.

## Release and deployment readiness

### P0: EAS and push-notification configuration are placeholders

`app.json` and `eas.json` contain placeholder production identifiers, including the Expo/EAS project ID and Apple submission values. Android submission configuration also expects a local Google service-account key path.

Consequences:

- A reproducible production build cannot be assumed.
- `getExpoPushTokenAsync` may be unable to determine the correct EAS project ID.
- iOS and Android store submission settings are not ready to use safely.
- A new developer cannot follow the repository configuration alone to create a release.

Required completion:

1. Replace placeholders with real project identifiers through the approved secrets/configuration process.
2. Verify development, preview, and production build profiles on actual devices.
3. Confirm Android Firebase/FCM and Apple APNs credentials are configured in the release environment.
4. Add an owner and renewal process for credentials, certificates, and push keys.
5. Document which settings are committed versus provided through CI/CD secrets.

### P0: Deep linking and public domains are inconsistent

The mobile configuration advertises `vergoevents.com` and the Fly deployment domain for universal/app links. The backend identifies `vergoltd.com` as the canonical public host. The React Navigation linking prefixes do not cover every configured domain, and association files for iOS Universal Links / Android App Links were not found in the repository.

Consequences:

- A link sent by email, SMS, website, or a notification may open a browser instead of the app.
- A link may open the app but fail to navigate to its intended screen.
- iOS and Android may not trust the association between the public web domain and the installed application.

Required completion:

1. Choose the one canonical public domain and document it.
2. Align `app.json`, navigation prefixes, backend URL generation, emails, notification payloads, and website links to that domain.
3. Publish and verify `apple-app-site-association` and `assetlinks.json` on the canonical public domain.
4. Add tested deep-link routes for every notification destination.
5. Test cold start, warm start, logged-out, and logged-in deep-link behaviour on iOS and Android.

### P1: No production observability

The local logger intentionally logs only in development. The error boundary displays a recovery UI, but does not report production exceptions to an error-monitoring service. No analytics or funnel measurement integration was found.

This means the team will be largely blind to:

- Crashes by device, OS, app version, and route.
- Failed API requests and slow screens.
- Push-registration failures.
- Drop-off in registration, application, quote, and booking flows.
- Offline queue failures or cache corruption.

Required completion:

- Add a production error-reporting platform and source-map upload process.
- Capture non-sensitive operational events: login success/failure, application submitted, booking requested, booking confirmed/cancelled, and push registration state.
- Define a privacy-safe event taxonomy before adding analytics.
- Add release-version, device, API environment, and feature-flag context to errors.

### P1: OTA/update strategy is not defined

The EAS profiles do not establish a clear update channel or runtime-version strategy. An update policy is important once native features such as notifications, biometric access, and deep linking are in use.

Required completion:

- Decide whether Expo Updates will be used.
- If yes, define runtime versions, preview/production channels, rollback ownership, and a release checklist.
- If no, document that all changes require store builds and define an urgent-fix process.

## Confirmed API and product defects

### P0/P1: DBS filter is visible but has no server effect

The Jobs filter modal offers **“Hide jobs requiring DBS check”**. The mobile API sends `dbsRequired=false`, but the mobile jobs backend query schema does not accept or apply that parameter. The job model/response also does not provide a reliable DBS filter field for that filter to act upon.

Current user impact:

- A jobseeker believes the list was filtered.
- Jobs requiring DBS may remain in the results.
- Trust in filters is reduced because the UI provides a false result.

Required decision:

- Either model DBS requirement correctly end-to-end—database field, admin creation/editing, API response, query validation/filtering, UI badge and tests—or remove the filter until it is genuine.

Acceptance criteria:

- A job marked as requiring DBS is returned only when the applied filter permits it.
- Filter selections survive pagination and refresh.
- The result count and empty states are accurate.
- API and UI tests cover true, false, unset, and legacy-data values.

### P0/P1: Rejection reason is silently dropped

The client-side application-status API accepts a `rejectionReason` argument. It does not send the value in its request payload, and the receiving backend schema does not accept it. A client/admin can therefore enter a rejection reason that is never persisted or available to the applicant.

Current user impact:

- Rejected applicants may receive no explanation despite staff entering one.
- Operations users may incorrectly assume communication was sent/stored.
- Auditing and dispute handling lack key context.

Required completion:

1. Decide whether a rejection reason is internal-only, applicant-visible, or both.
2. Add the appropriate persistence field(s), validation, API contract, and permissions.
3. Send the field from the mobile app.
4. Display applicant-visible wording in application detail and notification/email templates where appropriate.
5. Ensure sensitive internal notes are never exposed accidentally.

### P1: Recommended jobs are not recommendations

The recommended-jobs endpoint is labelled as profile-based, but it returns upcoming open jobs ordered by date/creation. It does not appear to use the authenticated user’s profile, location, role preferences, availability, qualifications, or travel requirements. It is also not clearly exposed in the jobseeker UI.

Required completion:

- Do not market the endpoint as personalised until matching logic exists.
- Start with transparent matching signals: selected role, tier, city/radius, minimum rate, availability, and DBS/right-to-work suitability.
- Explain why a job is recommended: for example, “Matches your bartender role and 10-mile travel radius.”
- Add a fallback “Latest jobs” section when sufficient preference data is not available.

### P1: Saved jobs are unfinished from the user’s perspective

Saved-job API and state support exist, but the mobile jobseeker interface does not provide an obvious save/unsave action or a Saved Jobs destination.

Required completion:

- Add save/unsave to job cards and job detail.
- Add a Saved Jobs list, including empty state and expired/closed job treatment.
- Reconcile saved state reliably after logout/login and offline use.
- Track whether saves improve application conversion before expanding the feature.

### P1: Shifts list is limited to the first 50

The new Shifts screen requests page one with a limit of 50 and does not expose pagination, infinite scrolling, or a visible results limit.

Required completion:

- Add cursor or page-based pagination with loading, retry, and end-of-list states.
- Choose default filters: upcoming, historical, confirmed, pending action, and cancelled.
- Add a clear count or date range so users understand the result set.
- Test users with more than 50 historic or upcoming shifts.

## Offline behaviour, privacy, and resilience

### P0: Cached data can cross user sessions

Jobs and applications are cached in AsyncStorage. Cache keys are not scoped to the authenticated user/session, and token clearing on sign-out does not clear the cached application data or queued offline actions.

Example risk:

1. Person A signs in on a shared phone and opens their applications.
2. The app stores application content locally.
3. Person A signs out.
4. Person B signs in, or the app is opened while offline.
5. The app can show Person A’s cached data before a network refresh.

This is particularly important because application data can include application status and cover-note content.

Required completion:

- Namespace all cached data by immutable user ID and environment.
- Clear user-scoped caches and queued actions on logout, account switch, forced logout, and token-reuse detection.
- Encrypt or minimise any cache that contains personal data.
- Add cache time-to-live, schema versioning, and a migration/clear strategy.
- Add automated tests that simulate two different users on the same device.

### P0/P1: Offline action replay can silently discard failures

The offline queue currently supports only application and withdrawal actions. When connectivity returns, it attempts replay and removes actions even when the operation fails. It does not provide a user-visible recovery state, conflict handling, idempotency key, expiry policy, or retained retry history.

Potential outcomes:

- A user thinks an application was submitted but it was rejected due to capacity, an expired job, or authentication failure.
- A withdrawal fails and the user assumes it succeeded.
- A transient API problem discards the action permanently.

Required completion:

- Give every queued write an idempotency key.
- Keep failed actions with a classified failure state: retrying, needs attention, conflict, expired, or permanently failed.
- Notify the user when an action is truly completed or needs action.
- Provide an in-app pending-actions view where appropriate.
- Avoid replaying actions for a different logged-in account.
- Test loss of connection at every step: before request, during request, after server success but before client acknowledgement, and after relogin.

### P1: Offline content is stale and filter-inaccurate

The cache stores a timestamp but does not enforce a clear staleness policy. Offline job browsing can return the full cached dataset rather than faithfully applying active filters. Marketplace, bookings, quotes, shifts, and profile updates have no comparable offline strategy.

Required completion:

- Define which resources can be cached and their maximum age.
- Clearly label stale/offline results in the interface.
- Do not claim filters are applied when only unfiltered cached data is available.
- Prioritise read-only offline availability for upcoming confirmed shifts and bookings after cache-isolation work is complete.

## Jobseeker capability gaps

### Availability and matching

The app has basic profile/availability concepts, but not the scheduling model necessary for dependable staffing matching.

Missing or incomplete capabilities:

- Calendar-based availability and unavailable dates.
- Recurring availability patterns.
- Maximum travel distance/time and transport mode.
- Role-by-role availability and qualifications.
- Conflict detection with accepted bookings.
- Minimum rate preferences and short-notice opt-in.
- Matching explanations and match-quality score.
- Employer-side confirmation that the worker is actually eligible and available.

Recommended first version:

1. Weekly recurring availability plus dated exceptions.
2. Home-area postcode with a chosen travel radius.
3. Role and tier preferences.
4. Server-side matching and clear reasons shown to both sides.
5. Conflict checks before a worker confirms a shift.

### Shift lifecycle

The new Shifts flow allows listing, viewing details, and confirmation. It does not yet cover the real-world lifecycle of temporary staffing work.

Missing:

- Decline with optional reason.
- Request change/reschedule.
- Calendar integration.
- Directions/map and venue contact number.
- Clear arrival instructions, dress code, equipment, and emergency contact.
- Check-in/check-out and timesheet approval.
- Break recording where required.
- Late/no-show workflow.
- Completed-shift confirmation and dispute path.
- Worker earnings estimate versus final approved pay.
- Shift history, export, and pay/payout history.

The confirmation screen also references accepting terms without showing the applicable terms. It should link to the exact terms version, record the version, and allow the worker to review it before confirmation.

### Applications and communication

The basic apply/list/detail/withdraw flow exists. It needs stronger user confidence and operational support:

- Clear application submission receipt, including queued/offline state.
- Status timeline with dates and meaningful explanations.
- Persisted, permissioned rejection feedback.
- In-app communication or a clear communication channel after a shortlist/booking event.
- Withdrawal reason and reapplication rules.
- Document/status checklist if required before a worker can be confirmed.
- Job alerts and preference-based notification controls.

### Account, privacy, and compliance

No complete self-service account-management centre was identified for:

- Password change from inside the signed-in app.
- Account deletion request.
- Data export request.
- Privacy preferences and marketing consent.
- Notification-category preferences.
- Right-to-work document submission/status.
- DBS status/document handling.
- Other role-specific qualification evidence.

Any document flow should be designed with strict access controls, retention policy, encryption, audit logging, and a clear division between document verification status and the underlying sensitive document.

## Client capability gaps

### Staff discovery and matching

The marketplace lets a client browse staff, but it does not yet meet the practical filtering needs of staffing operations.

Missing high-value filters and matching signals:

- Venue/job location and distance/radius.
- Date/time availability for the exact shift.
- Role, experience, tier, language, and qualification.
- DBS/right-to-work status where appropriate and lawfully displayable.
- Rating, reliability, attendance history, and completed-shift count.
- Rate range and total booking cost.
- Short-notice availability.
- Team/worker favourites and prior-worker rebooking.

The first matching screen should answer a client’s primary question: **who is eligible and available near this location for this exact time?**

### Booking operations

Current booking capability is create, list/detail, client cancel, and worker confirm. Important real-world actions are absent:

- Worker decline and decline reason.
- Automatic or manual rematching after decline/cancellation.
- Client reschedule/edit.
- Reassign a shift to a different worker.
- Cancellation reason UI, despite backend support for a reason field.
- Booking owner/team assignment.
- Arrival confirmation and live operational state.
- No-show escalation.
- Timesheet approval and dispute handling.
- Repeat and template-based bookings.
- Bulk booking for several workers/shifts.

### Commercial and finance features

The app explicitly labels Billing & Payments as coming soon. There are no end-user mobile flows for:

- Adding or managing payment methods.
- Invoice list/detail/download.
- Receipts and payment status.
- Subscription/plan management, if applicable.
- Quote acceptance and conversion to booking.
- Cancellation fees and credits.
- Worker earnings, payout status, or tax documents.

Before accepting real commercial traffic, define the source of truth for prices, fees, taxes, refunds, invoice generation, payment failures, and support escalation.

### Client teams and communication

No complete mobile support was identified for:

- Multiple users within a client company.
- Role-based permissions for venue manager, recruiter, finance, and administrator.
- Venue/location management.
- Internal notes.
- Staff/client messaging.
- Reviews and feedback.
- Service-level or booking-performance reporting.

## Product-model consolidation: legacy jobs versus marketplace bookings

This is an important strategic decision, not merely a code-clean-up task.

| Model | Main flow | Current state |
| --- | --- | --- |
| Legacy recruitment | Client creates a job, applicants apply, client reviews applicants | Screens, tests, types and notification route remain. |
| Marketplace staffing | Client browses staff, requests a quote/booking, worker confirms shift | Favoured by active client tabs and newer screens. |

Both models can coexist only if their distinction is explicit to users. For example, a client could publish an open opportunity **or** directly request pre-vetted cover. If that is the intended product, navigation, terminology, status models, notifications, dashboards, and reporting need to explain it clearly.

If the intent is to replace legacy jobs with bookings, create a migration plan:

1. Stop exposing legacy creation routes to new clients.
2. Redirect old notifications to an appropriate new workflow.
3. Preserve read-only history where required.
4. Migrate or retire duplicate types, API methods, stores, and tests.
5. Remove unreachable code only after migration is complete and verified.

## Testing, quality, and developer experience

### Current test picture

The unit suite passed with 162 tests across 12 suites. Existing coverage is strongest around authentication, API normalisation, shared UI components, matching utilities, and older client screens.

Important areas with little or no meaningful mobile UI coverage:

- Jobseeker Jobs, Job Detail, Apply, Applications, Application Detail, Profile, and Edit Profile screens.
- New Shifts list/detail/confirmation screens.
- Root navigation and role switching.
- Push-notification routing and deep links.
- Axios token refresh and forced logout behaviour.
- Offline queue, retries, idempotency, and multi-user cache isolation.
- Image upload and permission denial paths.
- Booking cancellation, confirmation, conflict, and error paths.
- Error boundary and recovery experience.

The tests also emit repeated React `act(...)` warnings caused by animated updates. The suite still passes, but warning-free tests are important: noisy output makes real failures easier to miss.

### Recommended test layers

| Layer | Purpose | Minimum coverage |
| --- | --- | --- |
| Unit tests | Pure business rules and normalisers | Matching, status mappings, dates, cache keys, permissions. |
| API-contract tests | Ensure app and server agree | Filters, rejection reason, pagination, booking state transitions. |
| Component tests | Validate individual screens | Loading, error, empty, success, disabled, and retry states. |
| Integration tests | Validate state + network + navigation | Apply, refresh token, sign out, offline queue replay. |
| End-to-end/device tests | Validate real installed journeys | Login, push/deep link, apply, quote/booking, confirm/decline shift. |
| Release smoke tests | Validate each build profile | Notifications, camera/photo picker, biometrics, universal links, API environment. |

### CI and release controls

No visible repository CI workflow was identified for the mobile project. A minimal pipeline should run on each pull request:

1. Install locked dependencies.
2. Typecheck.
3. Lint with warnings tracked or disallowed for touched code.
4. Unit and API-contract tests.
5. Dependency/security audit according to the team’s package-management policy.
6. Preview-build validation on protected release branches.

For releases, require a checklist covering API environment, app version/build number, update channel, deep links, push credentials, privacy disclosures, crash reporting, and device smoke tests.

### Documentation gaps

The mobile README presents the MVP as complete, while other project documentation describes mobile screens as under construction. The README also refers to an `.env.example` file that is not present.

Required completion:

- Define which features are production-ready, beta, experimental, or retired.
- Add an accurate environment-variable template that contains no secrets.
- Document local development, test, preview build, production build, and submission commands.
- Document push/deep-link configuration and owners.
- Keep release state in one authoritative place.

## Permissions and platform compliance review

The app requests camera, media-library, notification, and biometric-related capabilities. These align broadly with profile/image and authentication features, but Android storage permissions should be reviewed carefully. Broad legacy storage permissions can create extra store-review and privacy questions if the app only needs the modern media-picker experience.

Before release:

- Request only permissions that are used by a real feature.
- Trigger each permission only at the point of user action, with clear rationale copy.
- Test denial, limited-library access, revoked permission, and device-without-biometric paths.
- Ensure store privacy declarations accurately reflect cached personal data, diagnostics, notifications, and image upload.
- Maintain a data-retention and deletion policy for applications, compliance documents, booking data, and device caches.

## Prioritised delivery roadmap

### Phase 0 — Release foundation and data safety

**Goal:** make installed builds trustworthy, observable, and safe on shared devices.

- Complete EAS, APNs, FCM, and store submission configuration.
- Select and align the canonical domain/deep-link strategy.
- Publish and test universal/app-link association files.
- Add crash reporting and privacy-safe operational events.
- Scope caches and offline queues by user; clear them safely on logout/account switch.
- Make offline writes idempotent, retained on failure, and visible to the user.
- Add CI for typecheck, lint, tests, and a release checklist.

**Exit criteria:** preview builds install on iOS and Android, receive a push, open every supported deep link, report a test crash, and cannot show one user another user’s cached application content.

### Phase 1 — Correct visible product behaviour

**Goal:** ensure every shipped control tells the truth and core journeys complete reliably.

- Fix or remove DBS filter until it works end-to-end.
- Persist and display rejection reason according to a clear visibility policy.
- Add Shift pagination/status filters and error/retry states.
- Surface Saved Jobs or remove unused saved-job infrastructure.
- Rename/rebuild recommendations until they are genuinely profile-based.
- Resolve the two client product flows and update notifications accordingly.

**Exit criteria:** all filters are server-enforced, status changes retain their intended data, no list silently truncates, and every active navigation route represents a current product workflow.

### Phase 2 — Complete the staffing lifecycle

**Goal:** support a worker and client from discovery to a completed shift.

- Worker availability calendar, location/radius, role preferences, and conflicts.
- Client search by location, role, eligibility, availability, and cost.
- Shift accept/decline/reschedule with terms visibility and audit trail.
- Calendar, maps, arrival information, venue contact, and operational instructions.
- Client rematch/reassign and cancellation reasons.
- Check-in/out, timesheet, and dispute/no-show handling.

**Exit criteria:** a client can find an eligible nearby worker for a specific time, the worker can accept or decline with full context, and both sides can record the completed shift unambiguously.

### Phase 3 — Commercial, trust, and scale features

**Goal:** make the marketplace commercially operable at scale.

- Invoices, payments, receipts, fees, credits, and cancellations.
- Worker earnings and payout history.
- Compliance/document self-service with secure verification status.
- Client teams, roles, venues, templates, bulk/repeating bookings.
- Reviews, reliability signals, support tools, and reporting.
- Preference-driven alerts and notification controls.

## Suggested ownership model

| Area | Primary owner | Supporting owner |
| --- | --- | --- |
| Build credentials, EAS, store release | Engineering/release owner | Operations |
| Deep links and public domain | Backend/platform | Mobile |
| Cache, offline queue, auth safety | Mobile | Backend/API |
| Booking state machine and rematching | Product + backend | Mobile + operations |
| Availability and location matching | Product + backend | Mobile |
| Payments and invoices | Finance/product | Backend + mobile |
| Compliance documents | Operations/compliance | Backend + mobile |
| Analytics and crash reporting | Product/engineering | Privacy/compliance |

## Definition of a safe first public release

The following is a pragmatic minimum bar before treating the app as a public-facing production product:

- Real production builds and push notifications work on both platforms.
- Deep links work from the canonical public domain while the app is cold, warm, logged in, and logged out.
- No cross-account cached data is possible after sign-out or account switching.
- Failed offline actions are not silently lost.
- Every visible filter/action is either functional end-to-end or removed.
- A worker can clearly understand, accept, decline, and access a confirmed shift.
- A client can see reliable availability/location information before booking and handle decline/cancellation.
- Crashes and critical failed API calls are observable by the team.
- Core jobseeker and booking workflows have automated integration/device coverage.
- Privacy disclosures, permission usage, and sensitive-data retention are reviewed.

## Source areas reviewed

- `apps/mobile/App.tsx`
- `apps/mobile/app.json`
- `apps/mobile/eas.json`
- `apps/mobile/src/navigation/RootNavigator.tsx`
- `apps/mobile/src/api/*`
- `apps/mobile/src/stores/*`
- `apps/mobile/src/screens/jobseeker/*`
- `apps/mobile/src/screens/client/*`
- `apps/mobile/src/components/JobFiltersModal.tsx`
- `apps/mobile/src/utils/logger.ts`
- `apps/mobile/src/__tests__/*`
- `apps/api/src/routes/mobileJobs.ts`
- `apps/api/src/routes/mobileJobApplications.ts`
- `apps/api/src/routes/mobileClient.ts`
- `apps/api/src/routes/mobileMarketplace.ts`
- `apps/api/src/routes/mobileShifts.ts`
- `apps/api/src/index.ts`

---

This document is intended to be a working backlog and release-readiness record. Update the assessment status and acceptance criteria as each issue is resolved rather than leaving it as a one-time snapshot.
