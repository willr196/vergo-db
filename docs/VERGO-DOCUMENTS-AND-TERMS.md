# VERGO Ops: Documents & Terms — build report

Worker contract and client Terms of Business workflows, built into VERGO Ops
(4–5 October 2026). Nothing is committed, pushed or deployed, and no production
database was touched.

## Results

- Type check: clean.
- Production build: passes.
- Unit tests: 246/246 pass.
- Integration tests: 41/41 pass, 13 of them new.
- One existing site-content test failed once during the run with a recorded
  duration of 2.3 hours, which looks like the machine slept. It passed when run
  again on its own and in a second full run.
- The whole flow was clicked through in headless Chrome: desktop for the admin
  screens, phone width for the worker and client pages. No JavaScript errors
  came up and no emails were sent.

## 1. Files changed

**New**

- `src/ops/documentService.ts`: the rules for issuing, acknowledging,
  accepting and linking documents.
- `src/ops/legalTemplates.ts`: the KID, employment agreement, Assignment
  Confirmation and client Terms wording.
- `src/routes/ops/documents.ts`: the admin API.
- `src/routes/documentLinks.ts`: the pages workers and clients open from their
  links.
- `public/js/document-links.js`
- `prisma/migrations/20261005120000_ops_documents_and_terms/` (see 2)
- `src/__tests__/opsDocuments.test.ts`
- `src/__integration__/opsDocuments.test.ts`

**Changed**

- `prisma/schema.prisma`
- `src/ops/`: `compliance.ts`, `documents.ts`, `settings.ts`, `service.ts`,
  `assignments.ts`
- `src/routes/ops/`: `workers.ts`, `bookings.ts`, `admin.ts`, `print.ts`,
  `index.ts`
- `src/routes/adminClients.ts`, `src/index.ts`
- The email template, sender and types
- `public/admin-ops.html`, `public/pages/js/admin-ops.js`,
  `public/pages/css/admin-ops.css`, `public/robots.txt`
- `src/__tests__/ops.test.ts`
- `docs/VERGO-OPS.md`

**Not touched:** the public website and the mobile app, so no mobile type
check was needed.

## 2. Migration

`20261005120000_ops_documents_and_terms` only adds things:

- a new document type for the client Terms
- two new tables:
  - `ClientDocument`: each client's issued Terms and their acceptance
  - `DocumentLink`: the secure links
- template fields for effective date, material change and frozen values
- fields recording KID acknowledgement and how a document was accepted
- booking charge fields: overtime, other charges, advance payment and payment
  days

It has been applied to the **local dev DB** (by accident, through
`DIRECT_DATABASE_URL`) and to the local test DB. A check against the schema
found no differences.

## 3. Routes added

**Admin API**, under `/api/v1/ops`:

- `GET /documents-terms`
- `GET /commercial-terms` and `POST /commercial-terms/review`
- `POST /workers/:id/documents/pack`
- `POST /workers/:id/document-link`
- `POST /workers/:id/document-links/revoke`
- `GET /clients/:id/terms`
- `POST /clients/:id/terms/issue`
- `POST /clients/:id/terms-link`
- `POST /clients/:id/terms-links/revoke`
- `POST /client-terms/:id/accept` and `POST /client-terms/:id/withdraw`

**Admin print pages**

- `/ops/print/client-terms/:id`
- `/ops/print/booking/:id`: a client Booking Confirmation showing that
  booking's charges.

**Public link pages**

- `/d/:token`
- `/d/:token/doc/:docId`

**Public link API**

- `GET /api/v1/document-links/:token`
- `POST /api/v1/document-links/:token/kid/:id/acknowledge`
- `POST /api/v1/document-links/:token/agreement/:id/accept`
- `POST /api/v1/document-links/:token/terms/:id/accept`

## 4. Worker onboarding flow

1. The worker is created, then their right to work is recorded.
2. On the worker's page or the Worker documents tab, **Issue current pack**
   issues the KID, then the agreement, and gives you a link to copy or email.
   The agreement can't be issued until the worker has a KID.
3. On their phone, the worker reads the KID (or opens, prints or saves it as a
   PDF) and ticks that they've received it. The agreement stays locked until
   they do.
