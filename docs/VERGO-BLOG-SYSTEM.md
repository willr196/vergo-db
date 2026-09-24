# VERGO-BLOG-SYSTEM.md

Reference file for drafting VERGO Staffing blog posts with Claude Code.

> **Storage warning:** put this file at the repo root or in `/docs`, **not** in `apps/api/public/`. Anything in `public/` is served to the open internet. This file contains internal commercial information.

---

## How to use this

In the terminal, from the repo root:

```
claude
> Read VERGO-BLOG-SYSTEM.md. We're writing post 3. Start the interview.
```

Claude Code will ask you questions. Answer them in plain speech, however roughly. It writes the post from your answers. You never write prose.

To revise: `> That section on X is wrong, here's what actually happens: [tell it]`

---

## THE RULE THAT MATTERS MOST

**Do not invent facts about VERGO.** No made-up client stories, no invented statistics, no fabricated anecdotes, no "we've found that..." unless Will actually said it in the interview.

If a post needs a number or an example that Will hasn't supplied, ask him for it. If he doesn't have it, cut that section rather than filling it. A shorter honest post beats a longer invented one, and invented specifics are the fastest way to destroy the credibility this whole strategy depends on.

External statistics must be verifiable and cited with a link. If you can't verify it, don't use it.

---

## THE INTERVIEW PROTOCOL

Before drafting any post, run this. Do not skip it.

1. Read the brief for that post below.
2. Ask Will **6 to 10 questions**, one batch at a time, no more than 4 per message.
3. Questions must be about **things he has personally done, seen, or decided.** Not opinions, not hypotheticals. "What actually happened the last time a worker didn't show?" not "What do you think about no-shows?"
4. Push for specifics. If he says "it was expensive", ask how much. If he says "it went wrong", ask what exactly.
5. When an answer is vague or he says he doesn't know, note it and move on. Do not fill the gap yourself.
6. Then say what you're going to write, in three lines, and get a yes before drafting.
7. Draft.
8. After drafting, list anything in the post that needs Will to verify before publishing.

---

## FACTS FILE — source of truth

Everything below is confirmed. Use it freely. Anything not here needs to come from the interview.

### The company
- Trading name: **VERGO Staffing**. Legal name: Vergo Ltd. Company number 16627585.
- Registered in England and Wales. London, SW6.
- Founded 2025. Founder-led, run by Will Robb.
- Employers' liability and public liability insurance in place.
- Registered for Corporation Tax and PAYE. **Not VAT registered.** Never imply prices are ex-VAT.
- Banks with Tide. Payroll run on HMRC Basic PAYE Tools. Weekly pay runs.
- Contact: wrobb@vergoltd.com, 07944 505783.

### Will's background
- 8+ years in London hospitality, film and television production, and live music.
- Family background in event staffing; his father runs an established kitchen porter staffing business.
- Personally interviews every worker before they join the roster.

### The commercial model
- Published rate: **£18.50/hr per person** for waiting staff, bar staff, kitchen porters, runners, hosts.
- Four-hour minimum per person. Overruns in 30-minute blocks. Plus 25% after midnight.
- No booking fees, no uniform charges, no surcharges.
- Senior roles (supervisors, head chefs, lead bartenders, event managers) quoted individually.
- Payment terms: within 30 days. No cancellation fee.
- Guarantee 1: same-day confirmation for enquiries between 8am and 10pm.
- Guarantee 2: replacement on site within one hour on a no-show, or that shift isn't charged.

### The employment model
- Staff are **PAYE**, on casual / zero-hours worker contracts.
- Paid National Living Wage minimum, plus **rolled-up holiday pay at 12.07%**.
- Rates set individually per person; several are paid above the minimum.
- Right to work verified and documented for everyone.
- Workers get payslips, holiday pay and pension where auto-enrolment applies.

### 2026/27 statutory figures (verified, safe to use)
- National Living Wage (21+): **£12.71/hr**
- Employer NIC: **15%** on earnings above a secondary threshold of **£5,000/year** (£96/week)
- Employment Allowance: **£10,500/year**. Not claimable where the only above-threshold employee is the sole director.
- Auto-enrolment pension: employer minimum 3%, duties from £10,000 annual earnings, age 22+
- Holiday: 5.6 weeks statutory. 5.6 ÷ 46.4 = 12.07%.
- Always link statutory figures to GOV.UK and add "correct for 2026/27, verify before relying on it".

### Real operating experience Will can draw on
Ask him about these in interviews. **Never name clients in a published post.** Say "a catering company we work with" or "a production kitchen in west London".

