# VERGO Site Copy. Source of Truth

Living document. One page at a time. Feed to Claude Code CLI per page, `/clear` between sessions.

---

## Voice & Copy Rules

Apply these across every page. If a draft breaks one of these rules, the rule wins.

1. **No em dashes.** Use full stops, commas or simple connectors. No `—`, no `–`.
2. **No sales-pitch language.** No "premium", no "bespoke", no "exceptional", no "world-class", no "cutting-edge", no "solutions" as a standalone noun.
3. **No abstract hospitality-speak.** No "the right room needs the right energy", no "cover that keeps service moving", no "teams that fit the room". Concrete nouns and verbs only.
4. **No fabricated stats or testimonials.** Ever.
5. **No stock photography.** Hold image slots empty until real owned assets exist.
6. **First-person on About only.** Other pages stay in third-person, VERGO-as-subject voice.
7. **Short over long.** If a sentence can be cut without losing meaning, cut it. If a section can be removed without the page weakening, remove it.
8. **One idea per page.** Each page owns exactly one job.
9. **Specificity over adjectives.** Replace one generic claim per page with one specific thing only VERGO can say.
10. **No CTA at the bottom of About.** Other pages can close with a CTA if it earns its place.

---

## Tier Model Rules (Legal + Copy)

VERGO operates TWO client-facing tiers. Shortlist is removed entirely, including the +£1/hr bonus mechanic.

### The two client-facing tiers

- **Standard:** Marketplace / introducer model. VERGO connects clients with vetted self-employed workers from the roster. VERGO does not employ, supervise or direct Standard workers. Flat pricing: agreed wage + £2/hr + VAT on every shift.
- **Gold:** Employed team. Workers VERGO trusts to operate without supervision. Supervisors, lead bartenders, head chefs, senior FOH leads. Brought on directly by VERGO (PAYE). The real definition of Gold is not "experienced staff". It is "staff the client does not need to manage on the day."

### Worker-side (Apply page only)

Every worker joins via the marketplace. Strong performance and repeat client requests open the path to Gold, which is employed work at higher rates. No per-shift bonus mechanics. Internal performance tracking exists but is not surfaced to workers as a shift-level reward.

### SDC-safe language rules

**For Standard, always use introducer / marketplace language. Safe words:**
- "Connect you with" / "introduce" / "match"
- "Vetted self-employed workers" / "independent professionals"
- "VERGO's network" / "the VERGO roster"
- "You engage the worker directly" (assuming commercial model supports this, confirm with solicitor)

**For Standard, never use these words. They imply employment or SDC:**
- "Managed" (especially "managed end to end")
- "We provide / supply / send staff"
- "Our team" when referring to the worker
- "Confirms the team" or "places the team"
- "Works directly for VERGO"
- "Briefs them" / "supervises" / "directs"
- "Staff" used in a way that implies VERGO is the employer

**For Gold, employment language is correct and expected:**
- "Employed by VERGO" / "VERGO's employed team"
- "Works for VERGO directly"
- "Our senior team"

**Briefing language, careful on Standard:** Do not say "VERGO briefs them." Instead: "the client's brief is shared with the worker before arrival" or "workers receive the brief ahead of the shift." The brief originates with the client; VERGO relays it, does not direct the work.

---

## Page Ownership (Single-Responsibility Rule)

Each page owns one job. Do not duplicate work across pages.

| Page | Owns |
|------|------|
| Home | Convince in under 10 seconds that this isn't a generic agency. |
| Hire Staff | Help a client decide between Standard and Gold. |
| Pricing | Rates, calculator, FAQ. No tier storytelling. |
| About | The one place where Will shows up. Founder voice, earned specificity. |
| Jobs | Listings and filters. No meta-explanation of the UI. |
| Apply | Worker-side onboarding. Marketplace with a Gold progression path. |

---

## Status

All pages have approved copy and Claude Code prompts ready. Run them one at a time, `/clear` between sessions.

| Order | Page | Status | Notes |
|-------|------|--------|-------|
| 1 | About | Ready | Safest first run. Establishes voice on live site. |
| 2 | Pricing | Ready | Two-tier rebuild. Removes Shortlist card + calculator logic. |
| 3 | Home | Ready | Replaces feature strip with two-tier differentiation block. |
| 4 | Hire Staff | Ready | Full two-tier rebuild, model-agnostic Standard language. |
| 5 | Apply | Ready | Reframes worker messaging. Removes Shortlist + £1/hr bonus. |
| 6 | Jobs | Ready | Small cleanup. Removes UI-explanation strip. |

