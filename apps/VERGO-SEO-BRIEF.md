# VERGO Staffing: SEO and site overhaul

Brief for Claude Code from Will (the owner). "I" and "me" means Will.

## How to run this job

This is a big job. Work through it phase by phase, in order.

- Start with Phase 0 and make no changes until I've approved your plan.
- After each phase: run the checks listed, commit with a clear message, then give me a short summary (what changed, files touched, anything you need from me). Wait for my go-ahead before starting the next phase.
- Work on a new branch called `seo-overhaul`. Don't push, deploy or delete files unless I ask.
- Keep a running `docs/SEO-PROGRESS.md` with finished phases, decisions I've made and the TODO list of things you need from me, so a fresh session can pick up where we left off.
- Phases 1 and 2 are time-sensitive (Christmas bookings). I'll probably deploy after Phase 2.
- This brief is based on the live site and notes that may be out of date. Where it doesn't match the code, trust the code and tell me.

## Context

VERGO is a small, founder-led event and hospitality staffing agency in London. Legal name Vergo Ltd; trading name VERGO Staffing (the name on our Google Business Profile). Site: https://vergoltd.com

- Monorepo, branch `main`. The public site is plain static HTML, vanilla JS and plain CSS in `apps/api/public/`, served by a Fastify (TypeScript) API on Fly.io.
- Known public routes: `/`, `/hire`, `/hire/quote`, `/work`, `/work/apply`, `/special-events`, `/special-events/halloween`, `/blog`, `/blog/paye-vs-self-employed-event-staff`, `/terms`, `/privacy`, `/legal`. There may be others (e.g. `rates.html`).
- Sitewide config appears to live in `apps/api/public/vergo-site-config.js`, alongside `vergo-public-shell.js` and `vergo-whatsapp.js`.
- The hourly rate lives in several places: `apps/api/src/config/pricing.ts`, `apps/api/src/__tests__/pricing.test.ts`, `apps/api/public/pages/js/rates.js`, `pages/js/quote.js`, plus page copy.
- `/hire-staff` already 301s to `/hire`. Use the same mechanism for new redirects.
- `vergoltd.com` is behind CDN caching. `vergo-app.fly.dev` is the reliable origin for checking what's deployed.
- The design is established (dark and gold). New pages and components must reuse the existing CSS, type, spacing and components so they look like they belong. Don't redesign anything.

## Goals

1. Rank for specific searches we can realistically win (roles, occasions, Christmas) rather than "event staffing agency London", which is dominated by agencies with 10 to 20 years behind them.
2. Give visitors and Google more reasons to trust us: a fuller homepage, FAQs, and ready-made slots for testimonials, photos and recent work.
3. Fix technical loose ends: dead URLs, titles, navigation, structured data, sitemap.

## Copy rules (for everything you write)

- British English. Plain, specific, short sentences. Match the voice already on /hire: "Most agencies send whoever's free. We send people we've met, interviewed and briefed on your event."
- Describe what happens; don't sell. Avoid hype words: premium, elite, seamless, world-class, unparalleled, elevate, curated, second to none, immaculate.
- Buttons say exactly what happens ("Get a quote", "Send us the brief").
- **Never invent facts.** No client names, testimonials, reviews, ratings, event counts, staff numbers, years trading, awards, logos or "trusted by" lines. Use only the facts sheet below and what I tell you. If a page needs a fact you don't have, leave it out and add it to the TODO list.
- Don't strengthen existing claims. The site says "Our employed team get holiday pay, pension and payslips". Never turn that into "all our staff are employed".
- Each new page targets one main search phrase. Use it in the title, H1, meta description and first paragraph, then write naturally. No keyword stuffing and no long lists of London boroughs.
- Every page must be genuinely different, not /hire with the role name swapped. Roughly 400 to 700 words of useful copy per service page.
- No stock photos. Nothing visible that says "coming soon", no placeholder text, no empty sections.

## Facts sheet (source of truth)

