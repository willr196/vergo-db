# Server-rendered site: rollout and rollback

## What ships in the next deploy

`main` now carries the whole site-fix brief (Phases 7 to 13) and these parts of
the dynamic-site brief:

| Stage | Pages served from `views/pages/*.eta` |
|---|---|
| A | `/terms`, `/privacy`, `/legal`, `/about`, `/work` |
| B | `/hire/waiting-staff`, `/hire/bar-staff`, `/hire/kitchen-porters`, `/hire/weddings`, `/hire/production-catering`, `/hire` |
| C | `/special-events`, `/special-events/christmas`, `/book-an-event`, `/`, `/hire/quote`, `/work/apply`, the 404 page |
| Blog | `/blog` and every post, rendered from `apps/api/content/blog/*.md` |

Every public page has moved; only `/login` (the staff and admin sign-in) is
still a static file.

Also live with it: seasons decided on the server, open shifts on `/work`, the
generated `sitemap.xml`, and the admin "Site content" page.

The release command runs one migration, `20260927120000_add_site_content`,
which only creates seven new tables. Until someone presses **Import site
content** in the admin (or runs `npm run seed:site`), the site ignores those
tables and serves exactly what it serves today.

## Deploy

From `apps/api` (bluegreen is also set in `fly.toml`):

```
fly deploy -a vergo-app --strategy bluegreen
```

Then:

1. Note the release: `fly releases -a vergo-app --json` and copy the new
   version's `ImageRef`. Tag it: `git tag site-stage-ab <commit> && git push --tags`.
2. `node tools/verify-live.mjs`: vergoltd.com and vergo-app.fly.dev must match
   on every sitemap URL. There is no CDN in front of the site, so there is
   nothing to purge; pages carry `s-maxage=60`.
3. Submit one enquiry marked "TEST – ignore" through the quote form (book and
   message), the `/work/apply` form, and the book-an-event brief.
4. Admin > Site content > **Import site content**. Nothing on the site should
   change; check `/hire` and `/hire/weddings` look the same.

## Rollback

Find the previous release's image (the top-level `Image` in `fly status` is the
latest release, not the one before it):

```
fly releases -a vergo-app --json
```

Then deploy that image, replacing `<ImageRef>` with the previous version's:

```
fly deploy -a vergo-app --strategy bluegreen --image <ImageRef>
```

The site-content tables can stay: the old code never reads them.

## The `dynamic-site` release (October 2026)

Adds editable terms and company details, revertable history, drafts with
preview, the rate card in pence, and event pages that switch to next year
after their season, plus the Hire staff dropdown, three new hire pages
(`/hire/front-of-house`, `/hire/event-chefs`, `/hire/private-parties`) and
`/links` for the Instagram bio, and Halloween removed (the page, its promo,
FAQs, blog post and the homepage pumpkin; `/special-events/halloween` and the
blog post 301 to `/special-events`). Five migrations, the first four additive:

| Migration | What it does |
|---|---|
| `20261019120000_promo_event_page` | Two nullable columns on `SeasonalPromo`; fills this year's Halloween line and Christmas end date; swaps the Halloween FAQ's typed dates for `{{SEASON_LINE_HALLOWEEN}}` |
| `20261020120000_content_drafts` | New table `ContentDraft` |
| `20261020130000_rate_card_pence` | New table `Rate`, filled from the amounts in the `rates` setting (pounds to pence) |
| `20261020140000_faqs_for_new_hire_pages` | Adds the default FAQs for cleaners, security, front of house, event chefs and private parties, only where the site content has been imported and that page has none |
| `20261030120000_remove_halloween` | Deletes the Halloween promo, its FAQs, its drafts and the Halloween photo; renames the "Character performers and scare actors" rate to "Character performers" |

Before deploying, compare the branch with `main` locally (both servers on
the same database, see the script's header):

```
COMPARE_DELAY_MS=550 node tools/compare-sites.mjs http://127.0.0.1:<main> http://127.0.0.1:<branch>
```

On 2026-10-20 that was 99 URLs, 0 differing (every sitemap page, each old
`.html` address, every legacy redirect, the 404, `sitemap.xml`, `robots.txt`).
With the new hire pages added (`e081ee8` against them, same database): 105
URLs, 9 differing, all intended: the three new pages and their `.html`
addresses, `/front-of-house-staff-london` and `/event-chefs-london` now
redirecting to them, and the `/hire` intro linking hosts and chefs. The tool
doesn't compare the header, so the dropdown shows up in none of these.

After deploying:

1. `COMPARE_DELAY_MS=550 node tools/compare-sites.mjs https://vergoltd.com https://vergo-app.fly.dev`: 0 differing.
2. Admin > Site content: the Rates tab shows £19.00, £24.00, £21.00, £26.00,
   £35.00; History lists nothing new; `/special-events/halloween` answers
   301 to `/special-events`, and the Seasonal promos tab lists Christmas only.
3. To see that public pages leave the database alone, run a machine with
   `LOG_DB_QUERIES=1` and read its log: every `[DB] GET /<page>` line says 0
   queries, except the one reload a page view triggers when the in-memory copy
   is over 10 minutes old.

### Rolling it back

Redeploy the previous image, as above. The new tables and columns can stay;
the old code never reads them. Two things the old code reads differently,
each fixed with one statement (run them in the Neon console):

1. The old code still serves `/special-events/halloween`. With its promo and
   FAQs deleted it renders with no dates line and no FAQs; nothing to run,
   but the Halloween link comes back on the homepage and the hub.

2. The old code reads the five rates from the `rates` setting, in pounds. If
   a rate was changed on the new Rates tab, or the "Premium and surcharges"
   card was saved (which drops the old amounts from that row, so the old code
   would fall back to the built-in rates and surcharges), copy the card back:

   ```sql
   UPDATE "SiteSetting" SET "value" = "value" || jsonb_build_object(
     'standardRate',       (SELECT "amountPence" FROM "Rate" WHERE "key" = 'standard') / 100.0,
     'premiumRate',        (SELECT "amountPence" FROM "Rate" WHERE "key" = 'premium') / 100.0,
     'themedHospitality',  (SELECT "amountPence" FROM "Rate" WHERE "key" = 'themed_hospitality') / 100.0,
     'characterPerformer', (SELECT "amountPence" FROM "Rate" WHERE "key" = 'character_performer') / 100.0,
     'makeupArtist',       (SELECT "amountPence" FROM "Rate" WHERE "key" = 'makeup_artist') / 100.0)
   WHERE "key" = 'rates';
   ```

Terms, company details, promo page lines, drafts and rates other than the
five are simply not shown by the old code; the pages fall back to what they
said before this release.

There is no per-page switch back to the old static files: those were
deleted when the pages moved to templates (September 2026), and every page
has been served from a template since. A redeploy is the rollback.