- A recurring catering client running roughly 110 staff hours a week, consistently 10-hour days
- Work in a film studio kitchen where the kitchen and equipment belonged to the studio, not the caterer
- Kitchen porter work where the client's chefs direct the porters during the shift, and the site provides the cleaning equipment
- Trying self-employed engagement and concluding it does not work for this kind of work. All VERGO staff are PAYE
- Running his first PAYE bookings in September 2026
- Invoicing upfront and paying staff roughly two weeks later
- Building his own scheduling and records software rather than buying rota tools

### Hard rules for published posts
- **Never name a client.** Not Popcorn, not Schmodel, not the studio.
- **Never publish what VERGO pays an individual worker.** Aggregate and statutory figures only.
- **Never publish what VERGO charges a specific client.** The £18.50 published rate is fine. Bespoke rates are not.
- **Never give legal or tax advice.** Describe how things work and what to ask a professional. Employment status posts especially.
- **No competitor names.** Talk about "some agencies", never a named firm.

---

## HOUSE STYLE

### Voice
Will's voice, not a marketing department's. He's a working operator who does the shifts, not a brand. Plain, specific, slightly blunt. Says what things cost. Comfortable admitting what he doesn't know.

### Write like this
- Short declarative sentences.
- Concrete numbers over adjectives. "£14.24" beats "significant cost".
- Explain the arithmetic. Show the working.
- Say the uncomfortable thing. If the honest answer is "hiring direct is cheaper for this", say it.
- Second person for the reader. First person plural for VERGO.

### Never write this
- "In today's fast-paced events industry"
- "Look no further"
- "We pride ourselves on"
- "Unlock", "elevate", "seamless", "bespoke", "cutting-edge", "game-changing"
- Rhetorical questions as section openers
- "It's not just X, it's Y" constructions
- Em-dash asides. Use a full stop or a comma.
- Any sentence that would survive being copied onto a competitor's site unchanged
- Exclamation marks
- Emoji

### Length
1,200 to 1,800 words. Longer is not better. Cut anything that isn't answering the question.

---

## REQUIRED STRUCTURE

Every post, without exception:

1. **H1** — the headline
2. **"In short" block** — 4 to 5 bullets, directly under the H1, before any prose. Each bullet answers the question outright and stands alone out of context. This is the block AI systems lift into answers, so it carries the whole post's value. Write it last, then move it to the top.
3. **Body** — H2 headings phrased as questions people actually type
4. **At least one table of real figures.** Every post needs one. If a post can't support a table, it's the wrong post.
5. **FAQ** — 5 questions, each answered in 2 to 4 sentences, self-contained
6. **Author box** — Will Robb, founder, 8+ years London hospitality/film/music, company number
7. **Dates** — published and last-updated, both visible
8. **Two internal links** — one mid-post, one at the end, to `/hire` or `/hire/quote`
9. **Caveat line** where statutory figures appear

Output as a `.md` file in `/content/` with slug, meta title and meta description at the top. A separate pass converts it to HTML using the template in `blog-implementation-brief.md`.

---

## THE POST BRIEFS

Post 1 is written: `/blog/london-event-staff-costs`.

---

### POST 2 — PAYE vs self-employed event staff

**Slug:** `/blog/paye-vs-self-employed-event-staff`
**Target reader:** a caterer or production manager who books staff and hasn't thought about who employs them
**Why it works:** high commercial intent, liability-heavy, AI Overviews handle nuanced compliance questions badly

**Interview Will about:**
- What's the actual difference in what a client is exposed to, in his understanding?
- When he structured a kitchen porter engagement as an independent service, what specifically had to be true about it?
- Who provided the equipment and uniform on that job, and why did that matter?
- Why do chefs and KPs work different shift times on the same booking?
- Has a client ever asked him about employment status? What did they want to know?
- Why did he choose PAYE when self-employed is cheaper and most of the industry uses it?
- What does he think most caterers get wrong here?

**Table:** side-by-side of PAYE vs self-employed across: who runs payroll, who holds holiday pay liability, who carries employment status risk, who insures, what happens on a no-show, what the client sees on the invoice.

**Must include:** a clear "this is not legal or tax advice, check with an accountant or employment solicitor" line, and a link to HMRC's CEST tool.

---

### POST 3 — How to read an event staffing quote

**Slug:** `/blog/how-to-read-event-staffing-quote`
**Target reader:** someone holding three quotes who can't tell why they differ
**Why it works:** comparison content survives AI Overviews far better than how-to content

