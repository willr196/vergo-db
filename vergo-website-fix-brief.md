# VERGO Website Fix Sprint — Claude Code Brief

**Project:** vergoltd.com fix sprint
**Repo root:** `vergo-platform/` (monorepo)
**Frontend:** raw HTML in `apps/api/public/` — no React, no build templates, hand-edited files
**Client JS:** vanilla, in `apps/api/public/js/` and `apps/api/public/vergo-*.js`
**CSS:** plain CSS in `apps/api/public/vergo-*.css` (split by concern: home, header, public-pages, mobile, etc.)
**Backend:** TypeScript in `apps/api/src/`, Prisma, Postgres (Neon)
**Deploy:** Fly.io
**Origin (uncached, use for verification):** `vergo-app.fly.dev`
**Public domain (cached, NEVER use to verify):** `vergoltd.com`
**Brand:** dark navy/black background, gold accent `#C8A951`
**WhatsApp:** 07506 615242
**Email (confirmed):** `wrobb@vergoltd.com`
**Pricing model (current, two-tier):**
- **Standard** = staff wage + £2/hr VERGO fee + VAT (marketplace roster, self-employed)
- **Gold** = from £22/hr + VAT, chefs from £26/hr (employed by VERGO)

---

## CRITICAL CONTEXT — read before doing anything

**This is NOT a React/Next.js codebase.** Earlier drafts of this brief assumed component-based work. They were wrong. The reality:

- The frontend is **a folder of static HTML files** in `apps/api/public/`. `index.html`, `pricing.html`, `hire-staff.html`, `jobs.html`, `contact.html`, `privacy.html`, plus a wide set of SEO landing pages (`bartenders-london.html`, `wedding-staff-london.html`, etc.)
- **There is no template/include system** — copy is duplicated across HTML files by hand. A WhatsApp number change has to be applied to every file that contains it. **Always grep first.**
- Client JS is **vanilla** — `vergo-nav.js`, `vergo-menu.js`, `vergo-whatsapp.js`, `vergo-public-shell.js`, `vergo-public-legacy.css`, etc. **Do not introduce new frameworks** (no React, no Alpine, no htmx) without explicit approval from Will.
- Styles are **split CSS files by concern.** Don't introduce a new CSS pipeline. Add to existing files where the concern matches (`vergo-home.css` for homepage-only changes, `vergo-public-pages.css` for shared public-page styles).

**Implication:** every phase that touches "the homepage" actually means editing `apps/api/public/index.html` and possibly `vergo-home.css` and possibly a vanilla JS file. Every phase that touches "pricing" means `pricing.html` + likely `vergo-public-pages.css`. Always grep across all HTML files for any string you're changing.

---

## How to use this document

Read the **whole brief first** before touching anything. Phases have dependencies — Phase 1 changes `index.html` structure that Phases 2 and 5 also touch.

Each phase has:
- **Goal** — what we're actually trying to achieve
- **Why** — the underlying reasoning so micro-decisions can be made sensibly
- **Acceptance criteria** — checkable list, copy-pasteable into a PR description
- **Implementation notes** — concrete guidance for *this* stack
- **Files likely touched** — for the static-HTML reality
- **Verification** — how to confirm against `vergo-app.fly.dev`

**Verification rule (applies everywhere):** never trust `vergoltd.com`. Confirm against `vergo-app.fly.dev/<path>` only. Public domain may show stale Cloudflare cache for hours — that's expected, not a blocker.

**Surgical-edit rule:** prefer minimal diffs over file rewrites. If a fix needs three lines changed in a 400-line HTML file, change the three lines. Never rewrite a whole HTML page when an edit will do.

**Grep-first rule:** before any copy change, grep the entire `apps/api/public/` directory for the exact string. List every occurrence in the PR description. Then change them all in one commit, or note explicitly which ones are deliberately left alone.

---

## Sprint priority (do in this order)

The order reflects what most affects trust and conversions, not what's easiest to ship.

| # | Phase | Why this position |
|---|-------|-------------------|
| 0 | **Ground-truth audit** | Verify what's actually in the HTML/CSS/JS before changing anything |
| 1 | **Proof / credibility — founder note + recent briefs strip** | Highest-leverage fix. Site tells but doesn't show. Stranger has zero evidence VERGO has done this seriously |
| 2 | **Homepage hero sharpening** | Premium positioning needs a more specific, concrete promise — without going generic-shouty |
| 3 | **Pricing copy clarity** ("agreed wage" → "staff wage") | Easy fix, removes friction at the conversion moment |
| 4 | **Job board empty-state copy** | Free win. "No jobs available" → active framing |
| 5 | **Homepage / pricing / hire-staff language alignment** | Three pages use slightly different mental models. Tighten without adding Shortlist |
| 6 | **Contact page directness** | WhatsApp + email visible at top, above the form |
| 7 | **SEO landing pages — unique substance** | Each templated page gets specific useful info per role/scenario |
| 8 | **Privacy page tightening** | GDPR/ICO professionalism. Lower conversion impact, asymmetric downside risk |

