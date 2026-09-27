# blog-implementation-brief.md

How a post in `apps/api/content/blog/` becomes a page on `vergoltd.com/blog`. The editorial
rules live in [VERGO-BLOG-SYSTEM.md](./VERGO-BLOG-SYSTEM.md); this file covers the
machinery only.

---

## The pipeline

```
apps/api/content/blog/<slug>.md
        |
        |  read, parsed and linted on request (apps/api/src/site/blog/)
        v
/blog/<slug>     the post
/blog            the index
/sitemap.xml     one entry per published post, dated by its `updated:`
```

Nothing is generated or committed besides the `.md`. The server re-reads a post
when its file changes, so a deploy with a new or edited `.md` is all it takes.
The parser, loader, lint and templates (`markdown.js`, `post.js`, `lint.js`,
`template.js`) are the ones the old build step used, unchanged.

## Commands

Run from the repo root.

| Command | What it does |
| --- | --- |
| `npm run blog:check` | Lints every post, including drafts. Writes nothing. |

A post with lint errors isn't served, and the unit test "every blog post passes
the editorial lint" fails on it, so CI stops it before a deploy. Warnings print
and don't block.

After editing, run the site's own checks from `apps/api`:

```
npm test
```

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

## What the lint enforces

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

`apps/api/src/site/blog/template.js` produces both pages. They follow the same public-page
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

`apps/api/src/index.ts` serves `/blog` and `/blog/<slug>` from
`renderBlogPage()`, through the same shared header, footer and `{{TOKENS}}` as
every other page. `/blog.html` and `/blog/<slug>.html` 301 to the clean URLs.

`robots.txt` allows everything outside `/api`, `/admin*` and `/login`.

With no published posts, `/blog` renders with `noindex, nofollow` and has no
post entries in the sitemap.

`/blog` is in the site footer on every public page.

## Adding a post, end to end

1. Run the interview protocol in [VERGO-BLOG-SYSTEM.md](./VERGO-BLOG-SYSTEM.md).
   Do not skip it, and do not fill gaps yourself.
2. Write `apps/api/content/blog/<slug>.md` with `draft: true`.
3. `npm run blog:check` until it is clean.
4. `cd apps/api && npm run dev`, and read the page at
   `http://localhost:3000/blog/<slug>`. Drafts show on a development server
   only, as `noindex`.
5. Hand Will the "verify before publishing" list. Wait for his answers.
6. Set `draft: false`, commit the `.md`, and deploy.
