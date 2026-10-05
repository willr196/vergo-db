# VERGO Ops

The internal operations console: workers and their compliance, clients and
hirers, bookings, assignments, timesheets, booking profit, and the tracking
aids for AWR, pensions, direct hire and historic payroll.

It is part of the main API (`apps/api`), not a separate app. The older local
tool in `Documents/vergo_admin` (also called "VERGO Ops") is separate and its
data has not been imported.

## Access and authentication

- Open **`/ops`** (also in the admin sidebar under Operations). Same login as
  the admin panel: `/login`, admin accounts from `AdminUser`.
- Session-based (`vergo.sid`), 30-minute idle and 8-hour absolute timeout, CSRF
  token on every write. Page: `adminPageAuth`. API: `adminAuth` on everything
  under `/api/v1/ops`. A mobile JWT does not open any of it.
- Every admin account can see everything in Ops, including compliance, money
  and payroll history. There are no roles below "admin" yet, so only give admin
  accounts to people who should see all of that.
- `/ops` is `noindex`, disallowed in `robots.txt`, and `admin-ops.html` redirects
  to `/ops` rather than being served statically.

## Where it lives

| | |
|---|---|
| Page | `public/admin-ops.html`, `public/pages/js/admin-ops.js`, `public/pages/css/admin-ops.css` |
| API | `src/routes/ops/` (`workers.ts`, `bookings.ts`, `admin.ts`, `print.ts`) |
| Rules (pure, tested) | `src/ops/` (`compliance.ts`, `assignments.ts`, `profit.ts`, `awr.ts`, `pension.ts`, `records.ts`, `documents.ts`, `time.ts`) |
| Loading and decoration | `src/ops/service.ts` |
| Tests | `src/__tests__/ops.test.ts` |

## Data model

Existing records are reused, not duplicated:

- **Worker** = an existing `User` (job seeker on the roster). Ops fields are in
  the new `WorkerProfile` (one per user). Date of birth and right-to-work
  history stay on the linked `Applicant`, which Ops creates or links (by email)
  if missing.
- **Assignment** = an existing `Booking` row (one worker, one shift), now with
  `opsBookingId`. So the worker app's check-in/out, the old admin Bookings
  screen and the float/pay-run figures all see the same shift.
- **Ops booking** = the event: new `OpsBooking`, with `OpsRequirement` (role,
  quantity, rates, H&S...) and `OpsBookingCost` (extra charges and costs).
- **Client** = the existing `Client`, with hirer fields added.

Migrations `20261003120000_add_vergo_ops` and
`20261005120000_ops_documents_and_terms` (ClientDocument, DocumentLink, template
effective date / material change / frozen values, acceptance evidence, booking
charges) are additive only. The first adds:

- New enums: `ClientType`, `WorkerActiveStatus`, `PayrollStatus`,
  `PensionStatus`, `HolidayPayMethod`, `OpsDocumentType`,
  `WorkerDocumentStatus`, `OpsBookingStatus`, `OpsCostKind`, `TransferFeeStatus`.
- New tables: `WorkerProfile`, `DocumentTemplate`, `WorkerDocument`,
  `OpsBooking`, `OpsRequirement`, `OpsBookingCost`, `HistoricPayment`,
  `DirectHireTracking`, `OpsSetting`, `AuditLog`.
- New nullable/defaulted columns: `Client` (trading name, billing address,
  venues, payment terms, client type, terms version/sent/accepted/by),
  `Booking` (Ops link, requirement, role, holiday pay method, break, replaced-by,
  override reason, timesheet client/admin approval and dispute),
  `RightToWorkCheck` (performed by, prescribed-check confirmation, follow-up due).
- Indexes on the common lookups. Foreign keys from compliance and accounting
  records are `Restrict`, so nothing is deleted by cascade.

Nothing is deleted on a schedule. See Exports > record classification.

## Ready for Work