### Suggested workflow between sessions

After each CLI session, before `/clear` and moving to the next page:

1. Pull the updated page on `vergo-app.fly.dev` and sanity-check the copy landed.
2. Grep the repo for any orphaned Shortlist references: `grep -ri shortlist apps/web/public`. If any appear outside the pages we've already handled, add a follow-up task.
3. Check the nav label on the current page is consistent with the new content (e.g. "Hire Staff" not "Staffing Solutions").

### Pending, outside this rewrite pass

- Solicitor call to confirm Standard commercial flow. Output: refine the "Commercial terms confirmed in the quote" line on Hire Staff once the model is locked.
- Blog post `blog/event-staffing-costs-london-2024.html` 2026 rate update. Separate task.
- Email templates (client verification, job approval, etc.) may reference three tiers or old pricing. Needs its own sweep after the public site is landed.
- Nav and footer copy on every page: check for Shortlist references or three-tier framing during each CLI session.

---

## 1. About

**Status:** Copy approved. Prompt ready to run.

**Page job:** The one place on the site where Will shows up. Earned specificity. No tier explanation, no CTA.

**Voice:** First-person throughout. Founder-led.

### Resolved decisions

- **Hero pattern:** Follow existing VERGO page structure. Small "About VERGO" label above a big headline, consistent with Home, Hire Staff, Pricing.
- **Sign-off:** Plain text "Will Robb, Founder" in body flow. Not stylised.
- **Image:** None. Hold the slot empty until real owned assets exist.

### Approved copy

About VERGO

I started VERGO because I've been on the other side of too many bad placements.

Before this I worked as a kitchen porter, runner, front of house, kitchen assistant, bartender and barista on film sets, TV shoots and concerts across London. Six roles, across the floor and the kitchen. I've done the long shoot days. I've been the person the agency sent.

So I've also watched what happens when agencies don't care who they send. Kitchen porters who walk off the moment the dishes slow down, assuming the rest of the kitchen isn't their problem. Staff who think the job title they applied for is the whole job, and that setup and breakdown are someone else's problem. It's the kind of thing a client notices, a head chef remembers, and a worker who actually cares about the trade would never do.

VERGO exists because that shouldn't be the default.

I'm not here to place bodies. I'm here to help both sides. Clients who need the event to run properly, and workers who want to build a reputation and go somewhere in this industry. Those two things are the same thing. The only way to serve either is to be selective about who joins the roster, brief them properly before they arrive, and stay reachable when things shift on the day, which, in events, always happens.

That's the whole idea. A staffing platform built by someone who's actually worked the floor, for people on both sides of it who'd rather it was done better.

Will Robb, Founder

### Claude Code prompt

```
Rewrite apps/web/public/about.html with new copy and a simpler structure.

CONTEXT
- Preserve all shell script hooks: vergo-public-shell.js, vergo-nav.js, vergo-footer.js.
- Preserve the existing CSS system. Use variables from vergo-styles.css (--color-gold, --bg-secondary, etc.). Do not hardcode colours, fonts or spacing.
- Match the existing page structure used on Home, Hire Staff and Pricing: small eyebrow label above a large headline at the top of the page.
- Voice rules: no em dashes anywhere. No sales-pitch language. No abstract hospitality-speak. First-person throughout.
- No CTA block at the bottom of this page. The page earns trust; next clicks come from the nav.

STRUCTURE
1. Hero: eyebrow label "About VERGO" above the headline "I started VERGO because I've been on the other side of too many bad placements."
2. Body copy: five short paragraphs, flowing prose. No section headings, no bullet lists, no feature grids, no tier cards. Plain paragraphs only.
3. Sign-off line at the end: "Will Robb, Founder" as plain body text, left-aligned with the rest of the copy.
4. Remove any existing sections on the current about page that don't fit this structure: feature strips, "what matters" grids, coverage tiles, "work with VERGO" CTAs, any repeated tier explanations.

COPY (use exactly as written, do not edit):

Hero headline:
I started VERGO because I've been on the other side of too many bad placements.

Body paragraphs:

Before this I worked as a kitchen porter, runner, front of house, kitchen assistant, bartender and barista on film sets, TV shoots and concerts across London. Six roles, across the floor and the kitchen. I've done the long shoot days. I've been the person the agency sent.

So I've also watched what happens when agencies don't care who they send. Kitchen porters who walk off the moment the dishes slow down, assuming the rest of the kitchen isn't their problem. Staff who think the job title they applied for is the whole job, and that setup and breakdown are someone else's problem. It's the kind of thing a client notices, a head chef remembers, and a worker who actually cares about the trade would never do.

VERGO exists because that shouldn't be the default.

I'm not here to place bodies. I'm here to help both sides. Clients who need the event to run properly, and workers who want to build a reputation and go somewhere in this industry. Those two things are the same thing. The only way to serve either is to be selective about who joins the roster, brief them properly before they arrive, and stay reachable when things shift on the day, which, in events, always happens.

That's the whole idea. A staffing platform built by someone who's actually worked the floor, for people on both sides of it who'd rather it was done better.

Sign-off:
Will Robb, Founder

CONSTRAINTS
- Do not add images, icons, illustrations or visual flourishes. Text-only page.
- Do not add social proof, testimonials, stats or numbers.
- Do not add "Our Values", "Our Approach", "What Matters" or any similar abstract headings.
- Keep the page short. A visitor should be able to read it in under 90 seconds.
- Make the assumptions you need to make. Do not ask questions mid-session. Note any assumptions briefly at the end.
```

