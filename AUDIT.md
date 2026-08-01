# AUDIT — public site conformance

Reference files: `vergo-site-config.js`, `hire.html`, `work/apply.html` + `pages/js/work-apply.js`.
Scope: `apps/api/public/**`. Read-only audit — no source files were changed.

## 1. The pattern

**Folder structure.** Flat top-level pages (`index`, `hire`, `work`, `terms`, `privacy`, `legal`);
form pages nested one level under their path (`hire/quote.html`, `work/apply.html`). Page scripts
live in `pages/js/<page>.js`, named for the route (`quote.js`, `work-apply.js`). One stylesheet at
the root, `vergo-site.css`. No build step; nothing is bundled or minified.

**Data flow.** `vergo-site-config.js` is the single source of truth for rates, contact details,
company registration and form endpoints. It sets `window.VERGO_CONFIG`, then `applyVergoConfig()`
walks the DOM on `DOMContentLoaded` and fills three attributes: `data-vergo="a.b.c"` (textContent),
`data-vergo-tel` (builds `tel:`), `data-vergo-mailto` (builds `mailto:`). Markup carries a hardcoded
fallback as its literal child so the page is correct with JS off. No figure, phone number or company
detail is written into markup without a `data-vergo` binding over it.

**Naming.** Semantic BEM-ish class names, no utility classes: `site-header`, `shell` / `shell-form`,
`section` / `section-tight` / `section-band`, `form-field`, `form-row form-row-2`, `checkbox-item`,
`btn btn-primary`, `form-status`. `.tbc` marks unconfirmed legal placeholders. IDs are camelCase and
used only as JS handles (`quoteForm`, `applySubmit`, `estimateTotal`).

**Page shell.** Every page: `skip-link` → `header.site-header` (brand, cross-audience switch link,
`call-link`) → `main#main-content` → `footer.site-footer` with the five nav links and the Companies
Act registration block. Content pages get canonical + OpenGraph and are indexable; form and legal
pages get `<meta name="robots" content="noindex">` and no canonical.

**Imports/exports.** No modules, no imports. Every script is a bare IIFE with `'use strict'`,
attached via `<script src>` before `</body>`, config first and the page script second. Only
`applyVergoConfig` is exported (onto `window`). Scripts guard on their root element and return early
if absent. ES5 syntax throughout (`var`, `function`) — no transpiler.

**Error handling.** Forms are `novalidate` and validate in JS. A hidden `website` honeypot field is
checked first and submission is dropped silently. Status goes to a single `role="status"` box via a
local `showStatus(message, state)` setting `textContent` + `dataset.state`. `fetch` responses are
checked with `if (!response.ok) throw`, parsed with `.json().catch(() => ({}))`, and errors surface
as a user-facing sentence — never a raw exception. Submit buttons disable and relabel during flight
and are restored in `.finally()`. Success swaps the form for a `.form-success` panel.

**Constraints.** No analytics, no cookies, no tracking. No CSS/JS frameworks. Accessible: labelled
fields, `fieldset`/`legend`, `sr-only` labels, `aria-live` on the running estimate.

## 2. Classification

Homogeneous groups are collapsed to one row; the member files are named in the row.

### New-pattern files

| File | Verdict | Note |
|---|---|---|
| `vergo-site-config.js` | **FIX** | `forms.applicationsEndpoint` is declared but never read by any consumer; no key exists for the three CV-upload endpoints. |
| `vergo-site.css` | CONFORMS | Sole stylesheet for all 8 new pages. |
| `index.html` | CONFORMS | — |
| `hire.html` | **FIX** | Inline `style="margin:30px 0 34px;"` (L41) bypasses the stylesheet. |
| `work.html` | **FIX** | Six inline `style` attributes (L41, 46, 69, 71, 115, 117, 140). |
| `terms.html` | CONFORMS | — |
| `privacy.html` | CONFORMS | — |
| `legal.html` | CONFORMS | — |
| `hire/quote.html` | **FIX** | `<div class="header-actions">` where content pages use `<nav>`; inline `style` (L104); footer omits the phone link that `index`/`hire` carry. |
| `work/apply.html` | **FIX** | Same `<div>`-instead-of-`<nav>` and missing footer phone link. |
| `pages/js/quote.js` | CONFORMS | Reads its endpoint from `VERGO_CONFIG.forms.quoteEndpoint` with a literal fallback — this is the behaviour the spec describes. |
| `pages/js/work-apply.js` | **FIX** | Hardcodes `/api/v1/applications`, `/presign`, `/verify-upload`, `/direct-upload` instead of reading `VERGO_CONFIG.forms`. Diverges from `quote.js`. |

### Site-level config

| File | Verdict | Note |
|---|---|---|
| `sitemap.xml` | **FIX** | Lists only the old site. Missing `/hire`, `/work`, `/legal`; still advertises `/about`, `/hire-staff`, `/jobs`, `/pricing`, `/contact`, `/faq`, `/apply`, `/staff-roles`, `/post-job`, 10 SEO landing pages and `/blog*`. Also lists `/privacy` and `/terms`, which are now `noindex` — contradictory signals. |
| `robots.txt` | **FIX** | Written against the old structure; no entries for `/hire/quote` or `/work/apply`. |
| `404.html` | **FIX** | Still on `vergo-public-pages.css` + `vergo-a11y.css` + `vergo-public-shell.js`. It is the one legacy-styled page a visitor to the new site can still land on. |