- £19.00 per hour, per person. One rate for waiting staff, bar staff, kitchen porters, runners and hosts.
- Four-hour minimum per person. Overruns billed in 30-minute blocks. +25% after midnight.
- No booking fees, no uniform charges, no surcharges. No cancellation fee.
- Senior roles (supervisors, chefs, event managers) are quoted individually.
- Same-day confirmation: enquire between 8am and 10pm and you get confirmed names back the same day.
- No-show guarantee: if someone doesn't arrive, a replacement is on site within the hour, or that shift isn't charged.
- Everyone we send has been met and interviewed, and is briefed on the event (venue, service style, what the night involves) before they arrive.
- Our employed team get holiday pay, pension and payslips. Right to work is verified and documented for everyone we send.
- Employers' and public liability insured; certificates on request.
- We work for venues, caterers, production companies, private clients, and agencies needing overflow cover.
- Special events: themed bartenders and waiting staff, character performers, scare actors, SFX and guest makeup artists, costume options.
- Contact: wrobb@vergoltd.com, 07944 505783 (+447944505783).
- Vergo Ltd, company no. 16627585, registered office 96 Sulivan Court, London SW6 3DB.

## Questions to ask me in Phase 0 (all in one go)

1. Payment terms wording. /hire currently says "Within 30 days of employment". Default: "Within 30 days of invoice".
2. What our staff wear by default (for the FAQs).
3. Coverage wording. Default: "across London". Anywhere outside London worth mentioning?
4. Christmas pricing. Default: standard rates, +25% after midnight as usual.
5. Our Google Business Profile URL (for structured data).
6. Founder section. Default basis: I'm Will, 8+ years across hospitality, film and music, and I come from a family event-staffing business. I'll edit your draft.
7. Two or three recent-work entries (event type, area, headcount, roles), or I'll add them later.
8. Do we supply anything besides people (stock, equipment, glassware)? Default: people only.
9. Can the Film & TV page mention our ongoing production-kitchen work, in general terms only?

## Phase 0: Recon and plan (no changes)

- Run `git status`. If there are uncommitted changes, stop and show me before anything else. Uncommitted work has made local and live disagree before.
- Map every public HTML page and its route. Flag orphaned, duplicate or legacy pages (e.g. `rates.html`). Don't delete anything.
- Work out how the header/nav and footer are produced (hand-copied into each file, or injected by `vergo-public-shell.js`?). The live pages currently have different navs and footers, so list the differences.
- Find the redirect mechanism, `sitemap.xml`, `robots.txt`, any existing JSON-LD, how the rate is rendered on pages, where forms submit, and what goes in each page's `<head>` (analytics, consent, fonts, favicon).
- Study `/special-events/halloween`, including its `#build` brief form. It's the template for the Christmas page.
- Check git history for URLs that used to be public (known: `/apply`, `/jobs`, `/hire-staff`) so all of them can be redirected.
- Ask me the questions above, then give me a short plan, including anything in this brief you'd change and why.

## Checklist for every new page