---

## 2. Pricing

**Status:** Copy approved, prompt ready.

**Page job:** Rates, calculator, FAQ. Nothing else.

**Model note:** Two tiers only. Shortlist removed.

### Approved copy

**Hero**

Eyebrow label: Pricing
Headline: Two tiers. Clear rates.

**Rate cards** (two cards, side by side, stripped of bullet lists)

Card 1:
Standard
Agreed wage + £2/hr + VAT
Vetted self-employed workers from the VERGO roster.
[Get a Quote]

Card 2:
Gold
From £22/hr + VAT (Chefs from £26/hr)
VERGO's employed team for roles you shouldn't have to manage on the day.
[Get a Quote]

**Line below cards**

Quotes within 24 hours. No obligation. Minimum booking: 4 hours per person.

**Calculator section**

Keep existing calculator structure. Update to handle two tiers (Standard and Gold) instead of three. Remove all Shortlist logic, options and references.

Remove this line entirely:
`What drives London staffing rates? Read our guide →`

**Ongoing staffing needs block**

Keep exactly as current:
Headline: "Ongoing staffing needs?"
Body: "Custom rates and dedicated account management for venues, agencies, and production companies."
CTA: "Register Your Company"

**Long-term hire note**

Keep exactly as current:
"Hiring long-term? If you want to bring a VERGO worker on directly or permanently, a one-time placement fee from £400 applies. See the full details in our FAQ."

**FAQ**. Rewrite to reflect two tiers

- What does "agreed wage" mean? (keep as-is)
- How quickly do I get a quote? (keep as-is)
- What does the Standard tier cover? Update: "Standard connects you with vetted self-employed workers from the VERGO roster. Pricing is the agreed wage plus the VERGO fee and VAT."
- When is Gold the right fit? (keep as-is, already accurate)
- **REMOVE** "When should I use Shortlist?" question entirely
- **REMOVE** "Can I mix tiers on one event?" question entirely, or rewrite as: "Can I combine Standard and Gold on one event? Yes. A brief can use Gold for senior roles and Standard for the wider team."
- Is VAT included in the prices shown? (keep as-is)
- Do you offer ongoing commercial rates? (keep as-is)

### Claude Code prompt

