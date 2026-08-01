# Handoff: VERGO site redesign (home / clients / workers)

## Overview
A visual + copy redesign of the three main pages of vergoltd.com (deployed as vergo-app.fly.dev):
home, /hire (clients) and /work (workers). The structure and routes stay the same; what changes
is the visual treatment (type, colour, layout, rhythm), some copy, and several removals the client
asked for. Implement into the existing Fly.io app's templates/components — do not replace the app.

## About the design files
`Vergo Site.dc.html` in this bundle is a **design reference prototype**, not production code.
It is a single streaming HTML component that renders all three pages with an in-page switcher
(state `page: "home" | "hire" | "work"`). In the real site these are three separate routes.
Recreate the markup/styles in the codebase's existing pattern (whatever templating/JSX the app
uses) — reuse the real header, footer, forms, meta tags and analytics that already exist.

## Fidelity
**High fidelity.** Colours, type, spacing and copy are final. Recreate pixel-close.

## Copy changes vs the live site (IMPORTANT — these are deliberate)
1. **No worker pay rate anywhere.** £13.25 is removed from the workers page (headline, meta
   description, "What you get" table) AND from the clients page. Worker rate is negotiated
   individually: the table row reads "Pay — Above the legal minimum. We'll confirm your rate when we speak".
2. **No weekly-pay claim.** The "Paid — Weekly, by BACS" row is deleted; "paid weekly" removed from
   headlines, the homepage worker card and the FAQ ("When do I get paid?" question deleted).
3. **No travel cover for workers.** The "Travel — covered outside Zones 1–3" row is deleted.
   The clients rate list no longer mentions Zones 1–3 / travel chargeable either.
4. **No named individual.** "you call Will, not a switchboard" → "you call us and we'll sort it out ASAP".
   "Have a chat with Will" → "Have a chat with us. ... We meet everyone."
5. **No 30-minute guarantee.** Everywhere it appeared it is now "Quick confirmation" —
   clients hero guarantee card, how-it-works step 2, homepage stat band.
6. **"Why we're not the cheapest" section deleted entirely** (the business is price-competitive).
7. **Homepage subhead** is now: "Staff are interviewed before joining the roster and handpicked for
   each shift. Briefed before they arrive."
8. **Chefs added** to role lists (homepage clients card, workers "Roles:" line).
9. **No em dashes** in body copy anywhere — use full stops, colons, parentheses. Keep it that way.
10. Client rate remains **£18.50/hr per person + VAT**, four-hour minimum, overruns in 30-minute blocks,
    no booking/uniform fees; senior roles quoted individually.

## Design tokens
Colours (hex):
- Page background: `#16130f` (warm near-black). Plus a hero glow:
  `radial-gradient(120% 70% at 15% -10%, rgba(232,192,122,0.10), rgba(232,192,122,0) 60%)`
- Footer background: `#100e0b`
- Header background: `rgba(22,19,15,0.88)` + `backdrop-filter: blur(12px)`, bottom border `1px solid rgba(242,239,232,0.1)`
- Primary text: `#f2efe8`   Secondary text: `#cfc9bd`   Muted / labels: `#8d877c`
- Accent (amber): `#e8c07a`; hover `#f6ddb2`
- Hairlines: `rgba(242,239,232,0.10–0.14)`
- Subtle panel fill: `rgba(242,239,232,0.03)`; card fill `linear-gradient(180deg, rgba(242,239,232,0.05), rgba(242,239,232,0.01))`

Type (Google Fonts: Instrument Serif, Work Sans, IBM Plex Mono):
- Display / headings: 'Instrument Serif', Georgia, serif — weight 400, line-height 0.98–1.05, letter-spacing -0.02em
  - h1 home: `clamp(48px, 7.5vw, 104px)`; h1 subpages: `clamp(42px, 6vw, 82–88px)`
  - section h2: 40–42px; card h2: 38px; stat figures: 44px; £18.50 figure: 64px
