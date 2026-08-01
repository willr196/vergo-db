# Claude Code — Vergo website build prompt

> **Setup — read this first, it's not part of the prompt.**
>
> **Files to put in the project directory:** just `vergo-website-copy.md`. Nothing else. Don't add the plan doc — it's full of margins, wage costs and profit tables that the site doesn't need, and anything Claude Code reads gets re-billed on every turn.
>
> **Don't save this prompt into the project.** Paste it into the terminal.
>
> **Model split:**
>
> | Task | Model |
> |---|---|
> | Planning structure and stack | Opus |
> | Building pages, forms, styling | Sonnet |
> | Privacy notice | Sonnet |
> | Terms of business | Opus |
>
> Switch with `/model sonnet` and `/model opus`, or use the `opusplan` alias to plan on Opus and implement on Sonnet automatically. Start on Sonnet by default. The terms of business is the one genuinely worth Opus — the Conduct Regulations detail is where a subtle error costs an enforceable placement fee.
>
> **Run it as two sessions:** the site build on Sonnet, then `/clear`, then the legal pages on Opus. Considerably cheaper than one long thread.
>
> **Token discipline:**
> - Context is the bill. Every message re-sends the whole history, so message 201 costs as much as messages 1–200 combined
> - `/clear` between unrelated tasks — biggest single lever
> - `/compact` when a session gets long
> - Plan mode (Shift+Tab twice) before anything big — if the plan names the wrong files you stop before paying for a long edit loop
> - Reference files as `@vergo-website-copy.md` rather than letting it explore
> - `/usage` to check where you are
> - Work in one sitting — cached context is billed ~90% less but goes cold after about 5 minutes idle
> - Keep `CLAUDE.md` to about five lines. It loads on every turn, so a long one costs its full size whether you send two messages or two hundred

---

I'm rebuilding the website for my company, Vergo Ltd — an event and hospitality staffing agency in London. The current site is at vergoltd.com and needs replacing entirely.

Read `vergo-website-copy.md` in this directory before you start — it has the approved page content and the rates. Don't invent rates, wages or terms; take them from that file.

## Before you write anything

Check what the existing site is built on and tell me what you find. If there's no existing codebase here, ask me what I want to use — otherwise recommend something I can edit myself without a build step.

Then confirm these back to me before building:
- Registered office address (needed in the footer, Companies Act requirement)
- Whether contact is a form, email, phone or all three
- Whether application data goes to email, a spreadsheet, or a database
- Any brand colours, fonts or logo files I should use

## What to build

A dual-audience site. Two distinct paths from the homepage — clients hiring staff, and workers looking for shifts. They should not share pages beyond the homepage and footer.

**Structure:**
```
/                     Homepage — brief intro, two clear routes
/hire                 Client path — proposition, guarantees, rates, how it works
/hire/quote           Enquiry form
/work                 Worker path — pay, what the work is, what we ask
/work/apply           Application form
/terms                Terms of business (client-facing)
/privacy              Privacy notice
/legal                Company details, insurance, regulatory info
```

Use the copy from `vergo-website-copy.md` as written. If something reads badly in place, flag it to me rather than silently rewriting.

## Design direction

Confident and plain. This is a business that sells reliability, so the site should look like it turns up on time — clear hierarchy, generous spacing, fast, no stock photography of people laughing in aprons.

Mobile first. Most enquiries will come from a phone, often late and often urgently, so the quote form needs to work one-handed on a small screen.

Two things must be impossible to miss on `/hire`:
- Confirmation within 30 minutes, or the booking is free
- Replacement within the hour on a no-show, or the shift isn't charged

These are the core sales promises. Give them real visual weight.

## Forms

**Quote form (`/hire/quote`):** date, start and end time, number of staff, roles needed, venue postcode, event type, contact details. Show an estimated total as they fill it in — £18.50/hr per person, four-hour minimum, plus VAT. Make clear it's an estimate, not a binding quote.

**Application form (`/work/apply`):** name, contact, age confirmation (18+), postcode, roles interested in, experience, availability. Do **not** collect right-to-work documents, National Insurance numbers, dates of birth or bank details through the web form — those are handled after interview. The form must link to the privacy notice and require explicit consent before submission.

## Legal documents

Draft these as working first drafts, clearly marked as requiring solicitor review before going live:

**`/privacy`** — GDPR-compliant privacy notice covering what's collected via both forms, lawful basis, retention periods, third parties, and subject access and deletion rights. This must exist before the application form is live.

**`/terms`** — client terms of business covering: £18.50/hr plus VAT, four-hour minimum, 14-day payment terms, advance payment on first booking for new clients, cancellation (free over 48 hours, 50% within 24, full within 12), overrun billing in 30-minute blocks, travel outside Zones 1–3, and liability limits.

Important: Vergo is an employment business, so the terms are governed by the Conduct of Employment Agencies and Employment Businesses Regulations 2003. Two things that must be right — a temp-to-perm transfer fee is only chargeable if the client is first offered an extended period of hire as an alternative, and no fee may ever be charged to a work-seeker. Research the current requirements rather than working from memory, and tell me which provisions you're unsure about.

**`/legal`** — Vergo Ltd, registered in England and Wales, company no. 16627585, registered office [address]. Employers' and public liability insurance held, certificates on request. All staff PAYE employed.

Company name, number, place of registration and registered office must also appear in the footer of every page.

## Constraints

- No cookies or analytics unless I ask — keeps the cookie banner off and the privacy notice simple
- Everything I can edit myself: rates, copy and contact details in one obvious config file, not scattered through markup
- Accessible: proper heading order, labelled form fields, keyboard navigable, contrast that passes AA
- Fast: no heavy frameworks for what is fundamentally a brochure site

## Done when

- Both paths complete and readable end to end on a phone
- Both forms working and submitting somewhere I can actually see
- Terms and privacy notice drafted, flagged for legal review
- Company details in every footer
- Rates and copy editable from one file
- You've told me what still needs a decision from me

Work in stages and check in after the structure is up and before you write the legal pages.

---
---

## Suggested `CLAUDE.md`

Keep it this short — it reloads on every turn.

```
# Vergo website

- All copy and rates come from vergo-website-copy.md. Never invent rates.
- Rates, copy and contact details live in one config file, not in markup.
- No analytics, no cookies, no tracking.
- Mobile first. Most enquiries arrive on a phone, late and urgent.
- Legal pages are drafts pending solicitor review — mark them as such.
```
