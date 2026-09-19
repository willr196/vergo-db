# blog-implementation-brief.md

How a post in `content/blog/` becomes a page on `vergoltd.com/blog`. The editorial
rules live in [VERGO-BLOG-SYSTEM.md](./VERGO-BLOG-SYSTEM.md); this file covers the
machinery only.

---

## The pipeline

```
content/blog/<slug>.md
        |
        |  node tools/blog/build.js
        v
apps/api/public/blog/<slug>.html     the post
apps/api/public/blog.html            the /blog index
apps/api/public/sitemap.xml          the BLOG:START / BLOG:END block
```

The generated HTML is **committed**. Nothing is rendered at request time, and the
Fly build context is `apps/api`, so `content/` and `tools/` never reach the
container. If you edit a `.md` and don't run the build, the site doesn't change.

## Commands

Run from the repo root.

| Command | What it does |
| --- | --- |
| `npm run blog:check` | Lints every post, including drafts. Writes nothing. |
| `npm run blog:build` | Lints, then writes the published posts, the index and the sitemap block. |
| `npm run blog:drafts` | As above, but also builds `draft: true` posts, marked `noindex, nofollow`. |

Errors abort the whole build; nothing is written until every post passes.
Warnings print and let the build through.

The build also deletes any `apps/api/public/blog/*.html` whose source has gone
or turned into a draft, so the public directory can't drift from `content/blog/`.

After building, run the site's own checks from `apps/api`:

```
npm run validate:pages    # shared meta, shell mounts, skip link
npm run validate:seo      # canonical vs route, sitemap coverage
```

Both were already failing on pre-existing pages before the blog existed. Check
that no `blog` row is among the failures rather than expecting a clean run.

## Post source format

```markdown
---
slug: how-to-read-event-staffing-quote
title: How to read an event staffing quote
metaTitle: How to read an event staffing quote | VERGO
metaDescription: What the line items on a London event staffing quote mean, ...
published: 2026-09-14
updated: 2026-09-14
summary: One line of card copy for /blog. Optional.
draft: false
---

## In short

- Four to five bullets. Each one answers the question outright and stands
  alone out of context.

## Does the quote include holiday pay?

Prose. H2 headings are phrased as questions people actually type.

| What to check | What a good answer sounds like |
| --- | --- |
| Holiday pay | Included in the hourly rate at 12.07 per cent. |

## FAQ

### Is the four-hour minimum per person or per booking?

Two to four sentences, self-contained.
```

Frontmatter fields: `slug`, `title`, `metaTitle`, `metaDescription`, `published`
and `updated` are required; `summary`, `draft` and `ogImage` are optional. Any
other key is an error. Dates are ISO `YYYY-MM-DD`, and `updated` cannot precede
`published`.

### What the file must not contain

- **No H1.** The headline comes from `title`.
- **No raw HTML, images, or fenced code blocks.** These are hard errors.
- `## In short` must be the first block, followed by a bullet list.
- `## FAQ` must exist, with `### Question` headings and prose answers under each.

### Supported markdown

H2/H3/H4 headings, paragraphs, bullet and numbered lists, GFM tables,
blockquotes, `---` rules, `[links](/hire)`, `**bold**`, `*italic*`, `` `code` ``.
Everything else fails the parse rather than passing through unstyled. Links must
be relative, an anchor, `https:`, `mailto:` or `tel:`; `https:` links render with
`target="_blank" rel="noopener"`.

## What the build enforces

Structure, from the REQUIRED STRUCTURE section of the system doc:

- 4 to 5 "In short" bullets, each at least 8 words
- at least 3 H2 sections (warns if they aren't questions)
- at least one table
- exactly 5 FAQ questions (warns if an answer isn't 2 to 4 sentences)
- two or more internal links to `/hire` or `/hire/quote` (warns if both sit in
  the first half of the post)
- 1,200 to 1,800 words
- `metaTitle` under 60 characters, `metaDescription` under 155

House style, from the "Never write this" list: the banned phrases and words,
em-dashes and en-dashes, exclamation marks, emoji, and the "It's not just X,
it's Y" construction. Rhetorical questions opening a section are a warning.

Hard rules: the client names that must never appear, "ex VAT" and "plus VAT"
(VERGO is not VAT registered), and, where statutory figures appear, the
"correct for 2026/27" caveat plus a linked GOV.UK source. A percentage in a
paragraph with no linked source raises a warning.

**What it cannot check** is the rule that matters most: that nothing about VERGO
is invented. A post can pass every check above and still be wrong. The interview
protocol is the only defence against that.

## The page template

`tools/blog/template.js` produces both pages. They follow the same public-page
contract as the rest of the site, which
`apps/api/scripts/validate-page-consistency.js` enforces:

- standard meta (`description`, `viewport`, `theme-color`, favicon, canonical,
  the `og:` tags including `og:site_name`) plus `twitter:card`, and the
  consent-gated analytics script
- the same static header and footer markup as the other public pages
  (`SITE_HEADER` / `SITE_FOOTER` in the template), with `/vergo-site-nav.js`
  building the mobile menu from it. Until September 2026 the blog mounted an
  empty header that `/vergo-public-shell.js` filled in client-side; that header
  had a different design and a broken mobile menu, and crawlers never saw its links.
- a skip link to `#main-content`
- stylesheets: `/vergo-site.css`, then `/vergo-blog.css`, which maps the older
  token names the post styles use onto the site tokens
- `/vergo-site-config.js`, so `data-vergo` bindings and the live
  `/api/v1/rates` lookup work on blog pages too

Article page order, top to bottom: breadcrumb, H1, the published and
last-updated dates, the "In short" panel, the body, the FAQ, the author box, the
CTA panel linking to `/hire/quote` and `/hire`.

### Structured data

Every post carries three JSON-LD blocks: `Article`, `FAQPage` and
`BreadcrumbList`. The index carries `Blog` with a `blogPost` list. The `FAQPage`
answers are the plain text of the FAQ prose, and the `Article` description is
`metaDescription`, so both stay in step with the page without a second edit.

This is the part the whole strategy rests on. The "In short" block and the FAQ
are what AI systems lift into answers, and the JSON-LD is what tells them the
block is an answer rather than decoration.

## Routing

No server changes were needed. `apps/api/src/index.ts` already rewrites a clean
URL to `<path>.html` when that file exists under `public/`, and that works for
nested paths:

- `/blog` serves `public/blog.html`
- `/blog/<slug>` serves `public/blog/<slug>.html`
- `/blog/<slug>.html` 301s to `/blog/<slug>` via the existing canonicaliser

`robots.txt` already allows everything outside `/api`, `/admin*` and `/login`,
so no change there either.

With no published posts, `/blog` is built with `noindex, nofollow` and stays out
of the sitemap. Both clear themselves on the first build that has a post.

`/blog` is in the site footer on every public page.

## Adding a post, end to end

1. Run the interview protocol in [VERGO-BLOG-SYSTEM.md](./VERGO-BLOG-SYSTEM.md).
   Do not skip it, and do not fill gaps yourself.
2. Write `content/blog/<slug>.md` with `draft: true`.
3. `npm run blog:check` until it is clean.
4. `npm run blog:drafts`, then `cd apps/api && npm run dev`, and read the page at
   `http://localhost:3000/blog/<slug>`.
5. Hand Will the "verify before publishing" list. Wait for his answers.
6. Set `draft: false`, run `npm run blog:build`, and commit the `.md` and every
   generated file together.