A worker is READY only when all of these are true (`computeReadiness`):

1. Status active.
2. Right to work valid: a PASS check that is in date, no follow-up date passed,
   not blocked.
3. Key Information Document issued.
4. Zero-hours agreement agreed. A newer version does not undo an agreement unless
   it was saved as a material change; then the new version must be agreed.
5. Email, phone and an emergency contact (name and phone) recorded.
6. Payroll status ACTIVE.

If anything is missing, the worker page lists exactly what. An admin can
override with a written reason (10+ characters). It is audit-logged and shown
as "Ready (override)". An override never gets past a right-to-work block at
assignment time.

## Right to work

Worker page > Right to work > **Record a check**: method, date, who performed
it, result, valid until, follow-up date, evidence reference, notes. A PASS
needs the box confirming the prescribed check was actually carried out.
Holding or uploading a document is not treated as a check. Time-limited
permission needs a follow-up date. Share codes are refused as evidence
references. The **Right to work** screen groups workers by expired, ≤30 days,
≤60 days, follow-up due, no check, blocked, and "cleared without confirmation"
(checks recorded in the old screen before the confirmation existed).

## Documents & Terms

Ops > **Documents & Terms**: Overview, Worker documents (Documents Outstanding:
KID missing / Contract missing / Both missing / Current / Superseded-outdated),
Client terms, Document templates, Versions (who holds which version), and
Outstanding acceptances. Code: `src/ops/documentService.ts` (rules),
`src/ops/legalTemplates.ts` (wording), `src/routes/ops/documents.ts` (admin API),
`src/routes/documentLinks.ts` (worker and client pages).

### Versions

- Every type (KID, Zero-Hours Employment Agreement, Assignment Confirmation,
  Terms of Business) is versioned: version, effective date, status
  (current/superseded), created, superseded date. A change is always a new
  version; nothing issued or accepted is ever edited.
- Each issued copy keeps its exact text (`renderedBody`) and a SHA-256 of it.
  Acceptance stays on the version actually accepted.
- **Material change** (tick when saving a version): anyone on an earlier
  version must agree the new one before they count as current. Without it,
  earlier agreements stay in force and the person shows as "older version".
- The KID pay example and the client commercial terms are set in Settings and
  frozen into the version. Saving them makes a new version (Terms: always a
  material change).
- The wording created by "system" is a **draft for legal review**. It replaces
  only earlier system versions (the old placeholder layouts), never an admin's.

### Worker onboarding order

Worker created → right to work → **KID issued** → **agreement agreed** →
payroll active → Ready for Work.

1. Worker page (or Worker documents) > **Issue current pack**: issues the KID,
   then the agreement, skipping what the worker already has at the current
   version, and makes a secure link (copy it, or email it to the worker).
   The agreement cannot be issued without a live KID.
2. The worker opens the link on their phone: reads the KID (inline, or open /
   print / save as PDF), ticks that they have received it, then reads the
   agreement, ticks "I confirm I have read and agree to the VERGO Zero-Hours
   Employment Agreement.", types their full name and submits.
3. Recorded: worker, type, version, issued time, KID acknowledgement time,
   agreement time, typed name, the statement, link used, IP/user agent, and the
   worker's own login if they were signed in. Labelled electronic agreement,
   not a qualified electronic signature.
4. If the worker agreed some other way, **Record acceptance** (how and when;
   never before the KID was issued, never in the future).

Existing workers are not treated as having documents: they show what is
missing until a pack is issued and agreed, on the real dates.

### Client Terms of Business

- Business clients only. Private consumers cannot be issued them (Ops refuses,
  and their link page says consumer booking terms are required). Consumer
  terms are recorded on the client page as before.
