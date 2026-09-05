# content/blog

Post sources. One `.md` file per post, named for its slug.

- Editorial rules: [`docs/VERGO-BLOG-SYSTEM.md`](../../docs/VERGO-BLOG-SYSTEM.md)
- File format and build: [`docs/blog-implementation-brief.md`](../../docs/blog-implementation-brief.md)

Build from the repo root:

```
npm run blog:check    # lint only
npm run blog:build    # write apps/api/public/blog/ and the sitemap block
```

Files starting with `_` are ignored by the build. `_TEMPLATE.md` is the skeleton
to copy when starting a post.

Nothing here is served directly. The build writes HTML into
`apps/api/public/blog/`, and that HTML is what ships.