### REDUNDANT — legacy brochure site

All still live: the clean-URL middleware in `apps/api/src/index.ts:1088-1108` serves any `.html`
present in `public/`, so none of these are unreachable — they are unlinked, not removed.

| File(s) | Superseded by | Imported by |
|---|---|---|
| `hire-staff.html` | `hire.html` | nothing (unlinked from new site) |
| `apply.html`, `pages/js/apply.js` | `work/apply.html` + `pages/js/work-apply.js` | nothing |
| `pricing.html`, `pages/js/pricing.js` | rates section of `hire.html` | nothing |
| `contact.html`, `pages/js/contact.js` | `hire/quote.html` | nothing |
| `about.html`, `faq.html`, `pages/js/faq.js`, `staff-roles.html`, `browse-staff.html` | `hire.html` / `work.html` | nothing |
| `blog.html`, `pages/js/blog.js`, `blog/*.html` (3 files), `vergo-blog.css` | nothing — content dropped from the 8-page structure | `vergo-blog.css` ← the 3 blog posts |
| 10 SEO landing pages (`event-chefs-london`, `temporary-bar-staff-london`, `front-of-house-staff-london`, `kitchen-porters-london`, `waiting-staff-london`, `event-staffing-agency-london`, `hospitality-staffing-agency-london`, `corporate-event-staff-london`, `wedding-staff-london`, `festival-staff-london`), `pages/css/service-landing.css` | nothing — no equivalent in the new structure | each other only |
| `vergo-styles.css` | `vergo-site.css` | 18 files (blog ×3, 10 landing pages, `dashboard-client`, `dashboard-worker`, `profile`, `pages/css/dashboard-shared.css`, `vergo-blog.css`) |
| `vergo-public-pages.css` | `vergo-site.css` | 39 files |
| `vergo-a11y.css` | `vergo-site.css` | 37 files |
| `vergo-public-legacy.css` | `vergo-site.css` | 14 files (blog ×3, 10 landing pages, `profile.html`) |
| `vergo-public-shell.js` | the inline header/footer markup in each new page | 39 files (incl. `vergo-whatsapp.js`) |
| `vergo-whatsapp.js` | nothing — no WhatsApp widget in the new site | `vergo-public-shell.js` only |
| `vergo-utils.js` | inlined into the two page scripts | 10 files |
| **`vergo-home.css`** | `vergo-site.css` | **nothing — zero importers, already dead** |
| **`vergo-analytics.js`** | nothing — the build brief bans analytics and cookies outright | **27 files** |

### UNCLEAR

| File(s) | Question |
|---|---|
| Worker/client portal: `login`, `user-login`, `user-register`, `client-login`, `client-register`, `portal-login`, `forgot-password`, `reset-password`, `onboarding`, `profile`, `dashboard-worker`, `dashboard-client`, `jobs`, `job-detail` + their `pages/js/*` and `pages/css/{public-auth,profile,dashboard-shared,onboarding}.css`, `auth.js` | Is the self-serve portal being retired, or just delinked? Nothing in the new 8-page site links to any of it, but it is backed by live API routes the mobile app also uses, so it cannot be classified from the front end alone. `/jobs` and `/jobs/:id` are additionally server-rendered in `index.ts:441-789`, independent of `jobs.html`. |
| `terms.html`, `privacy.html`, `legal.html` | Is `noindex` deliberate because they are drafts pending solicitor review, or an oversight? It determines whether the `sitemap.xml` fix adds them or drops them. |
| `apps/api/SITE-CHANGES.md` | Deleted in the working tree but not committed. Intentional? |
| Admin panel: `admin*.html` (9), `js/admin-core.js`, `js/admin-nav.js`, `pages/js/admin-*.js` (9), `pages/css/admin-shared.css`, `pages/css/admin-analytics.css` | Out of scope, not defective. A separate subsystem with its own documented conventions (`CLAUDE.md` → Admin Panel); the brochure-site spec does not apply. Listed so the count is complete. |

## 3. FIX order

Shared config and data layer before consumers:

1. **`vergo-site-config.js`** — add the CV-upload endpoints to `forms`, so the config genuinely
   covers every endpoint the site calls. Everything below depends on this shape.
2. **`pages/js/work-apply.js`** — read all four endpoints from `VERGO_CONFIG.forms`, matching
   `quote.js`. Depends on 1.
3. **`vergo-site.css`** — add the spacing utilities the inline `style` attributes are standing in
   for. Depends on nothing; blocks 4.
4. **`work.html`, `hire.html`, `hire/quote.html`** — strip inline `style` attributes. Depends on 3.
5. **`hire/quote.html`, `work/apply.html`** — `<nav class="header-actions">`, add the footer phone
   link. Independent of the above.
6. **`sitemap.xml`** — rewrite for the 8-page structure. Blocked on the `noindex` question above.
7. **`robots.txt`** — align with the new structure. Do with 6.
8. **`404.html`** — port to `vergo-site.css` and the new shell. Must land before any legacy CSS is
   deleted, or the 404 page breaks.

Redundant-file deletion comes after 8. `vergo-home.css` and `vergo-analytics.js` are the safe
starting point: the first has no importers at all, and the second is prohibited by the brief.
