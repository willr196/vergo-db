# VERGO website fix: Claude Code brief

Open Claude Code in the repo root (`C:\Users\willr\Documents\VERGO\vergo-db`). Paste everything between the two lines, from "START OF PROMPT" to "END OF PROMPT". First fill in or change anything in section 0 you don't agree with. The part after END OF PROMPT is your own to-do list. Don't paste it.

---------------------------------------- START OF PROMPT ----------------------------------------

You are fixing every known problem on vergoltd.com, the public website for VERGO Staffing (legal name **Vergo Ltd**, company no. 16627585). This is an audit-driven cleanup, not a redesign from scratch. Work through the phases in order. Commit after each phase with a clear message. Don't deploy until Phase 13 passes and I have approved.

## 0. Decisions (source of truth: use these values exactly)

```yaml
# Pricing
headline_rate_text: "From £18.50/hr"
standard_rate: 18.50        # waiting staff, bar staff, kitchen porters, runners, hosts/front of house
premium_rate: 24.00         # CHANGE IF NEEDED
premium_definition: "2+ years' event experience. Silver service, cocktails, weddings, high-end corporate."
premium_enabled: true       # confirmed: a separate Premium pool exists
themed_rates: { themed_hospitality: 22, performers: 30, makeup_artists: 40 }   # unchanged
minimum_hours: 4
overrun_block_minutes: 30
after_midnight_uplift_pct: 25
senior_roles_quoted: "Chefs and managers quoted separately."
payment_terms: "First booking paid upfront, then 14 days."
cancellation: "Free 48h+ before. 10% within 48h, 25% within 24h."

# Guarantees (short on purpose: these appear on many pages)
confirmation_promise: "Enquire by 6pm, get confirmed names the same day. After 6pm, by 10am."
no_show_promise: "Replacement on site within an hour. You never pay for time nobody worked. No replacement, no charge for that shift."
no_show_extra: ""           # optional, e.g. " Plus 10% off the booking." Leave empty for none.
guarantee_footnote: ""      # removed: less wording
favourites_promise: "Ask for staff you liked by name. Anyone who wasn't right won't be sent again."

# Employment status
employment_short: "Hospitality staff employed by us on PAYE."    # used on marketing pages
employment_line: "Our hospitality staff are employed by us on PAYE, with payslips, holiday pay and a pension where it applies. Some specialist roles (chefs, cooks, performers and makeup artists) may be self-employed, and we confirm this in writing when you book."   # used only in Terms §6, About (none), blog FAQ

# Workers
worker_pay_line: "From £12.71/hr plus 12.07% holiday pay. More with experience."   # CHANGE IF you pay under-21s a different rate
canonical_roles: [Waiting staff, Bar staff, Kitchen porters, Runners, Hosts and front of house, Chefs and cooks]

# Contact and identity
founder_name: "Will Robb"
public_email: "wrobb@vergoltd.com"     # switch to hello@vergoltd.com ONLY once that mailbox exists
jobs_email: ""                          # e.g. jobs@vergoltd.com once it exists; empty = use public_email
phone: "07944 505783"
whatsapp_url: "https://wa.me/447944505783"
registered_office: "96 Sulivan Court, London, SW6 3DB"   # change if you move to a registered office service
instagram: "https://www.instagram.com/vergo.ltd/"
google_reviews_url: ""                  # paste your Google Business Profile review link; empty = no link rendered
slogan: "Whatever the job, we get it done."   # the only slogan. Remove "Wherever you go, VERGO." everywhere.

# Legal values (EMPTY = remove the sentence cleanly; never print a placeholder)
ico_registration_number: ""
employers_liability_insurer_and_policy: ""
public_liability_insurer_and_policy: ""
transfer_extended_hire_weeks: 8          # confirm with solicitor
transfer_fee: "15% of the worker's gross pay for their first year with you"   # confirm with solicitor
liability_cap: "the total charges for the booking concerned"                  # confirm with solicitor

# Content choices
homepage_h1: "London event staff, confirmed by name the same day"   # the promise; the category stays in the <title>
food_and_bar_supply: "partner"   # "partner" = we arrange food/bar through partners and staff it; "direct" = VERGO supplies food and drink itself (ONLY if registered food business + licensing in place)
halloween_images_are_real_vergo_events: false   # false = caption them as styling examples
theme: "swap"                    # "swap" = replace gold with green accent on light background (Phase 11); "keep" = leave colours

# Word budgets: visible words inside <main>, excluding forms, the shared rate block and the shared guarantee block. Legal pages and the blog are exempt.
word_budgets:
  home: 220
  hire: 220
  role_pages: 160          # waiting-staff, bar-staff, kitchen-porters
  weddings: 180
  production_catering: 200
  christmas: 220
  halloween: 550           # every offering stays; only descriptions shrink
  special_events: 120
  book_an_event: 150
  about: 150
  work: 180
  gallery: 50
  quote_and_apply: 80      # intro and help text only
```

## 1. Context

- Monorepo. Backend: TypeScript / Fastify / Prisma / Neon Postgres, deployed on Fly.io. Frontend is plain static HTML, vanilla JS and plain CSS under `apps/api/public/`.
- Pages include `index.html`, `hire.html`, `hire/*.html`, `hire/quote.html`, `rates.html`, `work.html`, `work/apply.html`, `about.html`, `book-an-event.html`, `special-events*.html`, `gallery.html`, `blog/*`, `terms.html`, `privacy.html`, `legal.html`. Find the real list yourself.
- Sitewide config lives in `apps/api/public/vergo-site-config.js`, with `vergo-public-shell.js` and `vergo-whatsapp.js` alongside it.
- Rate logic is currently spread across `apps/api/src/config/pricing.ts`, `apps/api/src/__tests__/pricing.test.ts`, `apps/api/public/pages/js/rates.js` and `apps/api/public/pages/js/quote.js`. There is no single source of truth.
- The blog is generated by `tools/blog/build.js`, which also writes the BLOG block of `sitemap.xml`.
- `vergo-app.fly.dev` is the uncached origin. `vergoltd.com` sits behind a CDN.
- **The live site is serving stale, mixed versions.** In one 20-minute window, vergoltd.com/hire showed £19.00 on one fetch and £18.50 on the next. `/hire/production-catering`, `/special-events` and `/blog` on vergoltd.com were older than origin. Visitors are seeing different prices depending on which cached copy they get. Phase 1 fixes this.