```
Update apps/web/public/pricing.html to reflect the two-tier model (Standard and Gold only), remove Shortlist entirely, and clean up duplicated tier content.

CONTEXT
- Preserve all shell script hooks: vergo-public-shell.js, vergo-nav.js, vergo-footer.js.
- Preserve the existing CSS system. Use variables from vergo-styles.css. Do not hardcode colours, fonts or spacing.
- Preserve the calculator JavaScript logic but update it to handle two tiers instead of three. Remove all Shortlist-related options, inputs and logic.
- Voice rules: no em dashes. No sales-pitch language. No abstract hospitality-speak. Use SDC-safe introducer language for Standard.

CHANGES

1. Update the hero headline from "Three tiers. Clear rates." to "Two tiers. Clear rates."

2. Reduce the rate cards section from three cards to two. Remove the Shortlist card entirely. Replace the remaining two cards with the copy below, keeping card structure, rate styling and "Get a Quote" buttons.

   Standard card:
   - Title: Standard
   - Rate: Agreed wage + £2/hr + VAT
   - Single line below rate: Vetted self-employed workers from the VERGO roster.
   - Button: Get a Quote (link unchanged)

   Gold card:
   - Title: Gold
   - Rate: From £22/hr + VAT (Chefs from £26/hr)
   - Single line below rate: VERGO's employed team for roles you shouldn't have to manage on the day.
   - Button: Get a Quote (link unchanged)

   Remove all bullet lists from the cards. Remove any sub-headings like "VERGO matches and confirms directly", "Workers apply. VERGO shortlists.", "Experienced staff who work directly for VERGO".

3. Update the calculator:
   - Remove Shortlist from the tier selector. Tier options are now Standard and Gold only.
   - Remove all Shortlist-related pricing logic from the JS.
   - Update any helper text that references three tiers to reference two.

4. Remove this link entirely from below the calculator:
   "What drives London staffing rates? Read our guide →"
   Delete the element, do not just hide it.

5. Update the FAQ section:
   - Remove the "When should I use Shortlist?" question and answer entirely.
   - Update the "Can I mix tiers on one event?" question to: "Can I combine Standard and Gold on one event? Yes. A brief can use Gold for senior roles and Standard for the wider team."
   - Update the "What does the Standard tier cover?" answer to: "Standard connects you with vetted self-employed workers from the VERGO roster. Pricing is the agreed wage plus the VERGO fee and VAT."
   - Keep all other FAQ entries unchanged.

6. Leave all other sections untouched: "Quotes within 24 hours" line, "Ongoing staffing needs?" block, long-term hire note.

CONSTRAINTS
- Do not add new sections, images, icons or decorative elements.
- Do not use the words "managed", "supplied", "provided" or "confirmed" when describing Standard. Use "connects", "introduces", "matches".
- Do not say Standard workers "work for VERGO". They are self-employed. Gold workers are VERGO employees.
- Make the assumptions you need to make. Do not ask questions mid-session. Note any assumptions briefly at the end.
```

---

## 3. Hire Staff

**Status:** Copy approved, prompt ready.

**Page job:** Help a client decide between Standard and Gold.

**Commercial flow note:** Option C (model-agnostic language). Commercial terms deliberately left vague on the page until solicitor confirms the payment structure. Copy describes what VERGO does, not how money flows.

### Approved copy

**Hero**

Eyebrow: Hire staff
Headline: Two ways to staff your event. Pick the one that fits the brief.
Sub-line: Standard connects you with vetted self-employed workers from VERGO's roster. Gold is VERGO's own employed team for roles you shouldn't have to manage on the day.
CTAs: Send Your Brief / See Pricing

**Two-tier decision block**

Standard
For general event cover, where reliable staffing at pace is the priority.
VERGO introduces vetted self-employed workers from the roster. The client's brief is shared with the worker before arrival. Most briefs confirmed within 24 hours. Commercial terms confirmed in the quote.
Best for: full-service teams, bar cover, floor staff, runners, flexible numbers.
Agreed wage + £2/hr + VAT.

Gold
For roles where the client shouldn't have to supervise on the day.
VERGO's employed team. Supervisors, head chefs, lead bartenders, senior front-of-house. Workers VERGO employs directly (PAYE) because they're trusted to run their part of the event without being managed.
Best for: head chef roles, lead bartenders, supervisors, guest-facing leads on high-stakes events.
From £22/hr + VAT. Chefs from £26/hr.

**Mixed-tier note**

One event, both tiers.
A single brief can combine a Standard floor team with a Gold lead. VERGO will recommend the mix based on the brief.

**Urgent briefs block**

Urgent cover
Same-day response via WhatsApp. Send the date, venue and roles needed. If VERGO can cover it, you'll hear back quickly.
[WhatsApp urgent cover]

**Closing CTA**

Send the brief.
Date, venue, headcount and roles. VERGO will recommend the right tier and confirm within 24 hours.
[Send Your Brief] [See Pricing]

### Claude Code prompt

