# vergo-db

VERGO's platform: the public site at vergoltd.com, the admin panel, the API
and the mobile app. See `CLAUDE.md` for the layout of the monorepo.

## The public site

Every public page is rendered by the API (`apps/api`, Express) on request.
The URLs, the look and the forms are what they were when the pages were
static HTML; the difference is that prices, contact details, reviews, FAQs,
photos and seasonal offers now come from one place and can be edited in the
admin panel.

### Where things live

| What | Where |
|---|---|
| Page templates, one per page | `apps/api/views/pages/*.eta` |
| The shared layout (`<head>`, header, `<main>`, footer) | `apps/api/views/layouts/base.eta` |
| Shared blocks: header, footer, rate block, guarantees, CTA, FAQs, reviews, season section… | `apps/api/views/partials/*.eta` |
| Page list (URL to template) | `VIEW_ROUTES` in `apps/api/src/site/view.ts` |
| Prices and terms (defaults) | `apps/api/src/config/pricing.ts` |
| Contact details (defaults) | `apps/api/src/site/content.ts` |
| Editable content, in memory | `apps/api/src/site/store.ts` |
| Blog posts | `apps/api/content/blog/*.md` (see its README) |
| Stylesheets, scripts, images | `apps/api/public/` |

Templates are [Eta](https://eta.js.org). `<%= %>` escapes, `<%~ %>` doesn't
(use it only for trusted markup). In a page, the shared blocks are
`<%~ it.blocks.rates() %>`, `<%~ it.blocks.guarantees() %>`,
`<%~ it.blocks.cta({ heading: "…" }) %>` and so on, and prices and details are
`<%~ it.t.STANDARD_RATE %>`, `<%~ it.t.PHONE %>` (the full list is
`siteTokens()` in `src/site/content.ts`). Never type a price or a promise into
a template: the consistency test fails on it.

### How content reaches a page

`pricing.ts` and `content.ts` hold the built-in values. Once the site content
has been imported (Admin > Site content > Import, once), the database holds
the live values and they're laid over the built-in ones. The API keeps the
last good copy in memory, refreshes it every minute and straight after an
admin save, and never waits more than 500ms for the database: if it's slow or
down, pages render from the last good copy.

### Adding a page

1. Create `apps/api/views/pages/<name>.eta`. Start from a similar page: the
   first lines call `layout('/layouts/base', { meta: { title, description,
   canonical, ogImage }, jsonLd: [...] })`, and the rest is what goes in
   `<main>`.
2. Add `{ path: '/<name>', view: '<name>' }` to `VIEW_ROUTES` in
   `apps/api/src/site/view.ts`.
3. Add it to `PAGES` in `apps/api/src/site/sitemap.ts` if it should be indexed,
   and add a word budget for it in `src/__tests__/site-consistency.test.ts`.
4. `cd apps/api && npm run build && npm test`. The tests check every page for
   one `h1`, its canonical, its title, the shared header and footer, word
   budgets, stray prices, and links that go nowhere.

### Editing content (Admin > Site content)

- **Settings**: rates, the Premium switch, the promises, contact details and
  slogan. The preview shows the rate and guarantee blocks as they'll read
  before you save.
- **Reviews**: add, edit, reorder; tick where each one shows (homepage, /hire).
  60 words at most, and only real, attributable quotes.
- **Recent work**: one line per job, 12 words at most.
- **Photos**: upload, add alt text (required), tag where they show. They're
  resized to 800px and 1600px WebP and stored in S3.
- **FAQs**: pick the page, then add, edit or reorder. Two sentences and 45
  words at most per answer.
- **Seasonal promos**: the dates the banner, header item and homepage section
  run, their text and links. Next year's Halloween and Christmas are edited
  here, not in code.
- **History**: who changed what, and when.

Every save is live straight away; there's nothing to deploy.

### Running it locally

```
cd apps/api
npm install
npm run build
PORT=4310 npm start        # or npm run dev
```

Port 3000 is often taken on this machine; use another. Clear `RESEND_API_KEY`
before submitting any form locally, or it sends real email.

### Deploying and rolling back

See [`docs/site-rollout.md`](docs/site-rollout.md).
