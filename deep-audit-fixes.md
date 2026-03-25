# Current Cleanup List

Checked against the repo state on `2026-03-17`.

## Already complete

- No `.bak` files remain under `apps/api/public/`.
- `apps/api/public/fix-vergo-files.py` is already gone.
- `apps/api/public/admin.html` and `apps/api/public/admin-jobs.html` already contain `noindex, nofollow`.
- `apps/api/public/privacy.html` and `apps/api/public/terms.html` already show `Last Updated: March 2026`.
- `apps/api/cors.json` already includes `https://vergoltd.com`.
- `privacy.html`, `terms.html`, and `post-job.html` already use the shared public shell via `vergo-public-shell.js`, so the old `vergo-nav.js` / `vergo-footer.js` rewrite steps are obsolete.

## Completed in this pass

1. Remove the dead `/hire-us` route grouping from `apps/api/public/vergo-public-shell.js`.
2. Expand `apps/api/public/robots.txt` so the admin route list is explicit:
   `/admin`, `/admin-clients`, `/admin-jobs`, `/admin-job-applications`, `/admin-marketplace`, `/admin-bookings`, `/admin-quotes`, `/admin-comms`, `/admin-analytics`, and `/login`.
3. Refresh `apps/api/public/sitemap.xml` lastmod dates to `2026-03-17`.

## Not carried forward from the original note

- Keep the real blog post URLs in `sitemap.xml`. The blog post files exist and should stay indexed unless content strategy changes.
- Do not treat `vergo-nav.js` and `vergo-footer.js` as the live shell for the public pages listed above; `vergo-public-shell.js` is the active shared component there.
- `apps/api/public/hire-us.html` can remain on disk for now because the server already 301-redirects `/hire-us` and `/hire-us.html` to `/hire-staff`.

## Verification

- `apps/api/public/vergo-public-shell.js` no longer includes `/hire-us` in the `hire` route group.
- `apps/api/public/robots.txt` explicitly lists the admin routes above.
- Every `<lastmod>` in `apps/api/public/sitemap.xml` is `2026-03-17`.