- Body / UI: 'Work Sans', Helvetica, Arial, sans-serif — base 17px/1.55; lede 19–21px/1.5; small 15px; weights 400/500/600
- Labels, numerals, phone, eyebrows: 'IBM Plex Mono' — 12–13px, letter-spacing 0.14–0.18em, uppercase
- Wordmark "VERGO": 15px, 600, letter-spacing 0.22em, uppercase

Spacing / shape:
- Content container: `max-width: 1180px; margin: 0 auto; padding: 0 40px`
- Section vertical padding: 72–96px (hero 88–96px top)
- Card padding: 32–40px; radius 6px on cards/panels/images; 999px on pills/buttons
- Grids: `repeat(auto-fit, minmax(240–320px, 1fr))` with `gap: 20–48px`
- Transitions: `border-color 160ms, transform 160ms`; card hover `translateY(-3px)` + accent border

## Screens
### 1. Home
Sticky header (wordmark + V mark tile in accent, "For clients" / "For workers", phone pill in mono).
Hero: mono eyebrow "London event & hospitality staffing", huge serif h1 "Event and hospitality staff
across London", lede (see copy change 7).
Two large clickable cards: "01 / Clients — I need staff" and "02 / Workers — I'm looking for work",
each with a text arrow CTA. Then one large photo (see Assets), then a 3-up stat band with hairlines
top and bottom: "Quick confirmation", "1 hour" (replacement on a no-show or the shift isn't charged),
"100% PAYE". Then a 2-up photo band. Footer.

### 2. Clients (/hire)
Eyebrow "For clients"; h1 "Staff who turn up, know the job, and don't need managing"; lede; amber pill
CTA "Get staff for your event" → /hire/quote.
"Two things we guarantee": two bordered cards — "Fast / Quick confirmation" and "1 hour / Someone
doesn't show, you don't pay"; muted note "No other London agency offers this...".
"Our rates" panel on `rgba(242,239,232,0.03)`: £18.50 in serif accent + bullet list with hairlines.
"How it works": 3 columns, top borders stepping down in accent opacity (1.0 / 0.4 / 0.2), mono 01–03.
"Working with us": single-column list of bolded facts (PAYE, right to work, insurance, 14-day terms,
cancellation ladder). Closing CTA band: serif line + "Get a quote" pill.

### 3. Workers (/work)
Eyebrow "For workers"; h1 "Properly employed shifts across London"; lede; "Apply now" pill → /work/apply.
Two columns: "What the work is" (roles / shifts / commitment) and "What you get" (definition table,
150px mono label column + value, hairline rows: Pay, Holiday pay 12.07%, Employment PAYE).
"What we ask" on the subtle panel: Turn up / Look the part / Know what you're doing.
"How to join": 4 stepped columns 01–04.
"Straight answers": accordion, one open at a time, +/− in accent, 5 questions.

## Interactions
- Page switch in the prototype = real routes in production (`/`, `/hire`, `/work`); keep existing SEO meta,
  and update the /work meta description so it no longer quotes a pay rate.
- Card/nav hover: background `rgba(242,239,232,0.08)` on nav items; cards lift 3px and border goes accent.
- FAQ accordion: single-open, click row to toggle, marker "+" / "−".
- All CTAs keep their current destinations: tel:+447506615242, /hire/quote, /work/apply, /terms, /privacy, /legal.

## Assets
Three photo slots on the home page are drag-and-drop placeholders in the prototype
(`<image-slot>`, `image-slot.js` included only so the prototype runs). In production replace them with
real `<img>` tags, radius 6px, `object-fit: cover`:
- `home-hero-photo` — full width, height 380px: staff working a London event
- `home-photo-bar` — half width, 300px: bar service
- `home-photo-dining` — half width, 300px: dining room service
Real photos of actual VERGO staff are strongly preferred over stock.

## Files
- `Vergo Site.dc.html` — the design reference (all three pages)
- `image-slot.js` — prototype-only helper for the photo placeholders