- Clean URL matching existing conventions (no `.html`, same trailing-slash style as current routes).
- Same `<head>` pattern as existing pages (analytics, consent, fonts, favicon, theme colour).
- Unique `<title>` of 60 characters or fewer, ending "| VERGO Staffing". Unique meta description of 155 characters or fewer.
- Absolute canonical (`https://vergoltd.com/...`) plus `og:title`, `og:description`, `og:url`, `og:image`, `og:site_name` and `twitter:card`.
- One H1 containing the page's main phrase.
- Same header and footer as every other page.
- Rate shown the way the site already does it (from config if that's the pattern). Don't add new hard-coded copies unless that's how every page already works.
- Clear calls to action: the quote form (or the relevant brief form) and the phone number.
- Links out to /hire (rates) and one or two related pages. Linked to from /hire or /special-events, the footer and the nav.
- Added to `sitemap.xml` with `lastmod`.
- Works at 375px wide with no horizontal scroll and usable tap targets. Visible keyboard focus. Respects reduced motion.
- If you can run a headless browser, screenshot the page at desktop and mobile widths and review it before calling it done.

## Phase 1: Quick fixes

1. **Redirects (301).** `/apply` to the worker application page (probably `/work/apply`, so confirm), `/jobs` to `/work`, and any other old public URLs from Phase 0 to the closest current page. `/apply` and `/jobs` return 404 now but still appear in search results, and the `/apply` result still describes workers joining as self-employed.
2. **Titles.** Change the brand suffix sitewide from "| VERGO" to "| VERGO Staffing" (the blog already does this), keeping titles to 60 characters or fewer. Homepage: "Event and Hospitality Staff in London | VERGO Staffing". Match `og:title`, and add `og:site_name` ("VERGO Staffing") and `twitter:card` (`summary_large_image`) to every public page. Don't change the visible logo or branding.
3. **Meta descriptions.** Unique on every public page, 155 characters or fewer.
4. **Phone number.** Search the whole repo (HTML, JS, config, WhatsApp script, email templates, JSON-LD) for any other number, especially anything starting 07506. Every public number and `tel:` link must be 07944 505783 / +447944505783.
5. **Payment terms.** Fix the /hire line (and the terms page if the same wording appears there) with the wording I confirm.
6. **Special events brief links.** On `/special-events`, the "Send us the brief" links for Christmas, New Year's Eve, themed events and brand activations all go to the Halloween form. Give `/special-events` its own general brief form (reusing the Halloween form's component and submission, plus a field for which concept they're asking about) and point those links to it.
7. **Indexing hygiene.** `robots.txt` references the sitemap and disallows admin paths. Admin pages (e.g. `admin-jobs.html`) and any thank-you or confirmation pages are `noindex` and not in the sitemap.

Checks: tests pass. `curl -I` locally shows a single 301 hop for each redirect. A repo-wide search finds no stray phone numbers. No duplicate titles or descriptions.

## Phase 2: Christmas party staff page

- URL: `/special-events/christmas`
- Title: "Christmas Party Staff in London | VERGO Staffing"
- H1: "Christmas party staff across London" (or close to it)
- Main phrase: "Christmas party staff London"
- Meta description, for example: "Waiting staff, bar staff and kitchen porters for Christmas parties across London. £19/hr, four-hour minimum, same-day confirmation."

Content:

- Lead with standard Christmas party staffing (waiting staff, bar staff, kitchen porters, runners and hosts at our standard rate) for office parties, private parties, and venues and caterers needing December overflow cover. That's what most people search for and book.
- Then themed options: festive hosts, costumed hospitality teams and character work, with the brief form.
- Include both guarantees; the rate and late-finish terms (parties run late: +25% after midnight, overruns in 30-minute blocks); a "book early, December dates go first" message with no invented scarcity numbers; what to tell us when you enquire (date, times, guest numbers, venue, service style); 3 or 4 FAQs; and calls to action for the quote form and phone.
- Reuse the Halloween page's structure and components where they fit.

Also:

- On `/special-events`, switch the Christmas card from "In development" to live and link it here.
- On `/hire`, add a short "Booking a Christmas party?" line linking here.
- A note for me, not a build task unless it's trivial: after 31 October the Halloween page should switch to "now booking for next year" wording. Keep the page live; it'll rank next year.

Checks: the new page checklist, and the brief form submits and arrives wherever Halloween submissions arrive.

## Phase 3: Service pages

Build these under `/hire/` (confirm the route pattern in Phase 0), following the new page checklist. Each page covers: what the role or occasion involves at our events, who books it, what to tell us when you enquire, the rate and minimums, both guarantees, 3 or 4 FAQs answered only from the facts sheet or my answers (anything else goes on the TODO list), and calls to action. Where headcount matters, offer to recommend numbers for their event rather than publishing ratios.

1. **Waiting staff**, `/hire/waiting-staff`
   Title: "Waiting Staff Hire in London | VERGO Staffing". Main phrase: "waiting staff hire London".
   Angles: drinks receptions, canapés, seated dinners, clearing; briefed on the running order and service style before they arrive.

2. **Bar staff**, `/hire/bar-staff`
   Title: "Bar Staff Hire in London | VERGO Staffing". Main phrase: "bar staff hire London".
   Angles: receptions, parties, pop-ups and venue overflow; working to the client's drinks list and bar set-up; what to tell us (guest numbers, what's being served, bar layout, timings). Say we supply people only, if I confirm that.