## 2. Ground rules

1. **Never invent facts.** That covers reviews, client names, numbers, credentials, certifications, awards, photos and staff counts. If something needs a fact I haven't given you, leave it out and list it in the final report.
2. **No placeholders on public pages, ever.** That means no `[TO CONFIRM]`, "TBC", "coming soon", "First draft", "in development", lorem ipsum, or `*-placeholder.*` assets. If a value in section 0 is empty, rewrite the sentence so it reads naturally without it, or remove it.
3. **One value, one place.** Every price, promise and term must come from section 0. The wording must be identical across pages, meta descriptions, the calculator, the blog and the Terms.
4. UK English and £. Keep the existing voice: plain, short, specific. No hype words ("premium experience", "seamless", "world-class").
5. Keep URLs stable unless this brief says to redirect. `/special-events/halloween` is in season, so don't move it.
6. Don't touch the admin panel except where a public form's field list changes (update validation, Prisma schema/enums and admin display to match).
7. After each phase, run the existing tests plus the new consistency test from Phase 13.
8. **Halloween is peak season and must keep selling throughout this work.** Never take `/special-events/halloween` or its enquiry form offline, even briefly. If I want a fast first release, ship these first as one deploy:
   - Phase 1 (cache)
   - The Halloween fixes in Phases 7 and 7b
   - The seasonal header item and banner in Phases 7 and 8
   - The homepage Halloween section in Phase 9
   The rest follows.

## 3. Phase 0: Prep and audit (no edits yet)

1. Run `git status`. If there are uncommitted changes, show me a one-line-per-file summary and ask before committing or stashing them. Earlier uncommitted work is the reason local and live disagreed before.
2. Run these searches across `apps/api/public`, `apps/api/src` and `tools/blog`, and print the hits grouped by file. They are your worklist.
   - `18\.50|19\.00|£19|19 pounds|18\.50 pounds|pounds an hour`
   - `TO CONFIRM|TBC|coming soon|First draft|In development|placeholder|lorem`
   - `Wherever you go|small enough to mean it|no surcharges|Someone doesn't show, you don't pay`
   - `self-employed|All staff employed on PAYE|Every VERGO worker|everybody who works a VERGO shift`
   - `Private client|Lorraine, Host|Jake, Chef|VERGO Events|William Robb|Back to /`
   - `8am and 10pm|8am–10pm|8am-10pm`
   - `Squid Game|Saw|Tim Burton`
   - `We supply people only|photography|manual labour`
   - `Date of birth|dob|dateOfBirth` (public apply form and API)
3. List every public HTML page and whether it uses the shared shell (header/footer from `vergo-public-shell.js`) or hard-codes its own.

## 4. Phase 1: Stop the live site serving stale pages

1. Work out which CDN fronts vergoltd.com: check response headers (`cf-cache-status`, `x-cache`, `age`, `via`, `server`), the DNS and the Fly config. Tell me what it is.
2. In Fastify static serving, set:
   - HTML and extensionless page routes: `Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=30`.
   - CSS, JS and images: add a cache-busting query `?v=<short git sha>` to every asset reference at build/deploy time, or fingerprint filenames. Then serve them with `max-age=31536000, immutable`. If neither is feasible, use `max-age=300`.
   - `sitemap.xml` and `robots.txt`: `max-age=300`.
3. If it's Cloudflare, add a purge-everything step to the deploy script, using env vars `CLOUDFLARE_ZONE_ID` and `CLOUDFLARE_API_TOKEN`. Skip the step with a warning if they're unset. For any other CDN, add the equivalent step.
4. Add `X-Robots-Tag: noindex` on every response where the `Host` is not `vergoltd.com`. That stops `vergo-app.fly.dev` getting indexed while it stays usable for checks. Check that `www.vergoltd.com` 301s to the apex domain.
5. Write `tools/verify-live.mjs`. It fetches every sitemap URL from both vergoltd.com and vergo-app.fly.dev, normalises the host names, and reports any page where the main content differs. It runs in Phase 13.

## 5. Phase 2: One source of truth for prices and terms

1. Make `apps/api/src/config/pricing.ts` the canonical store for every value in section 0 under Pricing, Guarantees and employment_line.
2. Generate `apps/api/public/vergo-site-config.js` from it at build time, or serve it from a Fastify route built from `pricing.ts`. Either way `quote.js` and `rates.js` read from it and hard-code nothing.
3. Because the pages are static, rates still appear in HTML text and meta descriptions. Add a build step (`tools/render-tokens.mjs`) that replaces tokens such as `{{STANDARD_RATE}}`, `{{PREMIUM_RATE}}`, `{{HEADLINE_RATE}}`, `{{CONFIRMATION_PROMISE}}`, `{{NO_SHOW_PROMISE}}`, `{{EMPLOYMENT_SHORT}}`, `{{EMPLOYMENT_LINE}}`, `{{PAYMENT_TERMS}}` and `{{CANCELLATION}}` in the HTML at build time. The HTML that ships must contain the real values, not tokens, so crawlers see them. If a token build step doesn't fit this repo, keep the literal text but have the Phase 13 test enforce that it matches `pricing.ts`.
4. Build one rate block, one guarantee block and one "Working with us" block as shared partials or snippets, and use them on every page that shows rates. Those pages are `/hire`, the three role pages, `/hire/weddings`, `/hire/production-catering` and `/special-events/christmas`. There must be no hand-written copies.

## 6. Phase 3: Pricing (Standard and Premium, uplift, calculator)

**Rate block copy.** Use this exact structure everywhere a rate block appears:

