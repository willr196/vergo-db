# Dynamic site: Phase 0 audit and revised plan

Audited 2026-10-19 against `main` at `08927f0` and the live site.

## Headline: most of the brief is already built and live

The brief describes a static Fastify site. The code and the live site say otherwise:

| Brief assumes | Actually |
|---|---|
| Fastify, `@fastify/static` | Express 4 (`src/index.ts`), `express.static` |
| Static HTML pages | Every public page except `/login` is an Eta template in `views/pages/`, routed by `VIEW_ROUTES` in `src/site/view.ts`. Blog is rendered from `content/blog/*.md`. Live since the deploy of 2026-10-15 (`server: Fly/42494bfe9c`). |
| No source of truth for prices | `src/config/pricing.ts` is the single source; `SiteSetting` rows (Admin > Site content) are laid over it in memory (`src/site/settings.ts`). Pages get values via `it.t.*` / `it.blocks.*`; the browser gets `/vergo-site-config.js`, generated from the same values. |
| Nav/footer copied across pages | Shared partials in `views/partials/` (header, footer, rates, guarantees, CTA, FAQ, testimonials, trust strip, season feature...). |
| CDN in front of vergoltd.com | **No CDN.** DNS points straight at Fly (66.241.124.152); headers are `server: Fly`, `via: 1.1 fly.io`. Nothing to purge; `src/site/cdn.ts` is a no-op hook already called on every save. |
| Fly may cold-start | `min_machines_running = 1`, `auto_stop_machines = "off"`, bluegreen deploys. |
| Anonymous visitors may get sessions | `saveUninitialized: false`, sessions in Postgres via `connect-pg-simple`. Live public pages send no `Set-Cookie`. |
| Halloween £22/£30/£40 vs Christmas £21/£26/£35 | Already reconciled: both pages read `PRICING.specialEvents` and show £21 / £26 / £35 live. Standard rate is £19 everywhere; no £18.50 left in pages (only in two code comments in `pricing.ts`). |

So Phases 1 and 3, and most of 2, 6 and 7, are done. The rest of this file is what is left.

## 1. Routes

- Templates: `/`, `/terms`, `/privacy`, `/legal`, `/about`, `/work`, `/work/apply`, `/hire`, `/hire/quote`, `/hire/{waiting-staff,bar-staff,kitchen-porters,weddings,production-catering,corporate-events,cleaners,security}`, `/birmingham`, `/book-an-event`, `/special-events`, `/special-events/christmas`, `/special-events/halloween`, 404.
- Blog: `/blog`, `/blog/<slug>`.
- Static: `/login`, admin pages (session-guarded in `src/index.ts`), `/scheduling/`, `/ops`.
- `.html` URLs: `/<page>.html` 301s to the clean URL (checked live: `/terms.html` → 301 `/terms`); `/index` 301s to `/`.

## 2. Hard-coded values

Clean. `site-consistency.test.ts` (33 tests) and `npm run validate:pages` fail any page carrying its own price or promise. Stragglers found:

- `public/vergo-public-shell.js:199,229`: phone `07944 505783` as a fallback, and a hard-coded WhatsApp message. Only `login.html` still loads this script.
- `src/config/pricing.ts`: comments still say "£18.50" in two examples (`formatRate`, `headlineRateText`). Comment only.
- `views/pages/special-events/halloween.eta:643`: "Now booking 23–24 and 30–31 October." Dates typed into the template; goes stale on 1 November.
- `minimumChargeHours`, `overrunBlockMinutes`, `newYearsEveFromHour`, `cancellation`, `paymentTerms`, company number and registered office are code constants, **not** editable in the admin.

No conflicting values to resolve.

## 3. Duplication

Gone for public pages (partials). `login.html` still uses the old JS shell (`vergo-public-shell.js`) for header/footer.

## 4. Pricing code

- `pricing.ts` `quoteShift()` is the calculator; `public/pages/js/quote-calc.js` is its browser copy. `pricing.test.ts` runs both over the same cases.
- `quote.js` (form) reads rates from `window.VERGO_CONFIG` (generated). `rates.js` no longer exists.
- `GET /api/v1/rates` is the public rate card (excludes `accountRate`).
- Money: `PRICING` holds pounds as floats (19.00), and `quoteShift` rounds with `round2`. **This breaks the brief's "integer pence" rule.** The DB `SiteSetting.rates` value also stores pounds.

## 5. Caching

- Public HTML: `public, max-age=0, s-maxage=60, stale-while-revalidate=30`.
- Versioned assets (`?v=hash`): `max-age=31536000, immutable`; unversioned: `no-cache`. `/images` and `/vergo-*` are served by Fly's `[[statics]]`.
- No CDN, no purge API. If one is added later, wire it in `src/site/cdn.ts`.

## 6. Fly

`fly.toml`: app `vergo-app`, `lhr`, `auto_start_machines = true`, `auto_stop_machines = "off"`, `min_machines_running = 1`, health check `/health`, release command runs migrations, `strategy = "bluegreen"`. Machine size isn't in `fly.toml` (not checked: `fly` CLI has been blocked by App Control before).

