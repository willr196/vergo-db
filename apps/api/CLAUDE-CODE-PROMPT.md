# Claude Code prompt — VERGO admin panel rebuild

Paste everything below the line into Claude Code from the repo root
(`C:\Users\willr\Documents\VERGO\vergo-db`).

---

We're rebuilding the VERGO admin panel. Read this whole brief before touching
anything, then work through the phases in order, stopping at each checkpoint.

## Context

VERGO is a small event staffing agency. One person runs it. The current admin
page (`apps/api/public/admin-jobs.html`) is organised around entities — a table
of job posts, a table of applications. That's the wrong shape. The actual work
is organised around **bookings**, and the panel should be too.

Stack: TypeScript / Fastify / Prisma / Neon Postgres on Fly.io. The frontend is
plain static HTML with vanilla JS and plain CSS under `apps/api/public/`. **Do
not introduce React, a build step, or a component framework.** The problem here
was never rendering.

## Ground rules

- Verify against the repo before acting on anything I've said about it. If a
  path or a model name here doesn't match what's actually there, tell me — do
  not silently adapt and carry on.
- Don't invent rates, thresholds or tax figures. Where a number matters and you
  aren't certain, put it in config with a comment saying it needs verifying.
- Small commits, one per phase, with a message that says what changed and why.
- Stop at each **CHECKPOINT** and show me what you've got before continuing.

## Phase 0 — clean the tree first

There were around 19 modified files sitting uncommitted in the working tree,
never committed or deployed. That's why local and live disagreed on the
published rate.

1. `git status` and `git diff --stat`.
2. Summarise what's uncommitted, grouped by what it appears to be doing.
3. **CHECKPOINT.** Tell me what's there and recommend keep / stash / discard
   for each group. Don't decide for me. Wait for my call, then commit and
   deploy before starting phase 1.

## Phase 1 — the booking model

Add to `apps/api/prisma/schema.prisma`, then run
`npx prisma migrate dev --name booking-model`.

**Booking** is the atomic unit. Invoice lines, payroll lines and margin all
derive from it. Job posts and applications become inputs to a booking, not
top-level things to manage.

Models to add:

- `Client` — name (unique), contact name, email, phone,
  `defaultChargeRatePence Int?`, `invoiceTermsDays Int @default(14)`, notes.
- `Staff` — name, phone, email, `payRatePence Int`, `payrollRef String?`,
  `active Boolean @default(true)`, plus two on-cost gates:
  `niLiable Boolean @default(false)` and
  `pensionEnrolled Boolean @default(false)`. Both default false — see phase 2
  for why this matters.
- `Booking` — `reference String @unique` (format `VG-2026-0001`), client
  relation, `role String`, `date DateTime`, `startTime String`,
  `endTime String`, `breakMins Int @default(0)`, `headcount Int @default(1)`,
  `chargeRatePence Int`, `engagement EngagementType`, `status BookingStatus`,
  lifecycle stamps (`confirmedAt`, `invoicedAt`, `clientPaidAt`,
  `staffPaidAt`), `staffPayDueAt DateTime?`, `invoiceRef String?`, notes,
  optional template relation.
- `ShiftAssignment` — booking relation (cascade delete), staff relation,
  `payRatePence Int`, `actualHours Float?`, `confirmedAt DateTime?`,
  `noShow Boolean @default(false)`. Unique on `[bookingId, staffId]`.
- `BookingTemplate` — name, client, role, `weekdays Int[]` (1 = Mon),
  start/end times, breakMins, headcount, chargeRatePence, engagement, active.

Enums:

```prisma
enum BookingStatus {
  ENQUIRY QUOTED CONFIRMED STAFFED WORKED INVOICED CLIENT_PAID STAFF_PAID CANCELLED
}
enum EngagementType { PAYE SELF_EMPLOYED }
```

Four rules that are easy to get wrong:

1. **All money is `Int` in whole pence.** Never Float, never Decimal-as-string.
   Divide by 100 only at the render layer.
2. **Rates are snapshot, not referenced.** The booking stores its own
   `chargeRatePence`; each assignment stores its own `payRatePence` at the
   moment it's created. Changing the headline rate later must not move historic
   bookings.
3. **Times are wall-clock strings**, not instants. A shift is "7am to 5pm", not
   a UTC timestamp — storing them as instants makes BST transitions silently
   wrong.
4. **`actualHours` stays null until worked.** That null is the signal that puts
   a booking in the "log hours" queue. Don't default it to the scheduled
   figure — you'd lose the signal and start invoicing estimates.

Index `[status, date]` and `[clientId, date]`.

**CHECKPOINT.** Show me the schema diff and the generated migration.

## Phase 2 — the money library

Create `apps/api/src/lib/money.ts`. Pure functions, no database access, so it's
trivially unit-testable and can't give two different answers in two places.

