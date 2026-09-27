# content/blog

Post sources. One `.md` file per post, named for its slug.

- Editorial rules: [`docs/VERGO-BLOG-SYSTEM.md`](../../../../docs/VERGO-BLOG-SYSTEM.md)
- File format: [`docs/blog-implementation-brief.md`](../../../../docs/blog-implementation-brief.md)

There is no build step. The API renders `/blog` and `/blog/<slug>` from these
files on request (`apps/api/src/site/blog/`), so publishing a post is:

1. Write `<slug>.md` with `draft: true`, copying `_TEMPLATE.md`.
2. Preview it: run the API locally (`npm run dev` in `apps/api`) and open
   `/blog/<slug>`. Drafts show on a development server only, as `noindex`.
3. From the repo root, `npm run blog:check` (lint, drafts included).
4. Set `draft: false`, commit the `.md`, deploy. The post, the `/blog` index and
   the sitemap all pick it up.

Files starting with `_` are ignored. A post with lint errors isn't served, and
the unit tests (`site-consistency.test.ts`) fail on one, so CI catches it.