```
Rewrite apps/web/public/hire-staff.html around a two-tier structure (Standard and Gold only).

CONTEXT
- Preserve all shell script hooks: vergo-public-shell.js, vergo-nav.js, vergo-footer.js.
- Preserve the existing CSS system. Use variables from vergo-styles.css. Do not hardcode colours, fonts or spacing.
- Voice rules: no em dashes. No sales-pitch language. No abstract hospitality-speak. Use SDC-safe introducer language for Standard. Employment language is correct for Gold.
- Remove all references to Shortlist, including the word itself. No third tier exists.

STRUCTURE (replace current page content)

1. Hero
   - Eyebrow: "Hire staff"
   - Headline: "Two ways to staff your event. Pick the one that fits the brief."
   - Sub-line: "Standard connects you with vetted self-employed workers from VERGO's roster. Gold is VERGO's own employed team for roles you shouldn't have to manage on the day."
   - CTAs: "Send Your Brief" (link to /contact?tab=staff#contact-forms) and "See Pricing" (link to /pricing#tiers)

2. Two-tier decision block (two cards, side by side)

   Standard card:
   - Heading: Standard
   - One-line pitch: "For general event cover, where reliable staffing at pace is the priority."
   - Body paragraph: "VERGO introduces vetted self-employed workers from the roster. The client's brief is shared with the worker before arrival. Most briefs confirmed within 24 hours. Commercial terms confirmed in the quote."
   - Best for: "full-service teams, bar cover, floor staff, runners, flexible numbers."
   - Rate line: "Agreed wage + £2/hr + VAT."
   - CTA button: "Send Your Brief" (link unchanged)

   Gold card:
   - Heading: Gold
   - One-line pitch: "For roles where the client shouldn't have to supervise on the day."
   - Body paragraph: "VERGO's employed team. Supervisors, head chefs, lead bartenders, senior front-of-house. Workers VERGO employs directly (PAYE) because they're trusted to run their part of the event without being managed."
   - Best for: "head chef roles, lead bartenders, supervisors, guest-facing leads on high-stakes events."
   - Rate line: "From £22/hr + VAT. Chefs from £26/hr."
   - CTA button: "Send Your Brief" (link unchanged)

3. Mixed-tier note (small section below the cards)
   - Heading: "One event, both tiers."
   - Body: "A single brief can combine a Standard floor team with a Gold lead. VERGO will recommend the mix based on the brief."

4. Urgent briefs block
   - Heading: "Urgent cover"
   - Body: "Same-day response via WhatsApp. Send the date, venue and roles needed. If VERGO can cover it, you'll hear back quickly."
   - CTA: "WhatsApp urgent cover" (link unchanged, points to wa.me/447506615242)

5. Closing CTA
   - Heading: "Send the brief."
   - Body: "Date, venue, headcount and roles. VERGO will recommend the right tier and confirm within 24 hours."
   - CTAs: "Send Your Brief" and "See Pricing" (links unchanged)

REMOVE ENTIRELY
- Any "Guided staffing" or "Managed from brief to confirmation" section.
- Any "Staffing solutions" repeat-explanation block.
- Any separate "Which solution suits which brief?" section (now absorbed into the Best for line on each card).
- All references to Shortlist, including any old four-part tier grids or legacy copy mentioning "Workers apply. VERGO shortlists."
- The "Last-Minute & Emergency Staffing" four-bullet block (replaced by the tightened Urgent cover block above).
- The four-item feature strip at the top of the current page (Reply/etc).

CONSTRAINTS
- Do not use the words "managed", "supplied", "provided" or "sends staff" for Standard.
- Do not say Standard workers "work for VERGO". They are self-employed.
- Do not add numbers, stats, testimonials, or founder-led callouts (those belong on Home and About).
- Keep the page short. Two-card decision is the spine; everything else is supporting.
- Make the assumptions you need to make. Do not ask questions mid-session. Note any assumptions briefly at the end.
```

---

## 4. Home

**Status:** Copy approved, prompt ready.

**Page job:** Convince in under 10 seconds that VERGO isn't a generic agency.

**Specificity angle:** Founder-led vetting (personal approval) combined with two-tier clarity (marketplace + employed team). The feature strip replacement lands both: standards *and* capacity.

### Approved copy

**Hero**

Keep existing:
- Eyebrow: London hospitality staffing
- Headline: Event staff, briefed and ready.
- Sub-line: Bartenders, waiters, chefs and front-of-house staff for private events, venues and productions across London.
- CTAs: Hire Staff / See Pricing
- Hero image: keep current

