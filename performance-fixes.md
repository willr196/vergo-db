# VERGO Performance Fixes — Implementation Guide

Run these in order with Claude Code or manually. Each section is self-contained.

---

## Fix 1: Add Compression Middleware (🔴 Critical)

### Install dependency
```bash
cd apps/api
npm install compression
npm install -D @types/compression
```

### Edit `apps/api/src/index.ts`

Add the import near the top with other imports:
```typescript
import compression from 'compression';
```

Add the middleware **before** `express.json()` and **after** CORS:
```typescript
// Compression (before other middleware)
app.use(compression());
```

The line should go right after:
```typescript
app.use(cors({ ... }));
```

And before:
```typescript
app.use(express.json({ limit: '5mb' }));
```

---

## Fix 2: Add Static Asset Cache Headers (🔴 Critical)

### Edit `apps/api/src/index.ts`

Replace this line:
```typescript
app.use(express.static(pub, { extensions: ['html'] }));
```

With:
```typescript
// Static files with cache headers
// CSS/JS/images cached for 7 days, HTML not cached (for fresh content)
app.use(express.static(pub, {
  extensions: ['html'],
  maxAge: '7d',
  setHeaders: (res, filePath) => {
    // Don't cache HTML files (so updates are immediate)
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    // Long cache for versioned assets
    if (filePath.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|webp|woff|woff2)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    }
  }
}));
```

---

## Fix 3: Remove .bak Files from Production (🟡 Important)

### Option A: Add to `.dockerignore`
Edit `apps/api/.dockerignore` — add these lines:
```
*.bak
public/fix-vergo-files.py
public/blog/social-proof-components.html
```

### Option B: Delete them entirely (recommended)
```bash
cd apps/api/public
rm -f *.bak
rm -f blog/social-proof-components.html
rm -f fix-vergo-files.py
```

---

## Fix 4: Move GA Script to Bottom of Body (🟡 Important)

For **every HTML file** that has the GA tag at the top of `<head>`, move it to just before `</body>`.

**Files to update:** `blog.html`, `hire-us.html`, and any others with GA in `<head>`.

### Remove this block from `<head>`:
```html
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-L4XRTDYMTZ"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-L4XRTDYMTZ');
</script>
```

### Add it just before the closing `</body>` (before other scripts):
```html
  <!-- Google Analytics (non-blocking) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-L4XRTDYMTZ"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-L4XRTDYMTZ');
  </script>

  <script src="/vergo-utils.js"></script>
  <script src="/vergo-nav.js"></script>
  <script src="/vergo-footer.js"></script>
  <script src="/vergo-analytics.js"></script>
</body>
```

### Bash script to automate across all files:
```bash
cd apps/api/public

# Find all HTML files with GA in <head> and list them
grep -rl "googletagmanager.com/gtag" --include="*.html" .
```

Then for each file, use your editor or sed to relocate the block.

---

## Fix 5: Add Fly.io Static File Serving & Health Checks (🟡 Important)

### Edit `apps/api/fly.toml`

Replace the full contents with:
```toml
app = "vergo-app"
primary_region = "lhr"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 3000
  force_https = true
  auto_start_machines = true
  auto_stop_machines = "off"
  min_machines_running = 1
  processes = ["app"]

[deploy]
  release_command = "npm run prisma:deploy"

# Serve static assets from Fly's edge CDN (bypasses Node)
[[statics]]
  guest_path = "/app/public"
  url_prefix = "/images"

[[statics]]
  guest_path = "/app/public"
  url_prefix = "/vergo-"

# Health checks
[[services.http_checks]]
  interval = 10000
  grace_period = "10s"
  method = "get"
  path = "/health"
  protocol = "http"
  timeout = 2000
```

> **Note:** The `[[statics]]` blocks serve files matching those URL prefixes directly from Fly's edge network without hitting your Node.js server. This is free CDN caching.

---

## Fix 6: Move Nav Styles from JS to CSS (🟡 Important)

### Edit `apps/api/public/vergo-header.css`

Ensure it contains ALL the nav styles that are currently being injected by `vergo-nav.js`. The header CSS file already has most of them, so this is mainly about verifying completeness.

### Edit `apps/api/public/vergo-nav.js`

Remove the entire `navCSS` variable and the style injection code. The JS should only handle:
- Injecting the HTML markup
- Toggle menu functionality
- Dropdown behaviour

Remove the block that looks like:
```javascript
const navCSS = `
  <style id="vergo-nav-styles">
    header { ... }
    ...
  </style>
`;
```

And remove any line like:
```javascript
document.head.insertAdjacentHTML('beforeend', navCSS);
```

---

## Fix 7: Strip Duplicate Inline CSS from HTML Files (Medium Effort)

