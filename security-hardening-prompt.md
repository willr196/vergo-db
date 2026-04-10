# Security Hardening — Single Session

Fix the following security issues in priority order. All changes are in `apps/api/`.

---

## 1. Delete the stale compiled seed file

**File:** `apps/api/prisma/seed.js`

This compiled JS file has a hardcoded fallback password (`'arsenal'`). The canonical source is `prisma/seed.ts` which correctly requires `ADMIN_PASSWORD` as an env var. The `package.json` seed script already runs `tsx prisma/seed.ts`, so `seed.js` is unused and dangerous.

**Action:** Delete `apps/api/prisma/seed.js` entirely.

---

## 2. Enable Content Security Policy (CSP)

**File:** `apps/api/src/index.ts`

Currently: `helmet({ contentSecurityPolicy: false })`

Replace with a working CSP that allows VERGO's own assets, Google Analytics (gtag), Google Fonts (if used), and inline styles (needed for the static HTML pages which use `<style>` blocks). Block everything else.

**Replace the helmet call with:**

```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "https://www.googletagmanager.com",
        "https://www.google-analytics.com",
        "'unsafe-inline'"  // needed for inline onclick handlers in static pages — revisit later
      ],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://www.google-analytics.com", "https://*.amazonaws.com"],
      connectSrc: [
        "'self'",
        "https://www.google-analytics.com",
        "https://region1.google-analytics.com",
        "https://api.whatsapp.com",
        "https://*.amazonaws.com"  // S3 presigned CV uploads
      ],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"]
    }
  }
}));
```

**Notes:**
- `'unsafe-inline'` for scripts is not ideal but necessary for now because the static HTML pages use inline event handlers and `<script>` blocks. A follow-up task can move these to external files and switch to nonce-based CSP.
- Several HTML pages reference a Cloudflare email-decode script at `/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js`. Since VERGO is deployed on Fly.io (not behind Cloudflare), these scripts don't load and are dead code. The CSP will cause console errors for them, which is fine — but ideally remove these `<script>` tags in a separate cleanup pass. Do NOT attempt to fix them in this session — it would touch too many HTML files and is outside scope.
- `vergo-nav.js` and `vergo-footer.js` dynamically inject `<style>` blocks via JS. This is covered by `'unsafe-inline'` in `styleSrc`.

---

## 3. Strip dev origins from CORS in production

**File:** `apps/api/src/index.ts`

Currently CORS allows `localhost` origins even in production. Change to environment-aware:

```typescript
const allowedOrigins = [env.webOrigin];

if (env.nodeEnv !== 'production') {
  allowedOrigins.push(
    `http://localhost:${env.port}`,
    'http://localhost:8080'
  );
}

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
```

**Important:** `WEB_ORIGIN` in the Fly.io production env should be set to `https://vergo-app.fly.dev` (or whatever the canonical production URL is). This means the production CORS list will contain only the production origin. The hardcoded `'https://vergo-app.fly.dev'` string that's currently in the array should be removed — it's redundant with `env.webOrigin` in production and shouldn't be present in dev.

---

## 4. Reduce global JSON body size limit

**File:** `apps/api/src/index.ts`

Currently: `express.json({ limit: '5mb' })`

5MB is very generous for an API that mostly handles form submissions and JSON payloads. Reduce the global limit to `'100kb'`. If any specific route genuinely needs a larger body (e.g. file upload metadata), add a per-route override there.

```typescript
app.use(express.json({ limit: '100kb' }));
```

---

## 5. Add `.gitignore` entry for compiled seed

**File:** `apps/api/.gitignore` (or root `.gitignore`)

Add `prisma/seed.js` to prevent the compiled file from being re-committed. Check which gitignore is appropriate (there may be a root-level one covering the monorepo).

---

## Verification

After making changes:
1. Confirm `apps/api/prisma/seed.js` no longer exists
2. Confirm `npm run build` still succeeds (the seed.js deletion shouldn't affect build since seed runs via tsx)
3. Confirm the helmet CSP config has no TypeScript errors
4. Confirm CORS origins array is environment-aware
5. Confirm body parser limit is `'100kb'`
