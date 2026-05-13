# VERGO Site Changes — May 2026

## What we're doing and why

Renaming the two staffing routes across the entire public site, fixing weak copy, and adding missing trust signals. No design system changes. No backend changes. Copy and content only.

---

## Confirmed decisions

| Old name | New name | What it actually is |
|---|---|---|
| Standard / Marketplace roster | VERGO Freelance | Vetted self-employed workers connected via VERGO's platform |
| Gold | VERGO Staff | PAYE employed directly by VERGO |

**Employment status confirmed:** VERGO Staff are genuinely PAYE. The current wording on hire-staff.html ("Workers VERGO employs directly (PAYE)") is accurate and can be kept or sharpened.

---

## Files being changed

| File | What changes |
|---|---|
| `public/index.html` | Hero headline, "Marketplace roster" → VERGO Freelance, "Employed team" → VERGO Staff, add credibility strip |
| `public/hire-staff.html` | All Standard/Gold renamed, meta tags updated |
| `public/pricing.html` | All Standard/Gold renamed, title tag, meta, JSON-LD FAQ, calculator labels |
| `public/apply.html` | "Roster to Gold" renamed throughout |
| `public/jobs.html` | Hero heading fixed (was "Live hospitality roles across London") |
| `public/pages/js/jobs.js` | Empty state copy improved |
| `public/quote.html` | "Staffing lane" / Flex/Select/Managed replaced with VERGO Freelance/VERGO Staff |
| `public/about.html` | "Staffing platform" → "staffing company", add credibility section and CTA |

---

## What we are NOT changing

- Any CSS or design system
- Any backend routes, Prisma schema, or API logic
- Form submission endpoints or `name`/`value` attributes on form fields (backend receives same data)
- The pricing calculator logic (`/pages/js/pricing.js`)
- SEO landing pages (`/event-staffing-agency-london`, `/corporate-event-staff-london`, etc.)
- Navigation or footer structure
- Admin panel pages

---

## Copy rules (refer back to this)

**Use:**
- VERGO Freelance (not Standard, not Marketplace, not roster tier)
- VERGO Staff (not Gold, not Gold tier)
- "Vetted self-employed workers" for VERGO Freelance
- "VERGO's directly employed (PAYE) team" for VERGO Staff
- "Connected via VERGO's platform" when describing how Freelance workers are managed
- "Two routes" (not "two tiers", not "two lanes")
- "Route" (not "lane", not "tier" as a label)

**Avoid:**
- Marketplace roster
- Marketplace
- Gold / Gold tier
- Standard
- Staffing lane
- Flex / Select / Managed (client-facing)
- "High quality event staff at the ready"
- "bodies" / "pool of freelancers" / "elite"

---

## Credibility section (homepage and about)

Add where appropriate:

> VERGO LTD is a London-based hospitality staffing company built around clear rates, direct communication and a selective onboarding process. Workers are reviewed before joining, checked where required and briefed against the booking before arrival.

Trust strip text:
> VERGO LTD · Company No. 16627585 · London-based · Vetted before joining · Briefed before arrival · Clear rates

---

## Phase 2 (complete)

- "What vetted means" section added to homepage — CV review + interview with Will (confirmed)
- About page restructured: hero-grid with founder aside, three sections with eyebrow headings, company number
- Contact page: "what happens next" 3-step panel added above the form

## Phase 3 (still to do)

- **Founder photo needed at `/public/images/founder.jpg`** — referenced on homepage and about page but file does not exist yet. Add a real photo to unlock both placements.
- Case studies / recent bookings page (template for future)
- Photography: staff in action, bartender, FOH, runner, kitchen
- Founder video (30–45 sec "why I built VERGO")
- Testimonial collection — send a short message after each successful booking asking for a quote