Exports:

- `parseClock(value: string): number` — `"07:00"` → 420. Throws on anything
  that isn't `HH:MM`.
- `shiftHours(startTime, endTime, breakMins): number` — paid hours for one
  head. **Must handle shifts crossing midnight** (if end <= start, add 24h) —
  the kitchen work does this. Throw if the break is longer than the shift.
- `bookingMoney(booking, assignments): BookingMoney` — returns
  `scheduledHours`, `revenuePence`, `wagePence`, `onCostsPence`,
  `onCostBreakdown { holidayPence, employerNiPence, pensionPence }`,
  `grossMarginPence`, `netMarginPence`, `netMarginRate`, `provisional`.
- `floatPosition(rows, now?): FloatPosition` — returns `heldPence`,
  `committedPence`, `freePence`, `unwindsFrom`, `daysToUnwind`.

### Revenue

Bill by `headcount`, not by how many people you managed to assign. If a
confirmed booking is under-staffed that's a service failure, not a discount.

### On-costs — read this carefully, it's the part that's easy to get wrong

On-costs are computed **per assigned person**, not as a flat percentage of the
booking's total wage.

- **Holiday accrual at 12.07%** applies to every PAYE shift, always. This
  figure is exact.
- **Employer NI and employer pension do NOT apply flat.** Both only bite once a
  person's earnings cross a threshold in the pay period. Casual staff doing one
  six-hour shift a month are nowhere near either. So gate them on the
  `niLiable` and `pensionEnrolled` flags on that person's `Staff` record.
- NI and pension, where they apply, are charged on wage **plus** holiday pay.
- `SELF_EMPLOYED` bookings carry no on-costs at all.

This is not a rounding detail. Applying NI and pension flat turns genuinely
profitable bookings into phantom losses:

| Booking | Flat on-costs | Threshold-aware |
| --- | --- | --- |
| 6h @ £19 charge / £15.50 pay, casual | −£8.99 | **+£9.77** |
| 10h @ £19 charge / £13.50 pay, casual | +£16.71 | **+£38.71** |

Set `provisional: true` where any assignment still has `actualHours === null`,
so the UI can mark those figures as estimates.

### The float

I invoice clients upfront and pay staff roughly a fortnight later, so my bank
balance overstates my position. `floatPosition` takes bookings where
`clientPaidAt` is set and `staffPaidAt` is null, and returns: money held,
what it's committed to (wage + on-costs), what's genuinely mine, and the
earliest `staffPayDueAt` so I know when it starts leaving.

**Write unit tests** covering: a 10-hour day, an overnight shift with a break,
break-longer-than-shift throwing, `SELF_EMPLOYED` producing zero on-costs, a
casual assignment producing holiday-only on-costs, and a flagged assignment
producing all three.

**CHECKPOINT.** Run the tests and show me the output.

## Phase 3 — kill the pricing sprawl

Rates currently live in four places, which is the actual root cause of the
local/live drift:

- `apps/api/src/config/pricing.ts`
- `apps/api/src/__tests__/pricing.test.ts`
- `apps/api/public/pages/js/rates.js`
- `apps/api/public/pages/js/quote.js`

Make `config/pricing.ts` the single source of truth. It holds
`headlineChargeRatePence` (currently 1900), `defaultStaffRatePence` (1350),
quote rounding, minimum shift hours, and the on-cost rates with a comment
saying to verify them against HMRC each tax year.

Then:

- Add `GET /api/pricing` returning the public shape (rate in pence, formatted
  rate, minimum shift hours).
- **`rates.js`** — delete the hardcoded rate, fetch `/api/pricing` on load,
  write the formatted rate into the DOM. Render a skeleton while it loads, not
  a stale number.
- **`quote.js`** — same. The calculator must not carry its own copy of the
  rate.
- **`pricing.test.ts`** — rewrite to assert *behaviour* (rounding, minimum
  shift length, rate precedence: explicit > client default > headline), not
  that the rate equals a literal. A test that hardcodes 1900 has to be edited
  every time the price changes, which means it isn't testing anything.
- **Add a guard test** that fails if a four-digit pence literal appears in
  either public JS file. That's what stops this coming back.

**CHECKPOINT.** Show me `/api/pricing` responding and both public pages
rendering the rate from it.

## Phase 4 — the routes

Create `apps/api/src/routes/bookings.ts` and register it. Use the existing
admin auth preHandler and the existing shared Prisma client — don't construct a
second one.

- `GET /api/admin/dashboard` — **the whole page loads from this one call.**
  Returns `queue`, `bookings` (each decorated with its derived money),
  `float`, and `pricing`.
- `POST /api/admin/bookings` — rate precedence: explicit > client default >
  headline. Validate the times via `shiftHours` before writing, so a bad shift
  never reaches the ledger. Generate the `VG-YYYY-NNNN` reference.