**Urgent cover block**. Keep exactly as current

Keep the "Need cover quickly?" block with the WhatsApp CTA. Works well.

**Feature strip replacement** (REPLACES the current Checks / Briefing / Compliance / Turnaround grid)

Heading: "Two ways in. Both on our standards."

Two short items, side by side:

Item 1:
Heading: "Marketplace roster"
Body: "A vetted network of self-employed workers, personally approved by the founder before they join. For general event cover at reliable pace."

Item 2:
Heading: "Employed team"
Body: "VERGO directly employs its senior team. Supervisors, head chefs, lead bartenders. The people you shouldn't have to manage on the day."

**How we work section**. Remove or reduce

Current "Matching, checks and briefing are handled before the day starts" is generic. Either:
- Remove this section entirely (cleanest), or
- Replace with one tighter line: "The brief is relayed to the worker before arrival. If something shifts on the day, VERGO stays reachable."

Recommendation: remove entirely. The feature strip replacement above does this work already.

**Where we work section**. Keep as current

Keep the four sector cards (Film & TV / Corporate / Private Events / Music & Festivals). This is the strongest section on the current Home page.

**Closing CTA**. Keep as current

"Send the brief." block with CTAs unchanged.

### Claude Code prompt

```
Rewrite apps/web/public/index.html to replace the generic feature strip with a two-tier differentiation block, remove the redundant "How we work" section, and sweep any references to Shortlist or three-tier language.

CONTEXT
- Preserve all shell script hooks: vergo-public-shell.js, vergo-nav.js, vergo-footer.js.
- Preserve the existing CSS system. Use variables from vergo-styles.css. Do not hardcode colours, fonts or spacing.
- Preserve the hero section (eyebrow, headline, sub-line, CTAs, hero image) exactly as current.
- Preserve the "Need cover quickly?" urgent cover block and the "Where we work" four-sector section exactly as current.
- Voice rules: no em dashes. No sales-pitch language. No abstract hospitality-speak.

CHANGES

1. Remove the current four-item feature strip entirely. The strip currently shows:
   - Checks / "Vetted staff only"
   - Briefing / "Briefed before arrival"
   - Compliance / "Right-to-work verified"
   - Turnaround / "Quote within 24 hours"
   Delete the whole grid. It is being replaced.

2. Replace it with a two-item differentiation block in the same page position.

   Section heading: "Two ways in. Both on our standards."

   Two items side by side (or stacked on mobile). Style can reuse the existing feature-grid CSS pattern if sensible, or match the two-tier card pattern used on Hire Staff. Use whichever reads cleaner in the existing layout.

   Item 1:
   - Heading: "Marketplace roster"
   - Body: "A vetted network of self-employed workers, personally approved by the founder before they join. For general event cover at reliable pace."

   Item 2:
   - Heading: "Employed team"
   - Body: "VERGO directly employs its senior team. Supervisors, head chefs, lead bartenders. The people you shouldn't have to manage on the day."

3. Remove the "How we work" section entirely. This is the block that currently reads: "From private dinners to large venue shifts, we keep staffing straightforward. Matching, checks and briefing are handled before the day starts, so your team is not left chasing on the day." Delete the whole section.

4. Sweep for any references to Shortlist, three tiers, or a +£1/hr merit uplift anywhere on the page. Remove all such references. VERGO is a two-tier business: Standard and Gold.

5. Leave untouched:
   - Hero (eyebrow, headline, sub-line, CTAs, image)
   - "Need cover quickly?" urgent cover block with WhatsApp CTA
   - "Where we work" four-sector section (Film & TV / Corporate / Private Events / Music & Festivals)
   - Closing "Send the brief." CTA section
   - Footer

CONSTRAINTS
- Do not add images or visual flourishes to the new differentiation block.
- Do not use "premium", "bespoke", "exceptional", or similar sales words.
- Do not use "managed" or "supplied" for the marketplace roster item.
- The word "founder" in Item 1 refers to Will Robb. Do not name him on the homepage; the About page handles that.
- Make the assumptions you need to make. Do not ask questions mid-session. Note any assumptions briefly at the end.
```

---

## 5. Apply

**Status:** Copy approved, prompt ready.

**Page job:** Worker-side onboarding. Marketplace with a Gold progression path.