4. They read the agreement, tick "I confirm I have read and agree to the VERGO
   Zero-Hours Employment Agreement.", type their full name and submit.
5. Once payroll is active, they become Ready for Work.

Existing workers show what's missing; nothing is backdated. If a worker agrees
outside the link, an admin can record how and when, but never before the KID
was issued.

## 5. Client acceptance flow

1. The owner confirms the commercial terms (transfer fee, extended hire,
   payment and cancellation) in Settings. Until then Terms can't be issued and
   admin shows "Commercial term — owner review required".
2. On the client's page, **Issue current Terms** gives you a link.
3. The client enters the legal business name, their name and an optional job
   title. They tick "I confirm that I am authorised to accept these Terms of
   Business on behalf of the hirer and agree to the VERGO Staffing Terms of
   Business for Temporary Staff Supply." and type their name.
4. Private consumers are refused the business Terms everywhere and show
   "Consumer booking terms required".
5. Bookings show "Client Terms not accepted" until the Terms are accepted.
   Drafts and quotes still go ahead, but assigning staff needs a written
   reason, which is logged.

## 6. Authentication on each flow

**Admin API and print pages**

- The admin session plus the existing CSRF protection.
- A worker's login doesn't get in.

**Links**

- Each one is 32 random bytes; only a hash is stored.
- Each link lasts 30 days and can be revoked.
- Each link is tied to one worker or one client. Changing a document ID in the
  URL just gives "not found".
- The pages aren't cached or indexed, and requests are rate-limited.

**Signed-in workers:** if a worker accepts while logged in to the site as
themselves, that is recorded too.

## 7. Document versions created

The first time Ops loads templates, it creates new system versions of:

- the Key Information Document
- the Zero-Hours Employment Agreement
- the Assignment Confirmation (updated)
- the client Terms of Business
- the onboarding checklist

These only replace earlier system placeholders, never anything an admin wrote.

- Changing the KID pay example or the commercial terms in Settings creates a
  new version automatically.
- A version marked as a **material change** stops older agreements counting
  until the new version is agreed. Otherwise older agreements stay in force.

## 8. Decisions needed

- **Material change default:** new versions are *not* material changes unless
  the box is ticked, so workers aren't blocked by default. Keep this?
- **Pay frequency:** the Settings pay frequency is still "weekly", but the
  documents say monthly. The dashboard now flags this.
- **Holiday year:** set as 1 January to 31 December in the agreement.
- **Transfer terms:** confirm the transfer fee of 15% of the first 12 months'
  pay and the 8-week extended hire.
- **Liability cap:** set at the charges for the booking concerned.

## 9. Needs legal review

All four documents are drafts, not reviewed by a solicitor. In particular:

- the wording the regulations require at the top of the KID
- the transfer fee and relevant-period clause
- the rolled-up holiday pay wording
- the notice periods
- the liability clauses
- the AWR clause

## 10. Environment variables

None new. Links use `WEB_ORIGIN`, and emails go through the existing Resend
setup.

## 11. Test and build results

See **Results** at the top.

- The API has no lint or formatter set up, so neither was run.
- `validate:pages` fails on two admin pages (`admin-requests.html`,
  `admin-site-content.html`), exactly as it does without these changes.

## 12. Testing it locally

1. In `apps/api`, start the server with email disabled:

   ```powershell
   $env:RESEND_API_KEY=""; $env:PORT="4310"; $env:WEB_ORIGIN="http://127.0.0.1:4310"; npm run dev
   ```

2. Log in and open `/ops`, then **Documents & Terms**.
3. Add a worker, record a right-to-work check, and set payroll to Active plus
   an emergency contact.
4. Click **Issue current pack**, copy the link and open it at phone width.
   Acknowledge the KID, then agree the agreement.
5. Go to Settings and review the commercial terms. Then add a business client,
   issue the Terms, and accept them through the link.
6. Create a booking for a client without accepted Terms and try to assign
   someone; it should ask for a reason.
7. To run the tests: `npm test`, then `npm run test:integration` with the
   Docker `db-test` database.

## Leftovers

- The temporary local admin used for the browser check has been deleted.
- The test worker "Testy Clickthrough-…" and client "Clickthrough Events … Ltd"
  are still in the local dev DB.
