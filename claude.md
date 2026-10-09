# VERGO Events Platform

## Architecture
Monorepo with two apps:
- `apps/api` - Express.js backend, Prisma ORM, PostgreSQL, deployed on Fly.io
- `apps/mobile` - React Native/Expo (TypeScript), Zustand state, Axios API client
- `apps/api/public/` - Web frontend (static HTML/JS pages)
- VERGO Ops (`/ops`) is the one operations console; VERGO Scheduling was folded into it
  (9 Oct 2026). Its `sched_*` tables are read only, for Ops > Import. See docs/VERGO-OPS.md

## Auth
- Web: session-based (`express-session`, cookie `vergo.sid`)
- Mobile: JWT (`Authorization: Bearer <token>`), access tokens 15m, refresh tokens 30d
- Mobile endpoints: `/api/v1/mobile/*` and `/api/v1/user/mobile/*`, `/api/v1/client/mobile/*`

## Commands
- API: `cd apps/api && npm run dev` (dev), `npm run build` (build), `npm start` (prod)
- Mobile: `cd apps/mobile && npx expo start`
- DB: `cd apps/api && npx prisma migrate dev`, `npx prisma generate`
- Type check mobile: `cd apps/mobile && npx tsc --noEmit`

## Code Style
- TypeScript throughout (mobile), ES modules
- Mobile uses Zustand stores in `src/store/`
- API responses: web returns raw JSON, mobile wraps in `{ ok: true, ... }`
- Theme (public site, from 28 Sept 2026): dark charcoal, not black (#1C1F22 bg,
  #25292D surface, #F3F1EC ink, #6FC29B green accent with #0F1D17 button ink),
  tokens on :root in vergo-site.css. The Premium rate card sits a shade deeper
  and the Halloween page keeps its own near-black palette. The login page
  (vergo-public-pages.css) and the admin panel (#D4AF37) have their own styles.
- Public pages are Eta templates in apps/api/views/pages/, rendered on request
  (routes: VIEW_ROUTES in src/site/view.ts; blog: content/blog/*.md). Prices,
  terms, contact details and the header/footer/rate/guarantee blocks come from
  src/config/pricing.ts and src/site/, overlaid by what's edited in Admin >
  Site content (src/site/store.ts). In templates use it.t.* and it.blocks.*.
  Never hand-write a price or promise into a page. See README.md.

## IMPORTANT
- Always run type checking after mobile changes
- Test API changes against both web session auth AND mobile JWT auth
- Prisma schema is source of truth for data model

## Admin Panel
- Location: apps/api/public/
- Pages: admin.html (roster/dashboard), admin-jobs.html, admin-job-applications.html, admin-clients.html
- Backend routes: apps/api/src/routes/adminClients.ts, adminJobs.ts etc.
- Auth: session-based (web), same as the rest of the web platform
- Stack: vanilla HTML/CSS/JS (no framework), dark theme (#0a0a0a bg, #D4AF37 gold accent).
  Admin keeps #D4AF37; the public site is dark charcoal with a green accent.
- Chart library to use: Chart.js from cdnjs CDN
```

---

**Step 3 — Run it:**
```
/clear
/build-admin