## 7. Sessions and database use per page view

- No session for anonymous visitors.
- Page renders read memory only (`src/site/store.ts`). But a read of a copy over 60 seconds old triggers a background reload: ~12 queries (6 content tables, 5 `updatedAt` aggregates, the open-shifts query). So **busy hours cost at most one reload a minute per machine; it is not zero**, and the brief's "100 views = 0 queries" test would fail whenever a minute ticks over. There is no 10-minute timer by design (a 60-second timer used up the Neon free compute in October 2026).
- If the DB is down or slower than 500ms the last good copy stays. At boot with no DB, it serves the built-in defaults in code, not a `content-snapshot.json`.

## 8. Tests

Exist: `pricing`, `site-consistency`, `seo`, `siteContent`, `publicPagesSmoke`, `securityHeaders`, `csrfConfig`, integration `adminSiteContent` and `siteContent`; tools `verify-live.mjs` (live vs origin per sitemap URL), `screenshot-diff.mjs`, `scripts/validate-page-consistency.js`.

Missing: render test for every route at a given date (seasonal switching), "public rates never return quote-only", query-count assertion, before/after comparison of `<head>` (verify-live compares `<main>` only).

## Status, 2026-10-19 (branch `dynamic-site`, not deployed)

Done: items 1, 2, 3, 4, 6 and 7 below (drafts: migration `20261020120000_content_drafts`; rate card in pence: `20261020130000_rate_card_pence`), and page views now reload content at most every
10 minutes per machine instead of every 60 seconds (§7). One additive
migration, `20261019120000_promo_event_page`.

## 9. What's left, and the proposed order

Each item is real work the current site lacks. Ordered by value for the effort.

1. **Editable terms and company details**: add minimum hours, overrun block, NYE start hour, cancellation, payment terms, company number and registered office to `SETTING_SCHEMAS`. Small; same pattern as today.
2. **Change history with revert** (`ContentAudit`): who, when, old/new, one-click revert, on every admin site-content save. Medium.
3. **Seasonal pages that don't go stale**: out-of-season state for `/special-events/<event>` ("Now booking for 2027" plus the enquiry form, page stays 200), and event dates from the `SeasonalPromo` record instead of typed into the template. Fixes `halloween.eta:643` before 1 November. Medium.
4. **Draft / preview / publish** for seasonal promos and FAQs. Medium-large.
5. **`SpecialEvent` model** with hero, sections JSON, FAQs per event, so a new event page needs no template. Large; worth it only if new event pages are expected (festivals). The current approach (one template per event, content from settings/FAQs/photos) may be enough.
6. **Per-role `Rate` model in integer pence** (with `public`/`quote_only` visibility). Large: touches `pricing.ts`, `quoteShift`, `quote-calc.js`, `/api/v1/rates`, the admin, and the tests. The existing rates (standard, premium, three special-events roles) work; this is mainly for the pence rule and for adding roles like Santa without code.
7. **Lighthouse before/after** and the Christmas render check: the last commit already removed the per-frame repaint; the uncommitted `special-events.css` change moves the snow into the hero only.
8. Not proposed: `USE_TEMPLATES` switch and `_legacy/` folder (the legacy files are deleted and the migration is live; rollback is redeploying a previous Fly image, as `docs/site-rollout.md` describes); `@fastify/view` (wrong framework); Phase 1 session and Fly changes (already true).

## Speed and the Christmas page (2026-10-19)

Lighthouse 12.6, mobile, performance only. "Live" is vergoltd.com (the
15 October release); "branch" is `dynamic-site` served locally.

| Page | Live score | Live LCP | Branch score | Branch LCP |
|---|---|---|---|---|
| `/` | 99 | 1.8 s | 98 | 2.2 s |
| `/hire` | 99 | 1.7 s | 99 | 2.0 s |
| `/special-events/christmas` | 100 | 1.7 s | 99 | 2.1 s |

Total blocking time 0 ms and layout shift ≤ 0.002 on all six. The branch's
extra LCP is the local server, not the code: it speaks HTTP/1.1 where Fly's
edge speaks HTTP/2, so fonts and CSS queue (render delay 1.75 s vs 1.2 s on
the homepage). The CSS is byte-identical (same `?v=` hash), server response
is 20–30 ms on both, and in season the branch adds nothing to these pages. A
like-for-like "after" needs the branch on Fly.

Christmas rendering: the four SVGs (`christmas-bar`, `-canapes`, `-santa`,
`vergo-christmas-tree`) are 1.5–1.7 KB with 17–19 shapes each; no filters
(`feGaussianBlur`, `feTurbulence`), no base64 images, no SMIL. The one
continuous animation is the snow, transform-only (no repaints) and off under
reduced motion. The uncommitted `special-events.css` change confines it to
the hero and drops the header blur on the Christmas theme: worth shipping.
