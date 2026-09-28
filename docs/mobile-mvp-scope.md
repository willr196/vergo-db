# Mobile MVP scope

**Decision, 6 September 2026:** the first release of the VERGO app was
worker-side only.

**Decision, 28 September 2026:** the client side goes in too, as **quotes and
bookings**. Clients ask for staff and follow what we confirm; VERGO picks who
goes. The marketplace model (clients browse staff and book a named person,
priced by subscription and staff tier) is **not** used: it contradicts the flat
public rate card and how bookings are actually run.

## Why

MOBILE_APP_AUDIT.md flagged that the app carried overlapping client product
models: the legacy jobs and applicants flow, and the quotes, marketplace and
bookings flow. The jobs flow was removed from the app on 14 September. Of what
was left, quotes and bookings match the website and the ops console; the
marketplace did not, so its screens were deleted.

## The worker journey

1. Register, sign in, stay signed in.
2. Browse and search jobs, save a job, apply, track and withdraw applications.
3. Receive a shift, see the terms, confirm or decline it.
4. Check in on arrival, check out at the end, add a note.
5. See the hours that were recorded, and know the office confirms them.
6. Edit a profile.

## The client journey

1. Register, verify the email, wait for approval in Admin > Clients (the office
   is emailed on registration), then sign in.
2. Request staff: date, times, location, roles, headcount. The office is
   emailed the request and the client gets a receipt, the same as the
   website's quote form. It also appears in Admin > Quotes as NEW.
3. Follow each request's status.
4. See bookings once the office creates them: the named worker, times, and the
   check-in, check-out and hours the worker recorded.
5. Change or cancel by calling or emailing. There is no cancel button: the
   endpoint refuses (409 `CANCEL_BY_CONTACT`), because cancelling in the app
   told neither the office nor the worker and skipped the cancellation fee.
6. Edit the company profile.

Phone, email, rates and terms are not in the app. It reads them from
`GET /api/v1/client/mobile/info`, which serves the same config the website
renders from, with Admin > Site content applied.

## What is left in the code

- `apps/api/src/routes/mobileMarketplace.ts` still serves the marketplace
  staff and pricing endpoints alongside the booking list and detail the app
  uses. Nothing in the app calls the staff or pricing ones.
- `apps/api/src/routes/mobileClient.ts` still has the client job-management
  endpoints from the removed jobs flow.

## Still open for release one

- Apple Developer and Google Play accounts, and the EAS project id. Nothing
  installs on a real phone until these exist. This is the critical path.
- Push credentials, and the app-link association files in
  `apps/api/public/.well-known/`.
- Crash reporting is wired in (`src/utils/errorReporting.ts`) but sends
  nothing until `EXPO_PUBLIC_SENTRY_DSN` is set; it is blank in `eas.json`.
- The four-hour minimum applies to the client invoice (covered by
  `shiftLifecycle.test.ts`). Whether it also applies to worker pay is still
  open; the app shows the recorded hours and does not round.
- Cancelling in the app, if wanted later, has to notify the office and the
  worker and apply the fee.

Verified 28 September 2026: mobile typecheck, lint (no errors) and 128 unit
tests pass; the API's 181 unit and 28 integration tests pass, including a
worker taking a shift from offer to recorded hours and the client quote,
booking, cancel and info routes. One app quote was sent for real and both
emails were accepted by Resend. Both journeys were then clicked through in the
real app (a browser build, driven headless) against a local API: worker sign-in
to check-out, client sign-in to request, booking with hours, and profile. Not
yet run on a real phone.