**Stop and check in with Will after Phase 1 ships.** Proof section affects how Phases 2 and 5 frame the rest. Don't barrel through all eight.

---

## Phase 0 — Ground-truth audit

### Goal
Confirm what's actually in `main` right now, so the brief's assumptions match the live HTML/CSS/JS before any code changes.

### Why
This brief was rewritten once already after the assumed stack turned out wrong. A 15-minute audit saves hours of rework.

### Tasks
1. Pull latest `main`. Confirm last commit hash.
2. Run a directory tree of `apps/api/public/` (top level + `pages/` + `blog/` + `images/` + `js/`). Paste in PR description.
3. For each of these HTML files, **identify the section in the source** (line numbers) that this brief will touch:
   - `index.html` — hero, "Marketplace / Employed" tier section, "Where we work" categories, footer
   - `pricing.html` — Standard card, Gold card, calculator, FAQ section
   - `hire-staff.html` — Standard / Gold tier cards (confirm: NO Shortlist visible)
   - `jobs.html` — empty-state markup, listing markup
   - `contact.html` — form tabs, any direct contact details displayed
   - `privacy.html` — current section structure
4. Run these greps across `apps/api/public/`:
   - `grep -rn "Shortlist" apps/api/public/` — flag every occurrence (we're NOT adding Shortlist; stale references shouldn't ship either)
   - `grep -rni "agreed wage" apps/api/public/` — list every occurrence (Phase 3 will rewrite)
   - `grep -rn "Marketplace" apps/api/public/` — list (homepage tier label, used elsewhere?)
   - `grep -rn "Employed team" apps/api/public/` — list
   - `grep -rn "07506 615242" apps/api/public/` — confirm WhatsApp number consistency
   - `grep -rn "wa.me" apps/api/public/` — confirm all WhatsApp links use the same target
   - `grep -rn "agreed" apps/api/public/` — broader catch
5. Confirm Fly origin (`vergo-app.fly.dev`) is currently in sync with `main` (deploy timestamp ≥ last commit timestamp).

### Output
A short markdown summary at the top of the PR description with:
- Files predicted touched per phase
- Grep results (counts + filenames per query)
- Any surprises (e.g. Shortlist references found in the live HTML)
- Confirmation Fly origin is up to date

**Do not skip this phase. No code changes yet.**

---

## Phase 1 — Proof section: founder note + recent briefs strip

### Goal
Add a proof block to `index.html`, immediately after the hero, that gives a stranger evidence VERGO has actually done this. **Two sub-blocks only this sprint:** (1) Founder note, (2) Recent briefs strip with anonymised client name + role only.

### Why
This is the single biggest gap on the site. A stranger reads the homepage and has no evidence VERGO has staffed real events, that a founder exists with real experience, or that work is happening right now.

### What's IN this phase
- **Founder note** — short paragraph + photo slot
- **Recent briefs strip** — anonymised client + role only (e.g. "Premium production company — chef team")

### What's OUT of this phase (deliberately)
- **Standards strip** — Will can't defend specific items today (DBS check, 24h brief, RTW checks etc.). Don't ship things that aren't yet true. Reintroduce in a later sprint when standards are formalised.
- **Testimonials block** — no real ones yet. **Do not build the scaffold either** — every shipped feature is a maintenance cost. When real testimonials land, build the block then.
- **Made-up stats** ("500+ events", "trusted by") — do not ship.

### Acceptance criteria