3. **Kitchen porters**, `/hire/kitchen-porters`
   Title: "Kitchen Porter Hire in London | VERGO Staffing". Main phrases: "kitchen porter hire London", "kitchen porter agency London".
   Angles: wash-up, clearing down and keeping the kitchen moving through service; one-off events and regular cover for caterers, venues and production kitchens; early starts and long days.

4. **Weddings**, `/hire/weddings`
   Title: "Wedding Staff Hire in London | VERGO Staffing". Main phrase: "wedding staff hire London".
   Angles: for couples, planners and venues where staff aren't included (dry-hire venues, for example); staff briefed on the day's running order (drinks reception, dinner, evening); late finishes and the after-midnight rate; links to the waiting staff and bar staff pages.

5. **Film and TV catering**, `/hire/production-catering`
   Title: "Catering Staff for Film & TV Productions | VERGO Staffing". Main phrases: "production catering staff", "film set catering staff".
   Angles: cooks and chefs (quoted individually), kitchen porters and catering assistants for production caterers and studio kitchens; long days, early starts and the same crew week to week. If I OK it, mention that we currently run an ongoing kitchen crew for a production caterer, in general terms only. Never name the client, studio or production.

Then update `/hire`:

- Change the H1 from "Skilled workers for your events" to "Event staff for hire in London", keeping the current intro paragraph under it.
- Link each role in the "One rate for waiting staff, bar staff, kitchen porters, runners and hosts" line to its page.
- Add a short "By occasion" row near the bottom: Weddings, Film & TV catering, Christmas parties, Special events.

Checks: the new page checklist for each page. No two pages share a title, H1 or description, and each page's copy is distinct.

## Phase 4: Navigation, header and footer

- One consistent header and footer on every public page (they currently differ between pages). Keep the links in the static HTML rather than injecting them client-side, so crawlers see them. If the header and footer are hand-copied into each file, propose the simplest way to keep them in sync (a small include/build step, or a script that updates every file) and ask me before adding tooling.
- Desktop nav:
  - **For clients** (dropdown): Hire staff & rates (`/hire`), Waiting staff, Bar staff, Kitchen porters, Weddings, Film & TV catering, Get a quote (`/hire/quote`)
  - **Special events** (dropdown): Halloween, Christmas parties, All special events
  - **Apply for work** (`/work`)
  - Phone: 07944 505783
- Dropdowns must work by tap and keyboard, not hover alone. Use the disclosure pattern (a `<button>` with `aria-expanded` controlling a list of links), close on Escape and on outside click, and show visible focus states.
- Mobile: a menu button opening a panel with the two groups as expandable sections. Keep the phone number visible without opening the menu.
- Footer: add a Services column linking all five service pages, Christmas and Halloween, alongside the existing links (For clients, Apply for work, Special events, Blog, Terms of business, Privacy, Legal) and the company details.

Checks: identical header and footer on every public page; a keyboard-only run-through of both menus; a mobile check at 375px.

## Phase 5: Homepage

Keep the H1 ("Event and hospitality staff across London") and the two entry points (clients and workers). Below them, add roughly in this order:

1. **What we supply.** Each role with one line, linking to its page. Senior roles quoted individually.
2. **Our two guarantees.** Same-day confirmation; a no-show replaced within the hour or not charged.
3. **Rates in brief.** £19/hr per person, four-hour minimum, no booking fees, with a link to /hire.
4. **Who we work with.** Corporate events, weddings, private parties, venues and caterers needing overflow, production kitchens, each linking to its page where one exists.
5. **How it works.** The three steps from /hire.
6. **Founder section.** Short, first person, from the lines I confirm.
7. **Proof.** Testimonials, photos and recent work (see Phase 6), only rendered once real content exists.
8. **FAQ.** Minimum booking; how quickly we confirm; what happens if someone doesn't show; whether staff are employed and insured; what staff wear; which areas we cover; cancellations and payment terms. Use whatever pattern fits the site (for example `<details>`/`<summary>`).
9. **Final call to action.** Get a quote, plus the phone number.