> **From £18.50/hr** per person
>
> **Standard, £18.50.** Waiting, bar, kitchen porters, runners, hosts.
>
> **Premium, £24.00.** {premium_definition}
>
> 4-hour minimum · 30-min overrun blocks · +25% after midnight · No booking or uniform fees · {senior_roles_quoted} · {payment_terms} · Cancellation: {cancellation}

Show that last line as compact small print (a tight list or two columns), not as full-size bullets.

Rules for the block:
- Delete every "no surcharges" claim. The midnight uplift is a surcharge. The line is "No booking fees and no uniform charges" and nothing more.
- If `premium_enabled: true`, style the Premium card on its own: dark background, and the only place the old black-and-gold look survives if `theme: swap`. This is one card only. Premium gets no page, no nav item, no separate tone of voice and no separate imagery.
- If `premium_enabled: false`:
  - Drop the Standard and Premium lines and the Premium card everywhere.
  - The block reads "**£18.50** per hour, per person", with the list underneath.
  - `headline_rate_text` becomes "£18.50/hr" (without "From").
  - The calculator has no service-level choice.
  - Terms §2 lists a single rate.

**Hero and meta.** The homepage hero proof line and every meta or OG description that mentions price use `From £18.50/hr`. Remove "£19.00" and "19 pounds" everywhere.

**Quote calculator** (`/hire/quote`, `quote.js`):
1. If `premium_enabled`, add a "Service level" choice (Standard / Premium) for the whole booking, with Standard as the default. Show the definition under it.
2. Apply the 4-hour minimum per person, 30-minute overrun blocks and +25% on hours after midnight. The "finishes the next day" checkbox must shift the finish time past midnight correctly.
3. Show a breakdown: people × hours × rate, then the midnight uplift line, then the total. Keep "Senior roles quoted individually" outside the total, as now.
4. Next to "Book these staff", add: "Nothing is charged until we confirm names. First booking: paid in advance once confirmed."
5. Add "Christmas or seasonal party" to the event types.
6. Make the role list match `canonical_roles`: merge "Front of house" and "Hosts" into "Hosts and front of house", and list "Chefs and cooks" under senior roles. Update the API validation and Prisma enums if the roles are enumerated there.
7. Change the meta description to "Work out the cost yourself, from £18.50/hr per person, four-hour minimum…".

**Tests** in `pricing.test.ts` must cover:
- Standard 4h
- Premium 4h (only if `premium_enabled`)
- A 3h booking billed as 4h
- A 5h10m booking billed as 5h30m
- A 20:00–01:00 booking with 1h at +25%
- An overnight 22:00–02:30 booking
- A mixed-roles booking
- A senior role excluded from the total

## 7. Phase 4: Guarantees

Use one shared guarantee block on every page:

> **Our guarantees**
>
> **Names the same day.** {confirmation_promise}
>
> **Replacement within the hour.** {no_show_promise}{no_show_extra}

If {guarantee_footnote} is empty, the block has no footnote line.

- Remove the headline "Someone doesn't show, you don't pay." It over-promises.
- Remove "We can because we're small enough to mean it."
- Replace every "Enquiries between 8am and 10pm get a same-day answer" / "you get confirmed names back the same day, between 8am and 10pm" with wording that matches {confirmation_promise}. This affects the About page, all role pages, weddings, production, Christmas, the blog footer CTA and the Terms.
- Add {favourites_promise} as a bullet in "Working with us" on `/hire`.

## 8. Phase 5: Employment status wording

The site currently contradicts itself:
- The Terms say some workers may be self-employed.
- The blog says every VERGO worker is PAYE.
- The quote page footer says "All staff employed on PAYE".
- `/work` says "PAYE for employed roles".

Performers, makeup artists and some chefs are not PAYE. Fix it like this:

1. Use {employment_short} on `/hire` (Working with us), the About page and the homepage trust strip. Use the full {employment_line} only in Terms §6 and the blog FAQ.
2. Quote page footer: delete "All staff employed on PAYE." The footer carries only the standard company line.
3. `/about`: replace "Our employed team get holiday pay, pension and payslips, not a self-employed invoice" with {employment_short}.
4. `/work` stays as it is ("Employed. You're on our payroll…"), because that page is only about hospitality roles. Change the meta description to "Properly employed hospitality and event work across London. Payslips, holiday pay, pension." and drop "no self-employed dodges".
5. Blog post `/blog/paye-vs-self-employed-event-staff`:
   - "In short" bullet 2 becomes "Our hospitality staff are PAYE on casual worker contracts, so payroll, holiday pay and employer National Insurance sit with us rather than with you."
   - "In short" bullet 5 becomes "Our published rate starts at £18.50 an hour per person with a four-hour minimum, and there are no booking fees or uniform charges."
   - The FAQ heading "What does the 19 pounds an hour actually include?" becomes "What does the £18.50 an hour include?" Its answer says "no booking fees and no uniform charges" and removes "no surcharges".
   - **Delete** the paragraph starting "On the kitchen porter work we do, the client's chefs tell the porters what to do…". Replace it with a general version that doesn't describe any of our own contracts: "On a typical hospitality booking, the client's team directs the work hour to hour, the venue provides the equipment, and staff are paid for a shift rather than a result."
   - Change "We reached the same answer for our own roster. We tried self-employed and it did not work for this kind of work, so everybody who works a VERGO shift is PAYE." to "That's why our hospitality staff are PAYE."
   - Change "One catering company we work with runs around 110 staff hours a week. At that volume the allowance is gone before the year is out" to "A caterer running around 110 staff hours a week would use it up before the year is out".
   - Replace "14.67 pounds"-style amounts with £ amounts throughout, e.g. "£14.67".
   - FAQ "Are VERGO staff employed or self-employed?" answer becomes {employment_line}.
   - Update the "Last updated" date.
6. `/hire/production-catering` case study: leave it as is, but flag it in the final report for me to check against the contract.

## 9. Phase 6: Legal pages and the apply form