This is the biggest job. Every HTML file has hundreds of lines of inline `<style>` blocks duplicating header, footer, nav, button, and grid styles already in the shared CSS files.

### Strategy
For each HTML page, remove inline `<style>` blocks that duplicate content from:
- `vergo-styles.css` (buttons, grids, forms, dashboard)
- `vergo-header.css` (header, nav, footer)
- `vergo-mobile.css` (responsive overrides)

**Keep only page-specific styles** (e.g., hero gradients unique to that page, pricing calculator styles).

### Files to clean (in priority order):
1. `index.html` — homepage, most visited
2. `contact.html` — key conversion page
3. `hire-staff.html` — key service page
4. `hire-us.html` — key service page
5. `about.html`
6. `pricing.html`
7. `jobs.html`
8. `apply.html`
9. `blog.html`
10. `faq.html`
11. `privacy.html` / `terms.html`

### What to keep inline (page-specific):
- Unique hero section backgrounds/gradients
- Page-specific component styles (e.g., pricing calculator, FAQ accordion)
- Anything not covered by the shared CSS files

### What to remove (duplicated):
- Header/nav styles (all in `vergo-header.css`)
- Footer styles (all in `vergo-header.css`)
- Button styles (`.cta-button`, `.btn-primary` — all in `vergo-styles.css`)
- Grid styles (`.services-grid`, `.roles-grid` — all in `vergo-styles.css`)
- Mobile menu toggle styles (all in `vergo-mobile.css`)
- Form input/textarea styles (all in `vergo-styles.css`)

---

## Fix 8: Add Image Lazy Loading (Quick Win)

### For all `<img>` tags in HTML files, add `loading="lazy"`:

```bash
cd apps/api/public
# Find all img tags without loading attribute
grep -rn '<img ' --include="*.html" . | grep -v 'loading='
```

For each match, add `loading="lazy"` and `decoding="async"`:
```html
<!-- Before -->
<img src="/images/photo.jpg" alt="Event">

<!-- After -->
<img src="/images/photo.jpg" alt="Event" loading="lazy" decoding="async">
```

**Exception:** Don't add `loading="lazy"` to the logo image in the header (it's above the fold).

---

## Fix 9: Add Security & Performance Response Headers

### Edit `apps/api/src/index.ts`

The current helmet config disables CSP. Update it:
```typescript
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// Additional performance headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-DNS-Prefetch-Control', 'on');
  res.setHeader('Connection', 'keep-alive');
  next();
});
```

---

## Fix 10: Update Blog Posts to Use Shared Styles

Blog post HTML files (e.g., `how-to-hire-bartenders-london.html`, `event-staffing-costs-london-2024.html`) each contain their own full CSS theme inline and load Google Fonts independently.

### For each blog post:
1. Remove the inline `<style>` block
2. Add shared stylesheet links in `<head>`:
```html
<link rel="stylesheet" href="/vergo-a11y.css">
<link rel="stylesheet" href="/vergo-styles.css">
<link rel="stylesheet" href="/vergo-header.css">
<link rel="stylesheet" href="/vergo-mobile.css">
```
3. Keep only blog-article-specific styles (article typography, reading width, etc.) in a small inline `<style>` or a new `vergo-blog.css`
4. Remove the standalone header/nav HTML and let `vergo-nav.js` handle it

---

## Deployment Checklist

After implementing all fixes:

```bash
# 1. Test locally
cd apps/api
npm run build
npm start
# Visit http://localhost:3000 and check all pages

# 2. Check compression is working
curl -H "Accept-Encoding: gzip" -I http://localhost:3000/index.html
# Should see: Content-Encoding: gzip

# 3. Check cache headers
curl -I http://localhost:3000/vergo-styles.css
# Should see: Cache-Control: public, max-age=604800, immutable

# 4. Deploy
fly deploy

# 5. Verify production
curl -H "Accept-Encoding: gzip" -I https://vergo-app.fly.dev
```

---

## Expected Impact

| Fix | Performance Gain | Effort |
|-----|-----------------|--------|
| Compression | ~60-80% smaller transfers | 5 min |
| Cache headers | Eliminates repeat downloads | 5 min |
| Remove .bak files | Smaller Docker image, no info leak | 2 min |
| Move GA to bottom | Faster initial render | 10 min |
| Fly.io statics | CDN-served assets, lower latency | 5 min |
| Nav styles to CSS | Eliminates FOUC on nav | 15 min |
| Strip inline CSS | ~50-70% smaller HTML files | 1-2 hrs |
| Lazy loading images | Faster initial page load | 10 min |
| Response headers | Better security + keep-alive | 5 min |
| Blog shared styles | Consistent styling, smaller pages | 30 min |
