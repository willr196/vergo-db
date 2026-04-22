# VERGO Website — Remaining Fixes

You are working on the VERGO Events website (vergoltd.com), a London-based event staffing agency. The codebase is TypeScript/Node.js/React with Prisma ORM, PostgreSQL (Neon), deployed on Fly.io. The Fly.dev origin is `vergo-app.fly.dev`.

Complete all tasks below. Do not skip any. Work through them in order.

---

## 1. Sticky mobile WhatsApp widget

Add a floating WhatsApp button visible on all pages, fixed to the bottom-right corner.

**Specs:**
- Position: `fixed`, bottom-right, 16px from edges
- Colour: VERGO gold (`#C8A951`) background, white WhatsApp icon
- Shape: circle, ~56px diameter, subtle box-shadow
- Links to: `https://wa.me/447506615242?text=Hi%2C%20I%27d%20like%20to%20enquire%20about%20staffing%20for%20an%20event`
- Show on all pages, all screen sizes
- On mobile: prominent. On desktop: slightly smaller or same size is fine
- Add a subtle hover/tap scale effect
- z-index high enough to sit above all other content
- Use an inline SVG for the WhatsApp icon (don't add a dependency for this)
- `aria-label="Chat on WhatsApp"` for accessibility
- Do NOT use a third-party widget library

---

## 2. Job board — seed register-interest listings

The job board at `/jobs` currently shows "No jobs available". Seed it with 7 evergreen register-interest listings so the page always has content.

**Check the Prisma schema first** to understand the job/listing model — field names, required fields, enums, relationships. Then create a seed script or Prisma migration data insert for these 7 roles:

| Title | Role |
|---|---|
| Bartender — Register Interest | Bartender |
| Barista — Register Interest | Barista |
| Front of House — Register Interest | Front of House |
| Waiter — Register Interest | Waiter |
| Chef — Register Interest | Chef |
| Kitchen Porter — Register Interest | Kitchen Porter |
| Runner — Register Interest | Runner |

For each listing:
- **Type**: VERGO (internal), not external
- **Location**: London
- **Description**: "We're always looking for experienced [role] staff for events across London. Register your interest and we'll be in touch when the right shift comes up."
- **Status**: published/active (whatever the schema uses)
- **Application path**: should link to `/apply#application-form`
- **Do NOT set an expiry date** — these should persist indefinitely
- **Pay field**: leave blank or use a generic note like "Depends on brief" — do not put specific rates

If the schema has fields you're unsure about, check existing seed files or the admin dashboard code for reference values.

---

## 3. Hero CTA visual hierarchy

On the homepage hero section, there are currently two equal buttons: "Hire Staff" and "Join VERGO". Update the styling so:

- **"Hire Staff"** is the primary CTA — filled button, VERGO gold background (`#C8A951`), dark text, larger/more prominent
- **"Join VERGO"** is secondary — outlined/ghost button style (gold border, transparent background, gold text), same height but visually recessive

Do not remove either button. Just make "Hire Staff" clearly dominant.

---

## 4. FAQ page — verify and fix Shortlist pricing

Check the FAQ page (`/faq`). Find the answer to "How does Shortlist pricing differ from Standard?" — if it still says "Wage + £4/hr + VAT", change it to "Wage + £3/hr + VAT". The correct Shortlist fee is £3/hr (£2/hr base + £1/hr merit uplift).

Also check for any other references to £4/hr or £3/hr Standard anywhere on the FAQ page and correct them. The correct figures are:
- Standard: Wage + £2/hr + VAT
- Shortlist: Wage + £3/hr + VAT

---

## 5. Cookie/GDPR consent banner

Add a simple cookie consent banner that appears on first visit.

**Specs:**
- Appears at the bottom of the viewport on first page load
- Text: "This site uses cookies to improve your experience." with a link to `/privacy` labelled "Privacy Policy"
- Two buttons: "Accept" (primary, gold) and "Decline" (secondary/text)
- On Accept or Decline: hide the banner and set a cookie or localStorage flag so it doesn't reappear
- Keep it minimal — one line on desktop, stacks neatly on mobile
- Subtle background (dark or semi-transparent), doesn't obstruct content aggressively
- No third-party cookie consent library needed — keep it simple

---

## 6. Blog dates — update to 2026

Both blog articles currently show December 2024 dates and "2024" in their titles. Update them:

### Article 1: Event Staffing Costs
- **File**: find the blog post at `/blog/event-staffing-costs-london-2024` (may be an HTML file or template)
- Change title from "Event Staffing Costs in London: 2024 Market Rates" → "Event Staffing Costs in London: 2026 Market Rates"
- Change date from "December 10, 2024" → "April 2026"
- Change all references to "2024" within the body to "2026" (e.g. "2024 Event Staff Rates at a Glance" → "2026 Event Staff Rates at a Glance")
- Update the URL/slug if it contains "2024" → use "2026" equivalent
- Update any internal links or references to this article elsewhere (blog index, pricing page link)

### Article 2: How to Hire Bartenders
- **File**: find the blog post at `/blog/how-to-hire-bartenders-london`
- Change date from "December 15, 2024" → "April 2026"
- Change title references from "2024 Guide" → "2026 Guide" if present in the body
- Update the URL/slug if it contains "2024"

### Blog index page:
- Update any date displays on the blog listing cards to match

---

## 7. Blog navigation consistency

The blog index page (`/blog`) currently uses a different nav from the rest of the site. It shows: Roles / Why VERGO / Event Types / Clients & Workers.

Change the blog index page and all blog article pages to use the same main navigation as the rest of the site:

**Home | Hire Staff | Job Board | Join VERGO | Pricing | About | Contact**

Also make sure individual blog articles have this same nav (currently they only have breadcrumbs, no main nav bar).

---

## Pre-flight checks before committing

After completing all tasks, verify:

1. Homepage hero has one dominant gold "Hire Staff" button and one secondary outlined "Join VERGO" button
2. Floating WhatsApp button appears on homepage, hire-staff, pricing, contact, apply, about, jobs, faq, blog, and blog article pages
3. Job board shows 7 register-interest listings (not "No jobs available")
4. FAQ Shortlist pricing says £3/hr not £4/hr
5. Cookie banner appears on first visit and dismisses properly
6. Blog articles show 2026 dates and titles
7. Blog pages use the standard site navigation
8. No console errors on any page