**All three legal pages**
- Delete the "First draft: not yet reviewed by a solicitor…" banners.
- Remove every `[TO CONFIRM…]`, following ground rule 2.
- Use "Vergo Ltd" as the legal name consistently.
- Give each page the full shared header and footer. Today they only show a phone number.

**Terms (`/terms`)**
- §1 Enquiries and bookings: keep the estimate/confirmation text and replace "confirmed quickly" with {confirmation_promise}.
- §2 Rates and charges: add Standard and Premium rates, the midnight uplift, the themed and performer rates ("as published on our special events pages"), "Full events (food, bar and staff) are quoted individually and the quote sets out what's included", and "no booking fees or uniform charges". Remove "or other surcharges".
- §3 Payment: {payment_terms}. Add: "For business clients we may charge interest and compensation on late payments under the Late Payment of Commercial Debts (Interest) Act 1998."
- §4 Cancellation: {cancellation}, and keep the reduce-numbers sentence.
- §5 Guarantees: the exact text of {confirmation_promise} and {no_show_promise}{no_show_extra}.
- §6 Employment status, right to work and insurance: {employment_line}. Keep the right to work line. Insurance: "We hold employers' liability and public liability insurance. Certificates are available on request." Add the insurer and policy only if provided.
- New §7, Your responsibilities as the hirer:
  - Tell us about any health and safety risks at the venue and what's needed to manage them, before the booking.
  - Give staff a safe place to work, access to breaks, water and toilets.
  - Direct staff only within the roles booked.
  - Confirm the hours worked at the end of each shift (a message is fine).
