# VERGO Events Platform

## Architecture
Monorepo with three apps:
- `apps/api` - Express.js backend, Prisma ORM, PostgreSQL, deployed on Fly.io
- `apps/mobile` - React Native/Expo (TypeScript), Zustand state, Axios API client
- `apps/api/public/` - Web frontend (static HTML/JS pages)

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
- Theme (public site, from Sept 2026): light (#FAF8F4 bg, #16181B ink, #1F5C45
  green accent), tokens on :root in vergo-site.css. Only the Premium rate card
  and the Halloween page keep a dark treatment. The login page
  (vergo-public-pages.css) and the admin panel (#D4AF37) are still dark.
- Public pages: prices, terms, contact details and the header/footer/rate/
  guarantee blocks come from apps/api/src/config/pricing.ts and src/site/, and
  are filled into the HTML as it is served ({{TOKENS}} and <!--#block--> markers).
  Never hand-write a price or promise into a page.

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
  Admin keeps #D4AF37; the public site is light with a green accent.
- Chart library to use: Chart.js from cdnjs CDN
```

---

**Step 3 — Run it:**
```
/clear
/build-admin