Aim for roughly 500 to 800 words of real copy in total. Summarise and link rather than repeating /hire wholesale.

## Phase 6: Slots for testimonials, photos and recent work

I don't have these yet. Build everything now so adding them later takes minutes.

- **Testimonials.** A styled block (quote, name, role, company) usable on the homepage, /hire and the service pages. Static HTML, not rendered client-side.
- **Photos.** A responsive photo strip component: WebP, explicit width and height, `loading="lazy"` below the fold, descriptive alt text.
- **Recent work.** A compact strip (event type, area, headcount, roles). Use any entries I gave you in Phase 0; otherwise don't render it.
- Don't leave empty or visible placeholder blocks on live pages. Either mark where each block goes with a clear HTML comment, or keep ready-to-paste snippets in the content guide.
- **Share images.** Make `og:image` settable per page (1200×630). The default stays the logo until I supply photos.
- **Image script.** A simple script (e.g. `npm run images`) that takes photos from an input folder, resizes them (for example 1600px and 800px wide), converts them to WebP and strips EXIF and GPS data. Use `sharp` as a devDependency if that's straightforward, but ask me first.
- **Content guide.** Write `docs/CONTENT-GUIDE.md` covering how to add a testimonial, a photo (file names like `bar-staff-corporate-event-mayfair.webp`, and alt text that describes the scene), a recent-work entry, a blog post and a new service page (include the new page checklist).

## Phase 7: Structured data and sitemap

- Homepage: one JSON-LD block of type `EmploymentAgency` (a LocalBusiness subtype) with name "VERGO Staffing", legalName "Vergo Ltd", url, logo, telephone "+447944505783", email, an address matching the footer, areaServed London, and `sameAs` with the Google Business Profile URL. Check for existing JSON-LD first and merge rather than duplicate.
- Blog posts: `BlogPosting` (headline, datePublished, author matching the post's byline).
- No review or rating markup.
- Validate that every JSON-LD block parses (a quick script is fine).
- `sitemap.xml`: every public, indexable page with absolute URLs and `lastmod`. Nothing that redirects or is `noindex`.

## Phase 8: Blog

- A post template matching the existing post, with the publishing steps (card on /blog, sitemap entry, internal links) in the content guide.
- Add links from the existing PAYE post to /hire and the most relevant service pages, if it doesn't have them already.
- Draft one post and keep it unpublished (not linked, not in the sitemap, `noindex` until I approve it): "How many staff do you need for your event?" A practical guide by service style (seated dinner, buffet, canapés and drinks, bar, kitchen), linking to the service pages and the quote form. Mark every ratio or number with `<!-- CHECK: Will to confirm -->`.

## Phase 9: Final QA and handover

- The test suite passes.
- Crawl the site locally with a simple script: no broken internal links, no redirect chains, every URL returns 200 or its intended 301.
- Output a table of every public page: URL, title (with length), meta description (with length), canonical, H1, indexable, in sitemap. Flag anything missing or duplicated.
- Every page checked at 375px: the nav works by tap and nothing scrolls sideways.
- List every place the £19 rate now appears, so future rate changes are easy.
- Handover summary: what changed; my TODO list (testimonials, photos, founder lines, Business Profile link, blog draft numbers, and anything you couldn't answer from the facts sheet); and this post-deploy checklist:
  - Check `vergo-app.fly.dev` first, then purge the CDN cache if `vergoltd.com` still shows old pages.
  - `curl -I` each redirect on the live domain.
  - Search Console: submit `sitemap.xml`, request indexing for the Christmas page and the new service pages, and check the Pages report for 404s.
  - Google Business Profile: confirm it shows 07944 505783, add services matching the new pages, and post the Halloween and Christmas offers linking to their pages.

## Done means

- All phases committed on `seo-overhaul`, with nothing deployed without my say-so.
- No invented facts anywhere.
- Tests pass, no broken links, and every new page passes the checklist.