**Interview Will about:**
- What charges has he seen on competitor invoices that weren't in the original quote?
- What does a four-hour minimum actually protect, and who does it protect?
- What questions do clients ask him that suggest they've been caught out before?
- What's in his terms that most agencies' terms don't cover?
- Has he lost a job on price and then heard what happened? What happened?

**Table:** a quote-comparison checklist. Rows = the things to check (holiday pay included? booking fee? uniform charge? travel? minimum hours? overtime multiplier? no-show remedy? cancellation terms? payment terms?). Columns = "what to ask" and "what a good answer sounds like".

---

### POST 4 — Staffing a film or TV production kitchen

**Slug:** `/blog/film-tv-production-catering-staff`
**Target reader:** production coordinators and unit caterers
**Why it works:** near-zero competition, and Will has genuine direct experience here

**Interview Will about:**
- What's different about a studio kitchen versus an event venue kitchen?
- Who owns the kitchen and equipment on those jobs, and what does that change?
- What are the shift patterns actually like? Call times, turnarounds, meal service windows?
- What goes wrong on production catering that doesn't go wrong elsewhere?
- What does a production coordinator care about that a wedding planner doesn't?
- How far in advance do these get booked compared to events?

**Table:** typical production kitchen roles, shift lengths, and what each one covers.

---

### POST 5 — What a no-show actually costs

**Slug:** `/blog/event-staff-no-show-cost`
**Target reader:** anyone who's been let down and is choosing more carefully next time
**Why it works:** nobody in the industry writes about their own failure mode

**Interview Will about:**
- What actually happens operationally when someone doesn't turn up? Walk through the hour.
- How did he arrive at the one-hour replacement guarantee? Can he actually meet it?
- What does a missing person cost the client, in service terms, not just money?
- How does he reduce no-shows in the first place? What's in the briefing?
- Has he ever failed to cover one? What happened?

**Table:** knock-on cost of one missing person on a 100-guest service — service ratio impact, delay, what the other staff absorb.

**Important:** this post must be honest about VERGO's own failures or it reads as an advert. Push him on the last question.

---

### POST 6 — How many event staff do you need?

**Slug:** `/blog/how-many-event-staff-do-i-need`
**Target reader:** first-time event organisers
**Why it works:** the one traditional guide, saved by using real booking data instead of recycled ratios

**Interview Will about:**
- What ratios does he actually book to, by service style? Seated dinner, standing reception, buffet, canapés, bar-only?
- How do those change with bar service, or a difficult venue layout?
- What do clients most often under-order?
- What does the "+1 hour for setup and breakdown" rule actually look like in practice?
- Give three real bookings by shape (not by name): guest count, service style, staff supplied.

**Table:** service style vs staff-per-guest ratio vs typical shift length. Label it clearly as VERGO's own booking data, not an industry standard.

---

### POST 7 — Kitchen porter hire in London

**Slug:** `/blog/kitchen-porter-hire-london`
**Target reader:** kitchens and caterers who need KPs and find nothing useful online
**Why it works:** underserved in content terms, Will supplies it, family background in exactly this

**Interview Will about:**
- What does a KP shift actually involve, start to finish?
- What separates a good KP from a bad one? Be specific.
- What do kitchens get wrong when they brief a KP?
- Why is KP work harder to staff than front of house?
- What equipment does a KP need or bring?
- What's the shift pattern relative to the chefs?

**Table:** KP duties by shift phase — prep, service, close-down — with typical timings.

---

### POST 8 — VERGO London Event Staffing Rate Report 2026

**Slug:** `/blog/london-event-staffing-rate-report`
**Publish:** December 2026, then update every December. No year in the slug.
**Why it works:** an annually-updated original-data page is the highest-value citation asset a small business can own

**Interview Will about:**
- Every booking made in 2026: role, guest count, event type, shift length, month.
- What patterns does he see across the year? Seasonality, lead times, role mix?
- What changed between January and December?

**Data to publish (aggregate only, never per-client):** bookings by month, role mix, average shift length, average lead time, event type split, how rates moved.

**Rule:** if the sample is small, say so plainly. "Based on N bookings across 2026" is more credible than pretending to a dataset that isn't there. Small honest data still gets cited. Inflated data gets found out.

---

## AFTER EVERY DRAFT

Claude Code should output, separately from the post:

1. **Verify before publishing:** every claim Will needs to check
2. **Gaps:** anything the brief called for that the interview didn't supply
3. **Suggested internal links** to other posts once they exist
4. **The meta title and meta description**, under 60 and 155 characters
