# VERGO API Notes

This backend supports **session-based web auth** and **JWT-based mobile auth** side-by-side.

## Web (Sessions)
- Uses `express-session` cookies (`vergo.sid`) with the existing routes:
  - `/api/v1/auth/*` (admin)
  - `/api/v1/user/*` (job seeker web)
  - `/api/v1/client/*` + `/api/v1/clients/*` (client web)
  - `/api/v1/jobs/*`, `/api/v1/job-applications/*`, `/api/v1/applications/*`

These endpoints mostly return raw JSON objects/arrays (legacy web pages depend on this).

## Mobile (JWT)
Mobile endpoints return `{ ok, ... }` payloads and use `Authorization: Bearer <token>`.

### Auth
- Job seeker:
  - `POST /api/v1/user/mobile/login`
  - `POST /api/v1/user/mobile/register` (returns `requiresVerification: true` until verified)
  - `POST /api/v1/user/mobile/refresh`
  - `GET /api/v1/user/mobile/me`
  - `PUT /api/v1/user/mobile/profile`
- Client:
  - `POST /api/v1/client/mobile/login`
  - `POST /api/v1/client/mobile/register` (returns `requiresVerification: true` until verified)
  - `POST /api/v1/client/mobile/refresh`
  - `GET /api/v1/client/mobile/me`
  - `PUT /api/v1/client/mobile/profile`

### Jobs + Applications
- `GET /api/v1/mobile/jobs`
- `GET /api/v1/mobile/jobs/meta/roles`
- `GET /api/v1/mobile/jobs/:id`
- `POST /api/v1/mobile/job-applications`
- `GET /api/v1/mobile/job-applications/mine`
- `GET /api/v1/mobile/job-applications/:id`
- `GET /api/v1/mobile/job-applications/check/:jobId`
- `POST /api/v1/mobile/job-applications/:id/withdraw`

## Tokens
- Access tokens: short-lived (15m)
- Refresh tokens: long-lived (30d)

Refresh tokens are stored and rotated in the database; revocation is enforced on refresh.

## Verification checklist
1. Run migrations to create `RefreshToken` and session tables.
2. Web: load `/login.html` and confirm admin session check works.
3. Web: load `/jobs.html`, confirm roles + jobs load and pagination works.
4. Web: register/login user and verify `/user-dashboard.html` loads applications.
5. Mobile: login and refresh tokens, confirm `/api/v1/user/mobile/me` works.
6. Mobile: browse `/api/v1/mobile/jobs`, open detail, apply, then check `/api/v1/mobile/job-applications/mine`.