**Model note:** Shortlist removed entirely. No +£1/hr per-shift bonus mechanic. Progression to Gold is the only reward narrative, and it's real employment at higher rates.

### Approved copy

**Hero**

Eyebrow: Join VERGO
Headline: Flexible shifts across London events and venues.
Sub-line: Apply to join VERGO's roster for flexible work across events, productions and venues. Strong performance opens the path to VERGO's employed Gold team.
CTAs: Apply Now (anchor to form) / Role Guide / Job Board

**How progression works section** (REPLACES the current "Standard. Shortlist. Gold." block)

Heading: "Roster to Gold."

Body intro: "Every worker joins the VERGO roster as vetted self-employed hospitality staff. Strong performance over time and repeat client requests open the path to Gold: VERGO's directly employed senior team, at higher rates."

Two items side by side:

Item 1:
Heading: "Roster"
Body: "Your starting point. Vetted, briefed and available for flexible shifts across events, productions and venues."

Item 2:
Heading: "Gold"
Body: "VERGO's employed team. Supervisors, head chefs, lead bartenders. Earned through consistent strong performance and the kind of reviews that make clients ask for you again."

Remove from the current page:
- The four-part grid referencing Standard/Shortlist/Gold/Reputation.
- Any mention of "+£1/hr" or "merit uplift" or "Shortlist selection" anywhere.
- The "Most Standard shifts pay £13+/hr" line under Standard (rate specificity belongs on an external pay reference, not the application page).

**Application form**. Keep exactly as current

The form itself (personal details, roles, experience levels, CV upload, postcode, etc.) is working and doesn't need changes. Preserve all form logic and field handling.

**After-form sections**. Tighten and sweep

Current "Tier progression" block: rewrite to match the new two-tier model.
Current "Why people join" block: keep as-is, it's fine.
Current "Role guide", "Typical roles", "After you apply" sections: keep as-is.

Rewritten Tier progression block:
Heading: "Roster to Gold."
Body:
- "Every VERGO worker starts on the roster: vetted, briefed and available for flexible work across events and productions."
- "Strong performance and repeat client requests are the path to Gold status."
- "Gold is VERGO's directly employed team. Higher rates and access to senior bookings."

### Claude Code prompt

```
Rewrite apps/web/public/apply.html to remove Shortlist entirely, remove the +£1/hr merit uplift mechanic, and reframe worker progression as "Roster to Gold".

CONTEXT
- Preserve all shell script hooks: vergo-public-shell.js, vergo-nav.js, vergo-footer.js.
- Preserve the existing CSS system. Use variables from vergo-styles.css. Do not hardcode colours, fonts or spacing.
- Preserve the entire application form (personal details, role checkboxes, experience levels, CV upload, postcode, etc.) and all form logic. This change is copy and surrounding sections only.
- Voice rules: no em dashes. No sales-pitch language. No abstract hospitality-speak.

CHANGES

1. Update the hero sub-line. Current is likely some variant of "Apply to join a roster for flexible work across events, productions and venues." Replace with:
   "Apply to join VERGO's roster for flexible work across events, productions and venues. Strong performance opens the path to VERGO's employed Gold team."

2. Replace the "How progression works" section. Current version uses a four-part grid with Standard / Shortlist / Gold / Reputation and mentions "+£1/hr uplift". Remove this entirely and replace with:

   Section heading: "Roster to Gold."

   Intro paragraph: "Every worker joins the VERGO roster as vetted self-employed hospitality staff. Strong performance over time and repeat client requests open the path to Gold: VERGO's directly employed senior team, at higher rates."

   Two items side by side (reuse existing two-item CSS pattern, or the feature-grid pattern if it reads better):

   Item 1:
   - Heading: "Roster"
   - Body: "Your starting point. Vetted, briefed and available for flexible shifts across events, productions and venues."

   Item 2:
   - Heading: "Gold"
   - Body: "VERGO's employed team. Supervisors, head chefs, lead bartenders. Earned through consistent strong performance and the kind of reviews that make clients ask for you again."

3. Replace the after-form "Tier progression" block. Current version references Standard → Shortlist → Gold and the +£1/hr merit uplift. Replace with:

   Heading: "Roster to Gold."
   Three bullet points:
   - "Every VERGO worker starts on the roster: vetted, briefed and available for flexible work across events and productions."
   - "Strong performance and repeat client requests are the path to Gold status."
   - "Gold is VERGO's directly employed team. Higher rates and access to senior bookings."

4. Sweep for and remove ALL of the following anywhere on the page:
   - The word "Shortlist" (as a tier name)
   - Any "+£1/hr" reference
   - Any "merit uplift" reference
   - Any mention of "Shortlist selection" or "Shortlist performance"
   - The line "Most Standard shifts pay £13+/hr depending on role and brief." under Standard
   - The "Reputation / Shortlist performance is tracked. It is how Gold is earned." tile

5. Keep the following sections as they currently are:
   - "Why people join" block
   - "Role guide" block with link to /staff-roles
   - "Typical roles" list (Bartender, Barista, Front of house, Chef, Kitchen porter, Runner)
   - "After you apply" block
   - The entire application form (fields, submit behaviour, success state)
   - Post-submit "Application received" section

CONSTRAINTS
- Do not change form submission logic or field names.
- Do not add new pay rates or numeric claims.
- Do not reintroduce Shortlist under a different name.
- Make the assumptions you need to make. Do not ask questions mid-session. Note any assumptions briefly at the end.
```

