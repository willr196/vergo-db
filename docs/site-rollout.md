# Server-rendered site: rollout and rollback

## What ships in the next deploy

`main` now carries the whole site-fix brief (Phases 7 to 13) and these parts of
the dynamic-site brief:

| Stage | Pages served from `views/pages/*.eta` |
|---|---|
| A | `/terms`, `/privacy`, `/legal`, `/about`, `/work` |
| B | `/hire/waiting-staff`, `/hire/bar-staff`, `/hire/kitchen-porters`, `/hire/weddings`, `/hire/production-catering`, `/hire` |
| C (held until November) | `/special-events`, `/special-events/christmas`, `/special-events/halloween`, `/book-an-event`, `/`, `/hire/quote`, `/work/apply`, the blog |

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