- **Owner review first**: Settings > Commercial terms shows "Commercial term —
  owner review required" until the owner confirms the payment, cancellation,
  no-show, transfer fee (default 15% of 12 months' anticipated remuneration)
  and extended hire (default 8 weeks) values. Terms cannot be issued before
  that, and any change needs a fresh review.
- Client page > **Issue current Terms** makes a link. The client enters the
  legal business name, their name, job title (optional), ticks "I confirm that
  I am authorised to accept these Terms of Business on behalf of the hirer and
  agree to the VERGO Staffing Terms of Business for Temporary Staff Supply.",
  types their name and accepts. An acceptance received in writing can be
  recorded by an admin, with how and when.
- **Booking gate**: a business client without accepted current Terms shows
  "Client Terms not accepted" on the booking; a private consumer without
  recorded consumer terms shows "Consumer booking terms required". Drafts and
  quotes go ahead; assigning staff needs a written reason (audit-logged).
- Booking-specific charges (charge rate, minimum hours, overtime, after-midnight
  uplift, specialist/other charges, advance payment, payment days) are on the
  booking and requirement; **Booking confirmation** prints them for the client.

### Secure links

`/d/<token>`: 32 random bytes, only the SHA-256 stored, 30 days, revocable
(Revoke links). A link is bound to one worker or one client; document ids are
always looked up with that owner, so another id in the URL is a 404. No-store,
no-referrer, noindex, rate-limited. Emailing uses the existing Resend sender.

### Assignment confirmations

Booking > assignment > **Confirmation doc**: hirer, nature of business, date,
expected duration, position, duties, location, hours, breaks, pay rate,
expenses/travel, dress, requirements, H&S risks and controls, on-site and VERGO
contacts. Issue time recorded (`ASSIGNMENT_CONFIRMATION_ISSUED`); the worker
sees it through their link.

## Bookings and assignments

1. **Clients**: add the client (checks for an existing email first). Record
   terms sent/accepted. Private consumers are flagged and cannot be given the
   B2B Terms of Business; record separate consumer terms instead.
2. **Bookings > New booking**: client, date, times (London), venue, etc. It gets
   a reference like `VB-2026-0001`.
3. **Add requirement**: role, quantity, client charge rate, worker pay rate,
   minimum hours, after-midnight multiplier, travel, expenses, break, dress
   code, duties, H&S risks and controls...
4. **Assign worker**: checks run as you pick someone. A right-to-work problem
   **blocks** outright. Incomplete documents, inactive, unavailable, overlapping
   shifts, missing role or qualification are warnings: going ahead needs a
   written reason, which is kept on the assignment and audit-logged.
5. Offered → Accepted / Declined; Accepted → No-show / Cancelled; **Replace**
   swaps the worker and keeps the old row as "Replaced". Booking status moves
   between Confirmed / Staffing / Fully staffed automatically as slots fill.
6. **Confirmation doc** issues the assignment confirmation from the booking and
   requirement data.

Taken over from the desktop VERGO Ops tool (`Documents/vergo_admin`):

- **Calendar**: Bookings has a List / Calendar switch. The month view shows each
  booking as time, staff confirmed/needed and client; pick a day to list it and
  start a booking on it.
- **New booking** can carry its first role (staff needed, charge and pay rate)
  and more dates ("+ Add another date", or every day from/to). Each date is its
  own booking, copied from the first. **Copy to other days** on a booking does
  the same later. Copies never include staff and are not a repeating booking.
- **Usual rates**: a client's usual charge rate fills in on new bookings and
  roles; a worker's usual pay rate fills in when they are assigned.
- **Book onto a shift** on a worker's page lists upcoming places still to fill.
  It uses the same assignment checks as assigning from the booking.

## Importing from the desktop tool

The desktop tool stays in use for offline bookings. **Ops > Import** takes one
of its daily backups (`vergo_admin/backups/vergo-ops-*.sql`, written by
`backup.ps1`; run it first to include today's work): **Preview** shows what
would come in, then **Import** writes it. Only the backup's COPY data is read,
never run, and its login table is skipped.

Every imported row is recorded in `OpsLegacyImport`, so an import only adds
what is new: clients, staff, jobs, people put on jobs already imported (the
role's headcount rises to match), ongoing jobs as repeating bookings, leads and
running orders. A change to a job already imported is not copied; make it in
both. The same importer runs from the command line
(`npm run import:vergo-admin [-- --file <backup.sql>] [-- --commit]`); the code
is `src/ops/legacyImport.ts`.

Imported workers have no right-to-work check (the desktop tool never held one),
so they cannot be assigned to new shifts here until one is recorded.

## Timesheets → profit

- Hours come from the worker's check-in/out in the app (existing). In
  **Timesheets**: edit times or break (reason required, audit-logged), record
  client approval, dispute/resolve, then **Approve**.
- Approve completes the shift with its net hours (worked minus unpaid break).
  The minimum hours still apply to both charge and pay.
- Booking **Profit** reads those: revenue (billable hours × charge rate +
  after-midnight uplift + extra charges), wages, 12.07% holiday pay, employer NI
  and pension (only for workers flagged liable/enrolled, at the rates in
  `config/pricing.ts` ON_COSTS, marked NOT VERIFIED there), travel/expenses,
  other costs, gross contribution and margin. It is labelled **Estimate** until
  the actual wages/holiday/employer figures from payroll are entered on the
  booking, which then replace the estimate line by line.
- **Invoice** needs every assignment completed, and stamps the shifts too so
  the existing float/pay-run figures agree. Once invoiced, timesheets lock.

## Historic Payroll Reconstruction

**Payroll history**: one row per payment actually made (worker, date, hours,
base, holiday, gross actually transferred, notes, payroll corrected / FPS
submitted / HMRC reconciled). Add by hand or **Import CSV** (preview first;
rows with errors stop the import; the same name + date + amount is skipped as a
duplicate). Export as CSV for Basic PAYE Tools, payroll software or the
accountant. It does not create FPS files, tax codes or tax due.

## Tracking aids only

These help someone review; none of them decides anything:

- **AWR tracking aid — review required**: weeks with the same hirer and role,
  10-week warning, 12-week review, six-week break rule. It cannot see why a
  break happened.
- **Pension alerts**: from age, estimated recent pay and the thresholds in
  Settings (per tax year). Only once the duties start date is set. Never
  enrols, opts out or declares. OPTED_OUT can only be recorded with evidence of
  the worker's own opt-out.
- **Direct hire / transfer**: estimated relevant-period end and fee status.
- **Payroll and pension status fields** on workers.
- **Profit** figures (estimates unless actual payroll is entered).
- **Retention classification** (Exports): guidance only; nothing is deleted.

## Audit log

Every Ops write records admin, time, action, entity, before/after and reason:
RTW changes, document issue/accept/withdraw, template versions, Ready
overrides, booking status, assignment changes, rate changes, timesheet edits
and approvals, profit overrides, settings, exports. Timesheet corrections,
status changes and completions in the older admin Bookings screen are logged
too (best-effort there).

## Deploying to Fly.io safely

Nothing about deploying changes:

1. `cd apps/api && npm test` (unit tests) and `npm run build`.
2. Back up first (Neon branch or `pg_dump`) — the migration is additive, but
   take the backup anyway.
3. `fly deploy` from `apps/api`. The release command runs
   `npm run prisma:deploy`, which applies `20261003120000_add_vergo_ops` before
   the new machines start (bluegreen).
4. Check the digest/release actually changed (`fly releases`), log in, open
   `/ops`, and check the dashboard loads.
5. In Ops: **Settings** — set the pension duties start date and add/verify the
   2026-27 thresholds, check pay frequency, and have the owner review the
   commercial terms. **Documents & Terms** — replace the system draft wording
   with the legally reviewed wording as new versions before issuing.

No new environment variables are needed. Document links are built from
`WEB_ORIGIN` (already required in production) and emailed through Resend.