- Temp-to-perm section (renumbered): fill in {transfer_extended_hire_weeks} and {transfer_fee}.
- Liability: fill in {liability_cap}.
- New short section, "If you're booking as a private individual": explain in plain words that the cancellation charges above apply, and that nothing in these terms affects your statutory rights.
- Use sentence case on every heading (today there's a mix of "Rates and Charges" and "Changes and Cancellation").
- Add a "Last updated" date at the top.

**Legal (`/legal`)**
- Fill in the ICO number if provided. If it isn't, remove the "registered with the ICO" sentence and list the gap in the final report.
- Fill in the insurers if provided. If not, use the certificate-on-request line.
- Replace the Employment Rights Act paragraph with: "The Employment Rights Act 2025 is changing rules for agency and zero-hours workers in stages through 2026 and 2027. We'll update these terms as each change takes effect."
- Keep the Fair Work Agency line and the complaints section. Complaints go to {public_email}.

**Privacy (`/privacy`)**
1. Name the processors, with their regions read from config:
   - **Fly.io:** hosting. Get the `primary_region` from `fly.toml`.
   - **Neon:** database. Get the region from the connection string host.
   - **Amazon Web Services S3:** CV storage. Get the region from the env/config.
   - **Resend:** transactional email, US-based. Note that US transfers rely on the UK–US data bridge or appropriate safeguards.
   - **Google Analytics:** only with cookie consent.
   - **WhatsApp (Meta):** used for booking confirmations and messages.
   Replace the `[TO CONFIRM: depends on final hosting…]` line with that real list.
2. Remove the sentence saying worker onboarding "needs its own privacy information before it goes live". Add a section **"If you work for us"** covering:
   - What's collected: right-to-work documents, NI number, bank details, date of birth, emergency contact, pay records.
   - Why: employment contract and legal obligations.
   - Who it's shared with: HMRC, the pension provider, the payroll software.
   - Retention: right-to-work copies for the length of employment plus 2 years; payroll records for at least 3 years after the tax year they relate to; other employment records for 6 years after employment ends.
3. Make sure a "Cookie settings" link actually exists in the footer of every page, as the notice promises. If the cookie banner injects it, confirm it renders on every page, including legal pages and the blog.
4. Fix the date-of-birth contradiction (see below).

**Apply form (`/work/apply`)**
- **Remove the Date of birth field.** The privacy notice says we don't collect DOB on this form, and the 18+ checkbox already covers eligibility. Remove it from the HTML, the API validation, the Prisma write (keep the column if needed, but make it nullable) and the admin display.
- Make the role checkboxes match `canonical_roles` (add Chefs and cooks, and merge Front of house with Hosts). Make `/work` list the same roles.
- Change the consent checkbox wording to "I've read the privacy notice." Our lawful basis for applications is steps before a contract, not consent.
- If {jobs_email} is set, use it for applicant-facing contact.

## 10. Phase 7: Placeholders, dead content and contradictions, page by page

**About (`/about`)**
- Remove the "Photo coming soon" text or element. If `/images/about/founder.webp` exists and loads, keep the image with explicit width and height. If it doesn't, remove the figure entirely.
- Rewrite the whole page as follows (about 120 words):
  - H1: "About VERGO"
  - Lede: "London event staff, picked and briefed by the founder."
  - **Why VERGO:** "I grew up in my family's event-staffing business, where the job was sending the right person, not whoever was free. Apps now post shifts for anyone to accept. VERGO does it properly: everyone interviewed, every booking briefed, one person accountable."
  - Caption: "{founder_name}, founder"
  - **How we work:** four bullets.
    - Everyone interviewed by me
    - Every booking briefed
    - {employment_short}
    - Right to work checked, fully insured
  - **What we do:** four links, labels only.
    - Hire staff → `/hire`
    - Full events → `/book-an-event` (today "Full events" wrongly points to /special-events)
    - Themed and seasonal → `/special-events`
    - Work with us → `/work`
  - Delete "one direction and no other", "Great prices, and great solutions", "Our staff love the work they do, and they want to grow alongside the company", and every "Wherever you go, VERGO."
- Use "Will Robb" consistently. The blog byline already uses it; the About page and its meta description say "William Robb".

**Hire (`/hire`)**
- Hero: remove "And any other niche role you'd like, just let us know and we'll do our best to make it happen: photography, manual labour and so on." Keep one line linking to full events.
- Testimonial attributions: "Lorraine, Host" becomes "Lorraine, private party, London". "Jake, Chef" becomes "Jake, head chef, [type of client, only if known]"; if the client type isn't known, just "Jake, head chef". "Host" and "Chef" read like our own staff roles.
- If {google_reviews_url} is set, link the Google review to it: "Read our Google reviews".
- Keep "Recent work".

**Role pages, weddings and production catering**
- Replace "We supply people only. …" with "On a staff booking we supply people only: [stock / glassware / equipment] stays with you or your caterer. Want the food and bar handled too? See [full events](/book-an-event)." The homepage currently sells food and bar while these pages say we don't.
- Swap in the shared rate block and guarantee block (Phases 3 and 4).

**Full events (`/book-an-event`)**
- If `food_and_bar_supply: partner`:
  - Reword "We can do the food, bring the whole bar…" to "We arrange the food and the bar through caterers and bar partners we trust, and staff the whole event ourselves: one company to deal with, one number to call."
  - Change "we will put a menu together" to "we'll come back with menu options".
  - Change "We can bring the bar with us: the drinks, the set-up and the bartenders to run it" to "We can arrange the whole bar (drinks, set-up and bartenders), or just the bartenders if the venue has the rest."
- Remove "plus anything more niche, like photography or manual labour for the set-up and clear-down".
- Change "If you only need staff, the standard £18.50/hr rate" to "If you only need staff, rates start at £18.50/hr".
- Don't add proof you don't have. If there are no photos of food or bar work, don't use stock images.
- Add a short section before the enquiry form, "Seasonal and themed events", linking to `/special-events`, Halloween and Christmas. This page is now the "Events" entry in the header, so it has to lead to the themed work too.

**Special events (`/special-events`)**
- Replace every "In development" label with "Taking enquiries" or "On request".
- Every "Send us the brief" links to `#brief` on this page, never to `/special-events/halloween#build`.
- Title suffix "| VERGO Staffing"; `theme-color` the same as the rest of the site; OG image per Phase 12.

**Halloween (`/special-events/halloween`)**
- Keep every offering on the page. Phase 7b shortens the descriptions but removes none of these:
  - all nine services
  - the three levels of involvement
  - the five concepts
  - all ten decor themes (three renamed, below)
  - makeup and SFX
  - the £22, £30 and £40 rates and the bespoke items
  - the "Build your team" form
  The only other changes are the ones listed here.
- H1 "HALLOWEEN  SPECIAL" (double space, all caps) becomes "Halloween event staff and performers in London", with the eyebrow "Halloween by VERGO".
- Remove `halloween-makeup-placeholder.svg` and its figure. Only use a real photo if one exists in the repo.
- If `halloween_images_are_real_vergo_events: false`, change the captions "Themed bar staff" and "Waiting staff in character" to "Styling example: themed bar" and "Styling example: waiting staff in character". Alt text stays descriptive.
- Rename decor themes that use other companies' names or characters, and remove the disclaimer line about film and TV themes:
  - "Squid Game" becomes "Deadly Games" ("Pink-suited guards, a playground gone wrong.")
  - "Saw" becomes "The Trap Room" ("Rust, tiled walls, a game you didn't agree to.")
  - "Tim Burton" becomes "Gothic Whimsy" ("Stripes, crooked lines, spindly shadows.")
  Update the enquiry form options to match.
- Leave the themed rates as they are.

**Christmas (`/special-events/christmas`)**
- Use the shared rate block, which removes "no surcharges".
- The "Send us the brief" link goes to `/special-events#brief`. Check that anchor exists after the Phase 1 purge.

**Work (`/work`)**
- Pay row: {worker_pay_line}. "Above the legal minimum" isn't true for staff paid the floor.
- Make the roles list match `canonical_roles`.

**Homepage links**
- Remove "Looking for work? See shifts →" from where it is now. No shifts are listed anywhere. The only worker link on the homepage is one quiet line under the final call to action (Phase 9). Nothing for workers goes in the hero or near "Get a quote".

**Seasonal banner** (replaces the homepage "Booking now:" line)
- Add a slim, dismissible banner above the header on client-facing pages only: not on `/work`, `/work/apply`, the legal pages or the blog.
- Date-driven:
  - "Halloween staff and performers: now booking →" from 1 September to 31 October, linking to `/special-events/halloween`.
  - "Christmas party staff: now booking →" from 1 September to 20 December, linking to `/special-events/christmas`.
  - When both apply, show both links in one banner.
  - Outside those dates, show nothing.
- Use a small script. The no-JS fallback shows nothing, so the banner can never go stale.
- Remember dismissal for the session only, in a `try/catch` around `sessionStorage`.

**Slogans**
- Remove "Wherever you go, VERGO." from every page, footer and partial.
- {slogan} appears once, in the homepage hero, and once in the `/hire` hero. Nowhere else.

## 10b. Phase 7b: Cut the words

The site says too much. Every page should be scannable in under 30 seconds. Keep the facts; cut the explanation, the reasoning and the adjectives. Budgets are in section 0, and Phase 13 enforces them.

**Rules for every page** (legal pages and blog excepted)
1. A section is a heading of 6 words or fewer, plus either one sentence of 20 words or fewer, or a list of up to 5 items of 8 words or fewer each. No paragraph runs longer than two sentences.
2. Say each thing once per page. The rate block and the guarantee block appear once per page at most.
3. Each page ends with one call-to-action block: a heading of 5 words or fewer, the button, then phone and WhatsApp. At most one button per section otherwise.
4. FAQs: at most 3 per page (Halloween gets 4), with answers of 2 sentences or fewer. Delete any FAQ that repeats the rate block or the guarantees.
5. Delete these sections wherever they appear:
   - "Who books … from us"
   - "What to tell us when you enquire" (the quote form already asks)
   - Closing paragraphs of cross-links. Replace them with one link row, e.g. "Also: Bar staff · Kitchen porters · Weddings".
6. Headings are labels, not sentences. Cut headings like "Six things and we can price it." together with their sections.
7. Cut commentary lines, for example "The rush lands twice…", "Three different events in one day…" and "It is physical work on long days…".

**Page by page**
- **Home:** see Phase 9.
- **/hire:**
  - Hero: one line.
  - How it works: 3 steps, each a title of 4 words or fewer plus a line of 8 words or fewer.
  - Working with us: exactly 5 bullets:
    - {employment_short}
    - Right to work checked
    - Insured, certificates on request
    - Your dress code, not ours
    - {favourites_promise}
  - Testimonials and "Recent work".
  - "By occasion": 4 link tiles, labels only.
  - Final call to action.
- **Waiting staff, bar staff and kitchen porters:**
  - H1 and a one-line intro.
  - "What they do": 3 one-line bullets, condensed from the existing 01/02/03 blocks.
  - Rate block and guarantee block.
  - 3 FAQs.
  - Link row and final call to action.
- **Weddings:**
  - One-line intro.
  - "How the day runs": 3 one-liners (reception, dinner, evening).
  - Rate block and guarantee block.
  - 3 FAQs: dry hire, how many staff, who directs the staff.
  - Final call to action.
- **Production catering:**
  - One-line intro.
  - Roles: 3 bullets.
  - "Why it's different": 3 one-liners (call sheet, long days, same crew).
  - The case study cut to 40 words or fewer.
  - Rate block and guarantee block.
  - 3 FAQs: 5am calls, same crew, chefs.
  - Final call to action.
- **Christmas:**
  - One-line intro.
  - Roles as a label list.
  - Rate block and guarantee block.
  - The three themed rates as three lines.
  - 3 FAQs: past midnight, how late you can book, how many staff.
  - Final call to action.
  - Cut "Six things and we can price it", "Timing" and the themed-section prose.
- **Halloween** (every offering stays, only the words shrink):
  - Hero: H1, "Themed staff, performers, makeup and decor across London.", and a button.
  - Services: the 9 labels, with no descriptions.
  - Levels: 3 cards, each a title plus one line listing up to 5 examples.
  - Concepts: 5 names, each with its characters on one comma-separated line.
  - Decor: 10 names, each with a tagline of 6 words or fewer.
  - Makeup: two one-line lists.
  - Rates: 3 cards, each with title, price and a line of 12 words or fewer. Then one line: "Specialist performers, decor and full experiences: quoted on the brief. 4-hour minimum."
  - Replace "Two different bookings", "How we cast" and "Who it's for" with one line under the rates: "Themed staff wear the look; performers are cast to act."
  - FAQs: keep 4 (how far ahead to book, costumes, how scary, one or two people).
  - The form is unchanged.
- **Special events:**
  - H1 and one line.
  - Concept cards: a title plus 10 words or fewer.
  - Form.
  - Cut "How it works" and "Planning something out of the ordinary?".
- **Full events:**
  - H1 and one line.
  - Food, bar and people cards, 15 words or fewer each.
  - 3 steps of 8 words or fewer.
  - Seasonal link row.
  - Form.
- **About:** as rewritten in Phase 7.
- **Work:**
  - The pay, holiday and employment table.
  - "What we ask": 3 one-liners.
  - "How to join": 4 steps of 8 words or fewer.
  - 3 FAQs: employed?, do I have to take shifts?, experience?
- **Gallery:** a one-line intro and the photos. Remove the testimonials; they live on `/hire` and the homepage.
- **Quote and apply:** intro and help text of 80 words or fewer in total. Field labels stay clear.

## 11. Phase 8: Navigation, header, footer and accessibility

**One shared header on every public page** (via `vergo-public-shell.js` or partials; no page-specific variants):
- Left: logo linking to `/`.
- Links: Hire staff (`/hire`) · Events (`/book-an-event`) · About (`/about`) · Work for us (`/work`).
- Special events is **not** a permanent header item. People reach it from the seasonal banner, from `/book-an-event` and from the footer. Staffing comes first.
- **Seasonal header item** (same date script as the banner):
  - From 1 September to 31 October, add a highlighted "Halloween" link (`/special-events/halloween`) between Events and About.
  - From 1 November to 20 December, it becomes "Christmas" (`/special-events/christmas`).
  - Outside those dates, there's no seasonal item.
  - It also appears in the mobile menu, directly under Hire staff.
- Right: phone link {phone}, then a "WhatsApp" link ({whatsapp_url}), then the primary button "Get a quote" (`/hire/quote`).
- Mobile: a hamburger menu with the same items, plus full-width "Call", "WhatsApp" and "Get a quote" buttons.
- Build the WhatsApp link through the existing `vergo-whatsapp.js`. If that script also renders a floating chat bubble, remove the bubble so there's one WhatsApp entry point per view, not two.
- Mark the current page with `aria-current="page"` and keep it in the menu. Today pages drop their own link, and the menu changes from page to page.

**Focused pages** (`/hire/quote` and `/work/apply`) keep a minimal header: logo, back link and phone. Change the back-link labels from "Back to /hire" to "← Back to rates" and from "Back to /work" to "← Back to work with us". The raw URL paths are currently shown to users.

**One shared footer on every page**, including the legal pages, blog and focused pages:
- Column 1: Hire staff, Events, Special events, Gallery, About, Blog, Work for us.
- Column 2: Terms of business, Privacy, Legal, Cookie settings.
- Column 3: {public_email}, {phone}, Instagram, and Google reviews if the URL is set.
- Company line: "Vergo Ltd, registered in England and Wales, company no. 16627585. Registered office: {registered_office}. Employers' and public liability insured."
- No slogan, and nothing extra ("All staff employed on PAYE" goes).

**Accessibility**
- Logo: text extraction currently reads "VVERGO". Make it `<a href="/" aria-label="VERGO home">` with the V mark `aria-hidden="true"`.
- Honeypot fields: text extraction currently shows "Leave this field blank". Wrap each in `aria-hidden="true"`, give the input `tabindex="-1" autocomplete="off"`, and hide it off-screen with CSS.
- Every form control has a visible label. Required fields are marked. Error messages are linked with `aria-describedby`.
- Colour contrast is at least 4.5:1 for body text and 3:1 for large text and UI.
- All images have width and height set. Below-the-fold images use `loading="lazy"`.

## 12. Phase 9: Homepage restructure

Rebuild `index.html` in this section order. Reuse existing components and styles; this is a reorder and copy change, not new design.

1. **Hero**
   - H1: {homepage_h1}. It states the promise, not the category. Keep the `<title>` as "Event and Hospitality Staff in London | VERGO Staffing" so the category still ranks.
   - Subline: {slogan}
   - Proof line: "Vetted, briefed staff. {headline_rate_text}, no booking fees."
   - Buttons: "Get a quote" (primary) and "See rates" (`/hire#rate`)
   - Small line under the buttons: "Need someone today? Call {phone} or WhatsApp us." Both are links.
2. **Trust strip.** One row:
   - Google rating: only if {google_reviews_url} is set. Link it, and don't show a star count you can't verify.
   - "Right to work checked"
   - Insurance: "Employers' and public liability insured". Only if the insurer fields are filled, add the insurer name.
   - "PAYE hospitality staff"
3. **Halloween section (date-driven, 1 September to 31 October).**
   - Content:
     - Heading "Halloween: themed staff, performers and makeup"
     - The themed bar photo
     - Three price lines: themed hospitality staff £22/hr, scare actors and character performers £30/hr, makeup artists £40/hr
     - "The last week of October books up first."
     - Button "Build your Halloween team" linking to `/special-events/halloween#build`
   - From 1 November to 20 December, the same slot shows a Christmas version: festive and themed staff, the standard rate, and a link to `/special-events/christmas`.
   - Hidden outside those dates.
4. **Guarantee block** (shared).
5. **Rates.** The shared rate block, compact variant, with "See full rates and terms" linking to `/hire`. If `premium_enabled` it shows the Standard and Premium cards; otherwise just the single rate.
6. **Photo strip.** Four real photos from `/images/gallery/`: bartender pouring, waiter serving, kitchen team, garden dinner table. Add "See the gallery →". The homepage currently has no photos at all.
7. **Recent work and one review.** The four one-line "Recent work" items, plus the Google review only. The other testimonials stay on `/hire`.
8. **Roles grid.** Labels only, no descriptions: Waiting staff, Bar staff, Kitchen porters, Weddings, Film and TV catering, Christmas parties, each linking to its page.
9. **Beyond staff (secondary).** Two short lines: "We can run the whole event: food, bar and staff from one company →" linking to `/book-an-event`, and "Themed and seasonal events →" linking to `/special-events`. Staffing is the main identity, so keep this section small.
10. **Final call to action.** "Got a date in the diary?", then {confirmation_promise}, then "Get a quote", "Call {phone}" and "WhatsApp us".
11. **Worker line.** One quiet line in small, muted text under the final call to action: "Looking for work? Apply to join the team →" linking to `/work`. This is the only worker link on the homepage besides the header and footer.

Change the homepage meta description to: "Waiting staff, bar staff, kitchen porters, runners and hosts across London. From £18.50/hr per person, four-hour minimum, names confirmed the same day."

## 13. Phase 10: Proof plumbing (code only; real content comes from me)

1. Create `apps/api/public/data/proof.json` holding the testimonials (quote, name, context, source, url), the recent work items and the gallery picks. Render the homepage, `/hire` and `/gallery` from it, so adding a review is a one-line change.
2. Admin panel: when a booking is marked complete, show a "Send review request" button. It emails the client via Resend with {google_reviews_url} and a two-line message. Build it only if {google_reviews_url} is set; otherwise add a TODO to the final report. Don't send anything automatically.

## 14. Phase 11: Theme (only if `theme: swap`)

1. Replace the gold with these CSS custom properties on `:root`, and update every hard-coded gold hex:
   - `--bg: #FAF8F4`
   - `--surface: #FFFFFF`
   - `--ink: #16181B`
   - `--muted: #5B6168`
   - `--line: #E4E0D8`
   - `--accent: #1F5C45`
   - `--accent-ink: #FFFFFF`
   - `--accent-soft: #E6F0EB`
2. Make the site background light. Buttons and links use `--accent`.
3. The Premium card (only if `premium_enabled`) is the only dark element on the client pages. There is no Premium page. It keeps a dark treatment:
   - `--premium-bg: #0E0F10`
   - `--premium-ink: #F3F1EC`
   - `--premium-accent: #C9A96A`
4. Set `theme-color` to `#FAF8F4` on every page.
5. Check that the logo mark works on light backgrounds. Use a dark version if needed.
6. Take before and after screenshots of the homepage, `/hire` and `/special-events/halloween` at 375px and 1280px, and save them to `tools/screenshots/` for me. The Halloween page can keep its own dark seasonal styling.

## 15. Phase 12: SEO and technical

1. **Redirects (301):**
   - `/jobs` → `/work` (it's still indexed on Google as "VERGO Shifts" and returns 404)
   - `/blog/how-to-hire-bartenders-london` → `/hire/bar-staff`
   - `/blog/event-staffing-costs-london-2024` → `/hire` (both currently return 410 but still show in Google with "VERGO Events" branding and £17–30 pricing)
   - `/rates` → `/hire` (check it's a 301)
   Also search git history for any other public URL that ever existed (old sitemaps, old HTML filenames) and 301 each one to its closest current page.
2. **Sitemap:** add `/gallery`. Set `lastmod` from each file's last git commit date. Keep the blog generator block working.
3. **robots.txt:** collapse the list of admin paths to `Disallow: /admin`, `Disallow: /api` and `Disallow: /login` (prefix matching already covers `/admin-*`). The current file hands out a map of every admin route. Also send `X-Robots-Tag: noindex` on all admin and login responses.
4. **Titles:** every page ends "| VERGO Staffing". Special events currently uses "| VERGO".
5. **OG images:** make a 1200×630 OG image per key page from the real gallery photos (use `sharp`): homepage, `/hire`, each role page, weddings, production, `/book-an-event`, `/special-events`, Christmas and gallery. Halloween uses its existing hero image cropped. Stop using the logo as every page's OG image. Make the blog OG image consistent (it currently uses `logo.png` in some places).
6. **Structured data:** add JSON-LD to the homepage, typed `EmploymentAgency` (a LocalBusiness subtype):
   - `name` "VERGO Staffing", `legalName` "Vergo Ltd"
   - `url`, `telephone`, `email`
   - `areaServed` "London"
   - `sameAs` Instagram plus the Google profile if set
   - `priceRange` "££"
   Don't add review stars. Self-published review markup isn't eligible and can be flagged.
7. **Meta descriptions:** every description containing a price uses "from £18.50/hr". None says £19.
8. **Blog:** it has one post. Keep it in the footer only, not the header. The blog index keeps working when more posts are added.

## 16. Phase 13: QA (must pass before deploy)

1. **`apps/api/src/__tests__/site-consistency.test.ts`** scans every public `.html` and `.js` file (excluding admin) and fails on:
   - Any of these strings: `TO CONFIRM`, `TBC`, `coming soon`, `First draft`, `In development`, `lorem`, `placeholder` (in visible text or asset paths), `£19.00`, `19 pounds`, `pounds an hour`, `small enough to mean it`, `Wherever you go`, `no surcharges`, `Someone doesn't show, you don't pay`, `Private client`, `Lorraine, Host`, `Jake, Chef`, `VERGO Events`, `William Robb`, `Back to /`, `All staff employed on PAYE`, `Every VERGO worker is PAYE`, `8am and 10pm`, `Squid Game`, `Tim Burton`, `See shifts`.
   - Any header containing a permanent link to `/special-events`. The date-driven Halloween/Christmas item is allowed.
   - **Word budgets.** Count the visible words inside `<main>`, excluding `<form>` elements and the blocks marked `data-block="rates"` and `data-block="guarantees"`. Fail any page over its `word_budgets` value. Legal pages and the blog are exempt.
   - Any `<p>` over 2 sentences, or any FAQ over 3 items (Halloween: 4), outside the legal pages and the blog.
   - `/special-events/halloween` missing any of its nine services, three levels, five concepts, ten decor themes, three rates or the `#build` form.
   - If `premium_enabled: false`, any occurrence of "Premium" or the premium rate on a public page.
   - Any £ amount not in the allowed set taken from `pricing.ts`. Whitelist the blog cost table figures by file.
   - Any rate block, guarantee block or employment line that doesn't match `pricing.ts` exactly.
   - Any internal `href` that doesn't resolve to a file, a route or a known redirect.
   - Any public page missing the shared header or footer marker.
2. **Playwright** (use the pre-installed Chromium): for every sitemap URL at 375px and 1280px, check:
   - no horizontal scroll
   - every image has `naturalWidth > 0`
   - no console errors
   - exactly one `h1`
   - the "Cookie settings" link is present
   Save full-page screenshots to `tools/screenshots/after/`.
3. **Forms:** submit each form locally with email sending stubbed: quote (book and message), book-an-event, special events brief, Halloween build and apply (with a CV). Confirm the DB row and the email payload are correct and that DOB is no longer sent.
4. **Pricing tests** from Phase 3 all pass.
5. **Deploy and verify** (after I approve): `fly deploy`, then purge the CDN, then run `tools/verify-live.mjs`. vergoltd.com and vergo-app.fly.dev must match on every sitemap URL. Spot-check `/hire`, `/hire/production-catering`, `/special-events` and `/blog` on vergoltd.com, because those were the stale ones.

## 17. Final report

Finish with:
1. A table of every change, grouped by phase and file.
2. Every sentence you removed because a section 0 value was empty.
3. Anything you couldn't do and why.
4. Items for me:
   - fill-ins (ICO number, insurer and policy, Google reviews link, hello@ and jobs@ mailboxes)
   - photos needed (founder photo, real Halloween photos, food and bar photos)
   - the production-catering case study to check against the contract

---------------------------------------- END OF PROMPT ----------------------------------------


## Your to-do list (outside the code, don't paste)

0. **Halloween.** Book photographers or take your own photos at every October event. Next year's Halloween page should use real photos, not styling examples.
1. **ICO.** If you haven't yet, pay the ICO data protection fee. You process CVs and payroll data, so you're not exempt. Put the number in section 0.
2. **Insurance.** Get the insurer names and policy numbers. Check your public liability cover includes performers and scare actors, makeup on guests (treatment risk), decor installation, and anything you supply that people eat or drink. If it doesn't, either extend the policy or drop those services.
3. **Food and bar.** Supplying food yourself means registering as a food business with the council at least 28 days before trading, plus food hygiene training and an allergen process. Selling alcohol needs a premises licence or Temporary Event Notice and a personal licence holder. Until those are in place, keep `food_and_bar_supply: partner`.
4. **Terms review.** Get a solicitor to check the Terms, or join the REC (Recruitment & Employment Confederation), which gives members template terms. Confirm the transfer fee and liability cap.
5. **Staff contracts and worker privacy notice.** Your PAYE onboarding is already live, so it needs both now.
6. **Film studio job vs the website.** The site will say hospitality staff are PAYE while that job runs self-employed. Check with your accountant that the public wording and the contract line up. The blog paragraph I've had removed argued the opposite of your KP contract clause.
7. **Mailboxes.** Create hello@ (or bookings@) and jobs@, then update section 0.
8. **Registered office service.** It takes your home address off every page and off Companies House.
9. **Google.**
   - In Search Console: submit the sitemap, request reindexing of the homepage, and use the Removals tool for `/jobs` and the two old blog URLs.
   - Copy your Google Business Profile review link into section 0.
   - Send a review request the same night as every booking.
10. **Proof.**
    - Photograph every booking (with permission).
    - Get real Halloween photos this October.
    - Ask clients such as Schmodel whether you can name them on the site.
11. **Employment Rights Act.** The zero-hours rules (compensation for short-notice shift cancellations) are expected in 2027. Your client cancellation fees will need to cover what you'll owe staff when that lands.
12. **Later.** Register vergoevents.co.uk now and point it at `/book-an-event` until events are big enough for their own site.