- `PATCH /api/admin/bookings/:id/status` — enforce a transition map:

  ```
  ENQUIRY     → QUOTED, CONFIRMED, CANCELLED
  QUOTED      → CONFIRMED, CANCELLED
  CONFIRMED   → STAFFED, CANCELLED
  STAFFED     → WORKED, CONFIRMED, CANCELLED
  WORKED      → INVOICED
  INVOICED    → CLIENT_PAID
  CLIENT_PAID → STAFF_PAID
  ```

  Reject anything else with 409 and a plain-English message naming what's
  allowed. Stamp the matching timestamp on transition. On `INVOICED`, set
  `staffPayDueAt` to +14 days — that's what starts the float clock.
- `POST /api/admin/bookings/:id/assignments` — snapshot the staff member's
  current pay rate onto the assignment. If the booking is `CONFIRMED`, fully
  staffed, and everyone's confirmed, advance it to `STAFFED` automatically.
- `PATCH /api/admin/assignments/:id` — set `actualHours`, `confirmed`, or
  `noShow`. Return the whole re-decorated booking so the client can re-render
  without a second round trip.
- `POST /api/admin/templates/:id/generate` — body `{ weekStarting }`, creates
  the week's bookings from a template at status `CONFIRMED`. **Must be
  idempotent** — re-running it cannot double-book a day. This is the button
  that stops me re-keying ~110 hours a week by hand.

The queue is built server-side and ordered by what breaks first if ignored:
needs staff → staff not confirmed → log hours → send invoice → chase payment →
run payroll. Omit empty sections.

**CHECKPOINT.** curl `/api/admin/dashboard` and show me the JSON.

## Phase 5 — the page

Replace `admin-jobs.html` with `admin.html`, plus `pages/css/admin.css` and
`pages/js/admin.js`. One page. No sidebar, no tabs, no separate screens.

Structure, top to bottom:

1. **Masthead** — today's date, the live headline rate.
2. **Float band.** The signature element and the most valuable thing on the
   page: money held, what's committed to staff, what's actually mine, as a
   proportional bar, with a line saying when it starts leaving. Nothing
   off-the-shelf computes this for me.
3. **"Needs you"** — the action queue, grouped, each row showing client, role,
   date, times, `n/m staffed`, the booking reference, its net margin, and the
   one or two buttons that move it forward. Empty state: "Nothing needs you."
4. **Bookings ledger** — filterable table (Open / This week / Money owed /
   All): ref, client, role, date, hours, charged, wage + costs, net, status
   pill. Mark provisional figures visibly. Flag net margin under 10%.

Implementation notes:

- One `api()` fetch wrapper handling CSRF, 401 → redirect to login, and error
  extraction. Every call goes through it. One toast function for errors.
- Tabular numerals for every money figure. Format via `Intl.NumberFormat`
  `en-GB` / GBP.
- Chase-staff button opens a prefilled `wa.me` link with the shift details, so
  I'm not retyping the same message every week. There's already a
  `vergo-whatsapp.js` in the repo — check whether it's worth reusing.
- **Fall back to sample data if the API isn't reachable**, behind a visible
  banner saying so. That way the page can be reviewed before it's wired.
- Quality floor: responsive down to mobile (the ledger table collapses to
  stacked rows with `data-label` headers), visible keyboard focus,
  `prefers-reduced-motion` respected, `noindex` meta.

Style it in the existing dark/gold theme. Keep it dense and quiet — this is a
tool I look at daily, not a landing page.

**CHECKPOINT.** Show me the page against real data.

## Phase 6 — backfill and cut over

1. Seed `Client` rows, `Staff` rows with correct individual pay rates, and a
   `BookingTemplate` for the recurring weekly work.
2. Set `engagement: SELF_EMPLOYED` on the one client engagement that runs that
   way. It's an acknowledged one-off — it must never set a default or get
   averaged into margin reporting.
3. Only once the new page is working against real data: delete
   `admin-jobs.html` and any routes only it used.
4. Deploy. Verify against `vergo-app.fly.dev` rather than the custom domain —
   the domain sits behind CDN caching and will lie to you.

## Deliberately out of scope

Don't build these unless I ask:

- An assign-staff picker UI. Leave `openAssign()` as a stub; the endpoint
  behind it is done. The right UI depends on whether I'm choosing from three
  people or thirty.
- Invoice PDF generation. `INVOICED` is a status flip for now.
- Pagination, search, bulk select, role-based permissions, an audit log. No
  volume justifies any of it yet. Add them when a page of bookings stops
  fitting on one screen.

## Finally

When you're done, tell me: what you built, anything in the repo that
contradicted this brief, and the two or three things you'd fix next.
