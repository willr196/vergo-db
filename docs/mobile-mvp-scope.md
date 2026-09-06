# Mobile MVP scope

**Decision, 6 September 2026:** the first release of the VERGO app is
**worker-side only**. Clients keep booking through `vergoltd.com` and Will runs
bookings from the ops console.

## Why

MOBILE_APP_AUDIT.md flagged that the app carried two overlapping client product
models: the legacy jobs and applicants flow, and the newer quotes, marketplace
and bookings flow. Neither was finished and there was no single source of truth.

Shipping worker-only removes that problem rather than solving it. Clients
already have a working route in the website and the ops console, so the app has
nothing to add for them yet. It also halves the surface that has to be correct
for a first public release.

## What that means in the code

The client screens are **still in the repository**, under
`apps/mobile/src/screens/client/`, along with their tests and stores. They are
not deleted, because the client app is a later release rather than dead code.
They are simply not reachable:

| Piece | State |
| --- | --- |
| `src/screens/client/*` | Present, tested, **not in the navigator** |
| `ClientStack`, `ClientTabNavigator` | Defined, unreferenced |
| Client deep links (`client/...`) | Removed from the linking config |
| Client entry on the welcome screen | Replaced with a link to `/hire/quote` |
| A client account that signs in | Lands on `ClientOnWebScreen` |

`ClientOnWebScreen` exists because people already signed in from earlier builds
would otherwise land on nothing. It explains that bookings are handled on the
website, links to the quote form, and offers sign-out. It does not block the
login or touch the account.

## The worker journey that has to work

This is the whole product for release one:

1. Register, sign in, stay signed in.
2. Browse and search jobs, save a job, apply, track and withdraw applications.
3. Receive a shift, see the terms, confirm or decline it.
4. Check in on arrival, check out at the end, add a note.
5. See the hours that were recorded, and know the office confirms them.
6. Edit a profile.

Steps 3 to 5 are the part nothing else in the business does. Steps 1, 2 and 6
already worked before this scope decision.

## Bringing the client app back

Nothing needs rebuilding. To re-enable it:

1. Restore the client branch of the switch in
   `src/navigation/RootNavigator.tsx` (currently renders `ClientOnWebScreen`).
2. Restore the `client/...` entries in the `linking` config.
3. Restore the client entry point on `WelcomeScreen`.

Before doing any of that, resolve the two-product-models question the audit
raised. Re-enabling both flows as they stand would ship the same confusion.

## Still open for release one

- Apple Developer and Google Play accounts, and the EAS project id. Nothing
  installs on a real phone until these exist. This is the critical path.
- Push credentials, and the app-link association files in
  `apps/api/public/.well-known/`.
- No crash reporting in the app. The API has Sentry; the app has nothing.
- Whether the four-hour minimum applies to worker pay, the client invoice, or
  both. Until that is answered, `hoursWorked` and `hoursEstimated` are shown
  side by side and nothing rounds automatically.