---

## 6. Jobs

**Status:** Copy approved, prompt ready. Low priority. Small cleanup only.

**Page job:** Listings and filters. Nothing else.

### Approved copy

**Hero**. Keep exactly as current

Eyebrow: Openings
Headline: Live hospitality roles across London.
Sub-line: Filter by role. View internal and external opportunities. Apply fast once the right shift shows up.
CTAs: Join VERGO / Post a Job

**Remove the "Platform powered" UI explanation block**

The current four-tile strip (Filters / Account / Types / Detail) explaining the job board UI is unnecessary. Users understand job boards without a walkthrough. Remove entirely.

**Log In / Apply row**. Keep

The "Log In / Apply to Join" CTAs below that block are fine. Keep them in place after the UI strip is removed.

**Job board section**. Keep exactly as current

Filters, role selector, type selector, listings feed, and the honest "No jobs available. Check back soon." empty state all stay as-is.

### Claude Code prompt

```
Clean up apps/web/public/jobs.html by removing the redundant UI-explanation block above the job board.

CONTEXT
- Preserve all shell script hooks: vergo-public-shell.js, vergo-nav.js, vergo-footer.js.
- Preserve the existing CSS system. Use variables from vergo-styles.css.
- Preserve all job board logic: filters, role selector, type selector, listings rendering, JS behaviour and the empty state.
- Voice rules: no em dashes. No sales-pitch language.

CHANGES

1. Remove the "Platform powered" / "Search cleanly. Apply without the clutter." section entirely, including its four-tile grid:
   - Filters / "Role and source filters update the list live."
   - Account / "Log in to track applications from your dashboard."
   - Types / "VERGO roles and external jobs in one place."
   - Detail / "Open any listing to view timing, pay and spots."

   Delete the whole section heading, its subheading, its grid, and the "Create an account for a smoother path into applications and updates." paragraph.

2. Keep the Log In / Apply to Join CTA pair that appears below that block. Move it up if needed so it sits directly below the hero or directly above the job board filters. Use whichever position reads cleaner given the existing CSS.

3. Leave untouched:
   - Hero (Openings eyebrow, "Live hospitality roles across London." headline, sub-line, Join VERGO / Post a Job CTAs)
   - Job board section (heading, filter controls, listings, empty state, pagination)
   - Footer

CONSTRAINTS
- Do not change any filter or listing JS behaviour.
- Do not add new sections.
- Make the assumptions you need to make. Do not ask questions mid-session. Note any assumptions briefly at the end.
```

---

## Working Notes

- Two-tier model (Standard + Gold) is the operating structure across the whole site. Shortlist and the +£1/hr bonus mechanic are removed entirely, not just renamed.
- Standard = self-employed marketplace workers, flat £2/hr + VAT fee, introducer language only.
- Gold = PAYE employees, flat price-list rates. Defined as "workers you shouldn't have to manage on the day", not "experienced staff".
- Commercial flow on Standard (client-pays-worker vs VERGO-invoices-all) deliberately left vague in the copy pending solicitor call. The line "Commercial terms confirmed in the quote" on Hire Staff covers this. Refine once the model is confirmed.
- Images: hold all image slots empty until real owned assets exist.
- Approval-rate stat (à la Slinger's "16% approved") is a future homepage upgrade once VERGO has real data. Not included in the current pass.

---