- [ ] New `<section class="proof">` block added to `index.html` immediately after the hero section
- [ ] Section contains exactly two sub-blocks in this order: **Founder note**, **Recent briefs strip**
- [ ] Recent-briefs content lives in a config file or clearly-marked HTML block at the top of the section, with comments explaining how to add/edit/remove entries — Will needs to update this without help
- [ ] Section uses dark navy background with gold `#C8A951` accents — must match existing brand exactly. Steal styles from existing sections rather than inventing new ones
- [ ] No layout shift on mobile — section reflows cleanly at 375px wide
- [ ] If recent-briefs block has zero entries, the heading + container hide entirely (don't ship an empty box). HTML or vanilla JS controls this
- [ ] Founder photo: placeholder SVG silhouette (gold-on-navy) rendered until Will provides a real photo. Do NOT use a stock photo. Do NOT generate one with AI

### Sub-block specifications

**1. Founder note (always visible)**

Layout: photo (left, ~120px round) + text (right). Stack vertically on mobile.

Default copy (Will may edit before merging — surface in PR description for approval):

> "I started VERGO because event staffing in London too often means a name from a database showing up unprepared. Every person on the VERGO roster has been personally interviewed by me before joining. If something goes wrong on the day, I'm the person you call."
>
> — Will, founder, VERGO

Photo placeholder: simple SVG silhouette using brand colours. Save as `apps/api/public/images/founder-placeholder.svg`. The `<img>` tag should reference a real path Will can swap to a JPG later (`/images/founder.jpg`) — until that file exists, fall back to the SVG via a one-line vanilla JS check or `onerror` attribute.

**2. Recent briefs strip (visible if any briefs configured)**

Layout: 3-5 short lines, gold `▸` mark before each, single column on mobile, possibly two columns on desktop.

Format: `[Client type or anonymised name] — [staffing supplied]`

Examples Will can use as templates (only ship lines Will can defend as actually true):
- "Major UK production company — chef team, multi-day shoot"
- "Mayfair private members' club — bar staff, evening service"
- "Central London brand launch — front of house team"
- "West End wedding venue — wait staff and bartenders"

Recency label: small "Recent" eyebrow above the list. **Do not auto-generate dates.** Do not write "Updated [today]" — that creates a maintenance trap where it goes stale and lies.

If the configured list has zero items, hide the entire briefs block (heading included).

### Implementation notes

- Put recent-briefs entries in a clearly-commented HTML block at the top of the new section, like:
  ```html
  <!-- EDIT BRIEFS HERE: add/remove <li> items. Each line: "Client type — role".
       Empty list = block hides automatically. -->
  <ul class="proof-briefs__list">
    <li>Major UK production company — chef team, multi-day shoot</li>
    <li>Mayfair private members' club — bar staff, evening service</li>
  </ul>
  ```
- The "hide if empty" logic: vanilla JS in `vergo-public-shell.js` (or a new `vergo-proof.js` if cleaner) that checks `.proof-briefs__list` child count on `DOMContentLoaded` and toggles a `.is-hidden` class on the parent. Don't introduce reactivity frameworks
- Styles go in `vergo-home.css` under a clearly-marked `/* === Proof section === */` header. Use existing CSS variables for brand colours if any exist; otherwise use the literal `#C8A951` and the existing dark background colour (grep `vergo-home.css` and `vergo-public-pages.css` to find the existing dark hex)
- Founder placeholder SVG: ~3KB file, simple silhouette, gold ring around navy circle. Inline if cleaner

### Files likely touched
- `apps/api/public/index.html` (add new section)
- `apps/api/public/vergo-home.css` (proof styles)
- `apps/api/public/vergo-public-shell.js` (or new `vergo-proof.js`) — empty-state hide logic
- `apps/api/public/images/founder-placeholder.svg` (new)

### Verification
1. Deploy to Fly. Open `vergo-app.fly.dev` on desktop and mobile (DevTools 375px width)
2. Confirm proof section sits directly under hero, above any other section
3. Manually empty the briefs `<ul>`, redeploy or refresh local — confirm whole briefs block hides
4. Confirm photo placeholder renders correctly when `/images/founder.jpg` doesn't exist
5. Run Lighthouse mobile on the homepage — score should not drop more than 2 points vs current
6. Confirm no console errors

### Out of scope
- Sourcing real photos / testimonials (Will's job)
- Building the testimonials block (do later when content exists)
- Adding standards strip (do later when standards are formalised)

---

## Phase 2 — Homepage hero sharpening

### Goal
Make the first screen of `index.html` hit harder — without trading premium positioning for shouty generic copy.

### Why
Current H1 ("High quality event staff at the ready") is competent but unmemorable. The earlier-considered "VERGO STAFF READY FOR YOUR EVENTS" was rejected because all-caps + short generic claims = high-street ad register, not premium agency. The fix is **more specific and concrete**, not louder.

### Constraints
- **No all-caps short headlines.** That's the register VERGO has spent a year *not* sounding like
- **No generic claims** ("premium event staff at the ready", "event staff sorted")
- **Keep premium positioning** — film sets, arenas, founder-vetted are the differentiators
- **Stay under 12 words on the H1**

### Acceptance criteria

- [ ] H1 in `index.html` replaced with one of the candidates below (Will picks before merge)
- [ ] Sub-headline rewritten to lead with concrete capabilities + scope
- [ ] Two CTAs preserved with clear visual hierarchy: "Hire Staff" = primary (gold fill), "See Pricing" = secondary (gold outline). Confirm CSS classes match this hierarchy
- [ ] Buyer-question micro-section added between hero and proof section
- [ ] Mobile (375px): H1 fits within 2 lines without awkward breaks
- [ ] Existing hero image / visual treatment unchanged unless Will requests

### H1 candidates (Will picks one — surface in PR description)

Surface all of these as HTML comments above the chosen H1 in the source so Will can see what was rejected:

```html
<!-- H1 candidates considered (Phase 2 of fix sprint):
     A. Event staff trained on film sets and arenas, available across London
     B. London event staff your guests will assume work at the venue
     C. Bartenders, waiters and chefs who've worked the rooms that matter
     D. Event staff who don't need managing on the day
     E. Premium event staff, founder-vetted, ready across London
     F. Event staff, ready before you are
     -->
<h1>[chosen H1]</h1>
```

If Will hasn't picked when this phase runs, **default to candidate A** ("Event staff trained on film sets and arenas, available across London") — most specific, hardest to copy, premium register intact. Flag this as the default in the PR.

### Sub-headline pattern

Replace current sub-headline. Example:

> "Bartenders, waiters, chefs and front-of-house, vetted personally by the founder. For private events, productions and venues across London."

### Buyer-question micro-section (new)

Placement: between hero and proof section. Light typography on dark, no card/box treatment.

Markup pattern:
```html
<section class="buyer-questions">
  <p class="buyer-questions__list">
    Will they turn up? Will they look right?<br>
    Will they know what to do? Will I have to manage them?
  </p>
  <p class="buyer-questions__answer">Four questions VERGO answers before you ask.</p>
</section>
```

Don't over-design it. Small typographic block, not a hero section.

### Files likely touched
- `apps/api/public/index.html` (hero markup + new buyer-questions section)
- `apps/api/public/vergo-home.css` (CTA hierarchy classes if not already present, buyer-questions styles)

### Verification
- Compare hero stack on Fly origin to a screenshot of current `main`
- Mobile (375px) and desktop (1440px) both clean
- Tap targets on CTAs ≥ 44px on mobile
- No text overlap with floating WhatsApp widget (`vergo-whatsapp.js`)

---

## Phase 3 — Pricing copy clarity

### Goal
Replace "agreed wage" with "staff wage" wherever it appears, and add a single reassurance line on the pricing page. Removes the "agreed with who?" friction without changing the actual model.

### Why
First-time clients reading "agreed wage + £2/hr + VAT" ask: *Agreed with who? Am I employing the staff? What do I actually pay?* The model is fine — the wording isn't.

### Acceptance criteria

- [ ] **Grep first.** Run `grep -rni "agreed wage" apps/api/public/` and list every match in PR description before editing
- [ ] Replace every instance of `"agreed wage + £2/hr + VAT"` (and the variants without "+ VAT") with `"Staff wage + £2/hr VERGO fee + VAT"` across:
  - `index.html`
  - `pricing.html`
  - `hire-staff.html`
  - any blog post (`blog/`) referencing pricing
  - any SEO landing page (`*-london.html`) referencing pricing
- [ ] On `pricing.html`, the calculator's input label "Agreed hourly wage" → "Staff hourly wage"
- [ ] On `pricing.html`, the calculator's explanation text "Standard pricing = agreed wage + £2/hr + VAT" → "Standard pricing = staff wage + £2/hr VERGO fee + VAT"
- [ ] Calculator JS file (find via `grep -rn "agreedWage\|wage" apps/api/public/`): no behaviour changes, only label changes and any matching variable name updates if they leak into the DOM
- [ ] Add a single reassurance line under the Standard card on `pricing.html`:
  > "You see the full wage, VERGO fee and VAT breakdown before confirming."
- [ ] Update FAQ entry on `pricing.html`: rename Q from "What does 'agreed wage' mean?" to "What is the staff wage?" and rewrite A to:
  > "The hourly rate paid to the staff member. It depends on the role, experience and your brief. VERGO confirms it with you before any commitment, so you always see the full breakdown."
- [ ] Final post-change grep: `grep -rni "agreed wage" apps/api/public/` returns **zero matches**

### Implementation notes

- Variable names in JS (e.g. `agreedWage`, `agreedHourlyWage`) — leave alone unless the variable name leaks to the user (e.g. as an `id` or `name` attribute that's user-visible, or in console output). Internal naming consistency is a separate concern from user-facing copy
- The calculator's math output must be unchanged. This is a labelling-only change. Test with sample inputs before/after to confirm
- Don't rebuild the calculator. Single-line edits to labels and explanation text only

### Files likely touched
- `apps/api/public/index.html` (if pricing line appears in hero/CTAs)
- `apps/api/public/pricing.html` (calculator + FAQ + cards)
- `apps/api/public/hire-staff.html` (Standard tier card)
- `apps/api/public/blog/*.html` (any post referencing the formula)
- `apps/api/public/*-london.html` (any SEO page referencing the formula)
- Any JS file driving the calculator (find via grep)

### Verification
- Run calculator on Fly origin with sample inputs (Wage £15, 4 staff, 6 hours each). Output unchanged from current
- Final grep clean: `grep -rni "agreed wage" apps/api/public/` → zero
- Visually scan `pricing.html` and `hire-staff.html` for any orphaned old phrasing

---

## Phase 4 — Job board empty-state copy

### Goal
Replace "No jobs available" on `jobs.html` with active framing.

### Why
Empty job board = quiet business signal. Cheap, immediate fix.

### Acceptance criteria

- [ ] In `jobs.html`, the empty-state text "No jobs available" is replaced. Two cases:
  - **Underlying jobs table empty (no listings exist):**
    > "No public roles live today. Apply to join the roster and we'll contact you when suitable shifts come in."
    With CTA button: "Apply to join the roster" → links to `/apply.html` (or wherever apply route lives — confirm via grep `grep -rn "apply" apps/api/public/jobs.html`)
  - **Filters return zero matches but listings exist:**
    > "No roles match these filters today. Clear filters or apply to join the roster."
    With two CTAs: "Clear filters" (resets filter state) and "Apply to join the roster"
- [ ] Two empty states are distinguishable in markup (different containers / data attributes) — driving JS toggles which is shown based on filter state vs total count
- [ ] If only one empty state currently exists in code, the second is added

### Implementation notes
- Find current empty-state markup: `grep -n "No jobs" apps/api/public/jobs.html`
- The JS handling the filter state likely lives in the same file or a `jobs.js` / inline `<script>` — find with `grep -n "filter" apps/api/public/jobs.html` and trace
- The "Apply to join the roster" CTA: confirm the route. The directory listing shows `apply.html` exists — use `/apply.html` unless a server route rewrites this

### Files likely touched
- `apps/api/public/jobs.html`
- Possibly a JS file controlling filter state — find via grep

### Verification
- Test on Fly origin with empty jobs table — confirm "No public roles live today" copy renders
- Test with filter that yields zero results from a non-empty table — confirm filter-empty copy renders
- Both CTAs functional (clicking "Apply" navigates to `/apply.html`; clicking "Clear filters" resets)

---

## Phase 5 — Homepage / pricing / hire-staff language alignment

### Goal
Make the journey homepage → pricing → hire-staff feel like one product, without changing tier names.

### Why
- **Homepage (`index.html`):** "Marketplace roster" + "Employed team"
- **Pricing (`pricing.html`):** "Standard" + "Gold"
- **Hire-staff (`hire-staff.html`):** "Standard" + "Gold"

Will is keeping "Marketplace / Employed" on the homepage. The fix: make the relationship to Standard/Gold explicit so a stranger doesn't have to map mentally.

### Acceptance criteria

- [ ] On `index.html`, the Marketplace and Employed cards keep their current headlines
- [ ] Each card gains a small eyebrow/caption label naming the pricing tier:
  - Marketplace card: small line "Standard tier" (above or below body — match existing eyebrow style)
  - Employed team card: small line "Gold tier"
- [ ] Each card has a CTA linking to the matching anchor on `pricing.html`:
  - Marketplace → `/pricing.html#standard`
  - Employed → `/pricing.html#gold`
- [ ] On `pricing.html`, the Standard card has `id="standard"`, the Gold card has `id="gold"`
- [ ] Anchor scrolling works on Fly origin — clicking the homepage card lands on `pricing.html` with the correct card in viewport
- [ ] No copy on `hire-staff.html` or `pricing.html` changes in this phase — alignment flows from homepage to those pages

### Implementation notes
- Eyebrow style: find existing eyebrow/caption typography on the homepage — reuse the same class. Don't introduce a new typography token for two labels
- CTA style: text link or outline button, **not** primary gold fill. Primary fill is reserved for "Hire Staff" / "Get a Quote" CTAs
- Anchor IDs: add `id="standard"` and `id="gold"` to existing tier card containers in `pricing.html` — single attribute additions, no other markup changes

### Files likely touched
- `apps/api/public/index.html` (eyebrow labels + CTAs on Marketplace/Employed cards)
- `apps/api/public/pricing.html` (anchor IDs on tier cards)
- Possibly `apps/api/public/vergo-home.css` (if eyebrow class needs minor adjustment)

### Verification
- Click Marketplace card CTA on Fly origin → lands on `pricing.html#standard`, Standard card in viewport
- Same for Employed → `#gold`
- Mobile (375px): "Standard tier" / "Gold tier" labels render at correct size, no overflow

### Out of scope
- Renaming "Marketplace" / "Employed" — Will has decided these stay
- Adding Shortlist anywhere — separate sprint

---

## Phase 6 — Contact page directness

### Goal
Make WhatsApp and email visible at the top of `contact.html`, above the form tabs.

### Why
The contact page leads with form tabs. A premium business has a phone/WhatsApp route visible immediately — credibility signal as much as UX. Mobile users especially need a tappable WhatsApp link before they scroll.

### Acceptance criteria

- [ ] New "Get in touch directly" block added at top of `contact.html`, above the existing form tabs
- [ ] Block contains exactly:
  - **WhatsApp:** `07506 615242` — tappable `wa.me` link with pre-filled text:
    > "Hi, I'm enquiring about event staff. Date: . Venue: . Roles: ."
  - **Email:** `wrobb@vergoltd.com` — `mailto:` link with pre-filled subject "Event staff enquiry"
  - **Response promise line:**
    > "Quote within 24 hours. Urgent cover: send date, postcode, role and timing via WhatsApp."
- [ ] Block uses subtle outlined treatment (gold border, dark fill) — feels like an "if you'd rather just message" option, not a competing CTA to the form
- [ ] Mobile (375px): WhatsApp link has min 44px tap target; entire block doesn't push the form off-screen on initial viewport
- [ ] WhatsApp `wa.me` URL: `https://wa.me/447506615242?text=` followed by URL-encoded message text
- [ ] Email link: `mailto:wrobb@vergoltd.com?subject=Event%20staff%20enquiry`

### Implementation notes
- Confirm WhatsApp number consistency across the site first: `grep -rn "07506 615242" apps/api/public/` — should match the new block's number exactly
- Block markup should be self-contained — don't rebuild the form below
- Existing form is unchanged in this phase

### Files likely touched
- `apps/api/public/contact.html` (new block + minor styling)
- `apps/api/public/vergo-public-pages.css` (or `vergo-home.css` if contact-only styles live there) — outlined-block treatment

### Verification
- Tap WhatsApp link on real iOS/Android — opens WhatsApp with pre-filled message
- Email link opens default mail client with correct address + subject
- iPad-portrait (768px) and mobile (375px) both render the block cleanly without pushing the form too far down

---

## Phase 7 — SEO landing pages — unique substance

### Goal
Each role-specific SEO landing page in `apps/api/public/` (the `*-london.html` files) gets concrete, role-specific content that earns the page rather than just targets a keyword.

### Why
Templated SEO pages with mostly-identical copy across roles look spammy to both Google and humans. Each page needs a reason to exist for that specific role.

### Pages in scope (from the directory listing)
- `bartenders-london.html` *(implied — confirm)*
- `temporary-bar-staff-london.html`
- `waiting-staff-london.html`
- `front-of-house-staff-london.html`
- `event-chefs-london.html`
- `kitchen-porters-london.html`
- `wedding-staff-london.html`
- `corporate-event-staff-london.html`
- `festival-staff-london.html`
- `event-staffing-agency-london.html`
- `hospitality-staffing-agency-london.html`
- `staff-roles.html`

Confirm the full list in Phase 0.

### Acceptance criteria

- [ ] Each page in scope gets a new "Useful detail" section with role-specific content (specs below)
- [ ] No two pages share more than 50% of their non-navigational copy (rough heuristic, not strict)
- [ ] Schema.org `Service` markup on each page with role-specific `name` and `description` (use `<script type="application/ld+json">` block in `<head>`)
- [ ] Existing CTA pattern preserved (form / WhatsApp / pricing CTA)
- [ ] **Don't ship all pages in one PR.** One PR for content scaffold + 2-3 sample pages (Bartenders + Wedding + Chefs is a good first batch). Remaining pages follow in subsequent PRs

### Per-role unique content specs

**Temporary Bar Staff London / Bartenders London**
- Staff ratios table: guest count vs bartenders needed (e.g. 50 → 2, 100 → 3, 150 → 4)
- Cocktail vs beer/wine staffing note (cocktail service ~30% more headcount)
- Barback role explanation (what they do, when to add one)

**Waiting Staff / Front of House London**
- Service style breakdown: plated, family-style, canapé, buffet — staff implications
- Standard ratio guidance: 1 waiter per 8–12 guests (plated), 1 per 20–25 (canapé)

**Event Chefs London**
- Chef level explainer: prep chef, CDP, sous chef, head chef — when to use each
- Production kitchen vs venue kitchen vs unit base — what's expected at each
- Indication of typical day rates per chef level (or link to pricing)

**Kitchen Porters London**
- KP checklist: wash-up, glassware, bins, close-down
- Kitchen size vs KP count guidance
- Why a KP is often the difference between a smooth service and a struggling one

**Wedding Staff London**
- Sample staffing timeline (3pm setup → ceremony → drinks → dinner → evening → close-down)
- Typical roles needed across a wedding day
- Pitfall: under-staffing the drinks reception

**Corporate Event Staff / Festival Staff London**
- Each gets at least one piece of role-specific guidance (corporate: AV/registration support staff, dress code; festival: shift handovers, wet-weather contingencies, etc.)

**Generic agency pages (`event-staffing-agency-london.html`, `hospitality-staffing-agency-london.html`)**
- These are the hardest — risk of duplication. Differentiate by audience: one targets event organisers, the other targets hospitality venues. Lean into the audience-specific concerns

### Implementation notes

- This phase is content-heavy. **Surface the content shape in code, but Will should write or approve the final wording.** Don't ship Lorem Ipsum or AI-stock-prose
- Markup pattern: a new `<section class="useful-detail">` placed between the existing intro/hero and the CTA. Reuse existing typography classes
- Tables in HTML (for staff ratios): plain `<table>` with existing CSS or simple inline styling. Don't introduce a new table component
- Schema markup goes in `<head>`, not body. Validate with Google's Rich Results Test before claiming a page is done

### Files likely touched
- Each `*-london.html` file in scope
- Possibly `vergo-public-pages.css` for new section styling

### Verification
- Lighthouse SEO score per page ≥ 95
- Google Rich Results Test passes for the Schema.org block on each page
- Manual review by Will of at least Bartenders + Wedding before merging the first batch

---

## Phase 8 — Privacy page tightening

### Goal
Bring `privacy.html` up to professional GDPR/ICO standards.

### Why
VERGO collects applicant CVs, contact details, onboarding info. ICO-registered. Lower conversion impact than other phases, but the downside risk of getting it wrong is asymmetric (ICO complaint > slow conversion).

### Acceptance criteria

- [ ] `privacy.html` has clear section headings for: Data controller / What we collect / How we use it / Retention / Sharing / Your rights / Contact for data requests
- [ ] **CV-specific clarity:** explicit statement on whether/when CVs are shared with clients, and whether applicants consent at upload time
- [ ] Retention periods stated (e.g. "Applicant data retained for [X] months unless you request earlier deletion")
- [ ] Data subject access / deletion request route: a named email address (likely `wrobb@vergoltd.com` or a `privacy@` alias if Will sets one up) and expected response time
- [ ] ICO registration number cited (Will to confirm/provide)
- [ ] Last-updated date at top of page
- [ ] Cookie banner copy reviewed for consistency with privacy page (no contradictions). Find banner via `grep -rn "cookie" apps/api/public/`

### Implementation notes
- **Will needs to confirm specific facts before this phase can ship copy:**
  - Actual retention periods for applicant CVs and contact data
  - Whether CVs are shared with clients, under what conditions
  - The ICO registration number
  - The email alias for data requests (use `wrobb@vergoltd.com` if no separate alias exists)
- Use the ICO's small-business guidance as the structural template — not a generic privacy generator
- Don't ship retention periods that aren't actually true. Flag for Will's confirmation in PR description; don't guess

### Files likely touched
- `apps/api/public/privacy.html`
- Possibly a cookie banner JS / HTML snippet — find via grep

### Verification
- Manual review by Will against actual data practices in the Prisma schema and backend code
- Optional but recommended: a 30-min review by a UK GDPR-aware solicitor (separate cost; not blocking this sprint)

---

## Cross-cutting checks (run at end of every phase)

Before marking any phase complete:

1. **Grep for orphaned strings.** If you renamed "agreed wage" → "staff wage", grep entire `apps/api/public/` for the old phrase — must be zero matches
2. **Confirm Fly origin matches expectations.** `vergo-app.fly.dev/<changed path>` shows the change. `vergoltd.com` may show stale Cloudflare cache — that's expected, not a blocker
3. **Mobile (375px) check** on every changed page. Premium positioning breaks fastest on mobile
4. **Lighthouse delta.** Mobile score should not drop more than 2 points per phase; SEO score per phase ≥ 95 for any page touched
5. **No console errors** introduced by the change
6. **PR description** includes verification screenshots (Fly origin, desktop + mobile) and the grep output

---

## What this brief deliberately does NOT include

- **Adding the Shortlist tier** — Will has decided two-tier (Standard + Gold) for now. Don't reintroduce Shortlist references
- **Rebranding "Marketplace" / "Employed"** — Will wants these kept
- **Standards strip on the proof section** — can't defend specific items today; do later
- **Testimonials block** — no real ones yet; build only when content exists
- **Founder photo** — Will provides; placeholder SVG only
- **Seeding evergreen job listings** — separate decision
- **Cookie banner overhaul** beyond consistency-check with privacy page
- **CRO experiments / A/B testing** — out of scope
- **Introducing React, Alpine, htmx, or any other framework** — vanilla JS only, matching existing codebase
- **Introducing a build template / partials system** — out of scope; copy is duplicated per file by hand. If duplication becomes painful, Will should consider templating as a separate sprint

---

## Communication pattern with Will

- **After Phase 0 (audit):** post findings, wait for Will's go-ahead before touching code
- **After Phase 1 (proof section):** stop and check in. This is the structurally biggest change. Will should review the deployed Fly origin before Phases 2–5 run
- **After Phase 5:** stop and check in — homepage / pricing / hire-staff alignment is now done; Phase 6 onwards is lower-risk and can run in a chain
- **After Phase 7 first batch:** stop and check in before doing the rest of the SEO pages. Will should review the first 2–3 sample pages
- **For copy decisions where Will hasn't picked:** surface options in the PR description and let Will choose. Don't pick unilaterally for: H1 wording (Phase 2), Recent briefs lines (Phase 1), retention periods (Phase 8), ICO number (Phase 8)

---

## Appendix A — File reference

Confirmed files in `apps/api/public/` (top level, from directory listing):

**Public pages (HTML):**
`index.html`, `pricing.html`, `hire-staff.html`, `hire-us.html`, `jobs.html`, `job-detail.html`, `apply.html`, `contact.html`, `quote.html`, `about.html`, `faq.html`, `blog.html`, `staff-roles.html`, `browse-staff.html`, `privacy.html`, `terms.html`, `404.html`

**SEO landing pages:**
`temporary-bar-staff-london.html`, `waiting-staff-london.html`, `front-of-house-staff-london.html`, `event-chefs-london.html`, `kitchen-porters-london.html`, `wedding-staff-london.html`, `corporate-event-staff-london.html`, `festival-staff-london.html`, `event-staffing-agency-london.html`, `hospitality-staffing-agency-london.html`

**Auth / dashboard:**
`login.html`, `user-login.html`, `user-register.html`, `client-login.html`, `client-register.html`, `portal-login.html`, `forgot-password.html`, `reset-password.html`, `user-dashboard.html`, `client-dashboard.html`, `dashboard-client.html`, `dashboard-worker.html`, `profile.html`, `post-job.html`, `auth.js`

**Admin:**
`admin.html`, `admin-analytics.html`, `admin-bookings.html`, `admin-clients.html`, `admin-comms.html`, `admin-job-applications.html`, `admin-jobs.html`, `admin-marketplace.html`, `admin-quotes.html`

**Subdirectories:**
`pages/`, `blog/`, `images/`, `js/`

**Site assets:**
`favicon.ico`, `logo.png`, `logo-small.png`, `vergo-logo.svg`, `robots.txt`, `sitemap.xml`, `site.webmanifest`

**CSS files:**
`vergo-styles.css`, `vergo-home.css`, `vergo-header.css`, `vergo-mobile.css`, `vergo-public-pages.css`, `vergo-public-legacy.css`, `vergo-platform.css`, `vergo-blog.css`, `vergo-a11y.css`

**JS files (top level):**
`auth.js`, `vergo-analytics.js`, `vergo-footer.js`, `vergo-menu.js`, `vergo-nav.js`, `vergo-public-shell.js`, `vergo-utils.js`, `vergo-whatsapp.js`

**Stray (likely should be moved):**
`jobs.ts`, `jobs-submit-routes.ts` — these look like server-side files that ended up in `public/`. **Flag in Phase 0 for Will**, but don't move/delete in this sprint

---

## Appendix B — Brand & tone guardrails

These apply to every line of copy added in this sprint.

**Tone:** confident, specific, founder-led. Not shouty. Not corporate. Not over-explaining.

**Yes:**
- "Every team member personally interviewed by founder."
- "Staff trained on film sets and arenas."
- "We confirm the full breakdown before you commit."

**No:**
- "VERGO STAFF READY FOR YOUR EVENTS" (all-caps + generic)
- "EVENT STAFF, SORTED" (high-street ad register)
- "Industry-leading staffing solutions" (corporate filler)
- "We pride ourselves on..." (every competitor says this)
- "2,500 staff nationwide" (race-to-the-bottom volume framing)
- "Trusted by 500+ events" (don't claim a number that can't be defended)

**On pricing language:**
- After Phase 3: always "staff wage", never "agreed wage"
- Always "+ VAT" suffix when mentioning a rate
- Never quote a rate without "+ VAT" or "fully loaded" framing — sets expectations

**On the founder voice:**
- First-person where it lands ("I started VERGO because…")
- Otherwise third-person but specific ("the founder personally interviews every roster member")
- Never "our team is dedicated to providing exceptional service"

**On CSS / JS:**
- Add to existing files where the concern matches; don't create new files unless adding a genuinely new concern
- No new frameworks
- No CSS-in-JS, no preprocessors not already in the codebase
- Vanilla JS only

---

**End of brief.**
