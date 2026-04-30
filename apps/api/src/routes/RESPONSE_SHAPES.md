# Mobile API Response Shapes

Canonical envelope for every mobile-facing route handler in `mobile*.ts`.

## Canonical pattern

**Singular resources:**

```json
{ "ok": true, "data": <T> }
```

**Lists:**

```json
{ "ok": true, "data": <T[]>, "pagination": { "page": 1, "limit": 20, "total": 42, "totalPages": 3, "hasMore": true } }
```

**Action-only / no resource:**

```json
{ "ok": true }
```

(Optionally with a `message` string for human-readable confirmation.)

**Errors:**

```json
{ "ok": false, "error": "Reason", "code": "OPTIONAL_CODE", "details": <unknown> }
```

The error envelope is unchanged by this migration.

## Examples

### Singular

`GET /api/v1/mobile/jobs/:id`

```json
{
  "ok": true,
  "data": { "id": "job-1", "title": "Bartender Needed", "...": "..." }
}
```

### List with pagination

`GET /api/v1/mobile/jobs`

```json
{
  "ok": true,
  "data": [ { "id": "job-1", "...": "..." } ],
  "pagination": { "page": 1, "limit": 20, "total": 42, "totalPages": 3, "hasMore": true }
}
```

### Composite singular

When an endpoint returns more than one resource (e.g. dashboard), `data` holds an object that names each child:

`GET /api/v1/client/mobile/dashboard`

```json
{
  "ok": true,
  "data": {
    "stats": { "activeJobs": 5, "totalApplicants": 42, "pendingReview": 7, "staffConfirmed": 12 },
    "recentApplications": [ { "id": "app-1", "...": "..." } ]
  }
}
```

`GET /api/v1/mobile/job-applications/check/:jobId`

```json
{
  "ok": true,
  "data": { "applied": true, "application": { "id": "app-1", "status": "PENDING", "createdAt": "..." } }
}
```

## Rule

Mobile route handlers MUST NOT emit top-level resource keys (`job`, `jobs`, `application`, `applications`, `cities`, `roles`, `stats`, `quote`, `quotes`, `booking`, `bookings`, `staff`, `recentApplications`, etc.). Everything goes under `data`.

The mobile client (`apps/mobile/src/api/*`) reads from `response.data.data` only. Adding a top-level resource key creates a forbidden second source of truth — don't.

## Auth endpoints — exception

`/api/v1/user/mobile/{login,register,refresh,logout,me,forgot-password,profile,profile/avatar}` and the `/api/v1/client/mobile/{login,register,refresh,logout,me,forgot-password,profile,profile/logo}` endpoints are **deliberately exempt** from this canonical shape. They return:

```json
{ "ok": true, "user": { "...": "..." }, "token": "...", "refreshToken": "...", "message": "...", "requiresVerification": false }
```

These are owned by `webAuth.ts` / user / client route modules (not `mobile*.ts`) and migrating them touches the login flow, refresh interceptor, and registration verification path. The risk/reward did not justify pulling them into this migration. If they ever migrate, the mobile `BackendAuthResponse` type and `setAuthTokens` flow will need to move with them.

## Inventory (post-migration)

All routes below now emit the canonical envelope unless marked **(unchanged)**.

### `mobileJobs.ts` — mounted at `/api/v1/mobile/jobs`

| Method | Path           | Shape                                                                                         |
|--------|----------------|-----------------------------------------------------------------------------------------------|
| GET    | `/`            | `{ ok, data: Job[], pagination }`                                                             |
| GET    | `/cities`      | `{ ok, data: string[] }`                                                                      |
| GET    | `/recommended` | `{ ok, data: Job[] }`                                                                         |
| GET    | `/meta/roles`  | `{ ok, data: { id, name }[] }`                                                                |
| GET    | `/saved`       | `{ ok, data: Job[] }`                                                                         |
| POST   | `/:id/save`    | `{ ok }`                                                                                      |
| DELETE | `/:id/save`    | `{ ok }`                                                                                      |
| GET    | `/:id`         | `{ ok, data: Job }`                                                                           |

### `mobileJobApplications.ts` — mounted at `/api/v1/mobile/job-applications`

| Method | Path             | Shape                                                                                       |
|--------|------------------|---------------------------------------------------------------------------------------------|
| POST   | `/`              | `{ ok, data: Application }`                                                                 |
| GET    | `/mine`          | `{ ok, data: Application[], pagination }`                                                   |
| GET    | `/check/:jobId`  | `{ ok, data: { applied: boolean, application: Application \| null } }`                      |
| GET    | `/:id`           | `{ ok, data: Application }`                                                                 |
| POST   | `/:id/withdraw`  | `{ ok, data: Application }`                                                                 |

### `mobileClient.ts` — mounted at `/api/v1/client/mobile`

| Method | Path                                          | Shape                                                                  |
|--------|-----------------------------------------------|------------------------------------------------------------------------|
| GET    | `/stats`                                      | `{ ok, data: ClientQuoteStats }`                                       |
| GET    | `/quotes`                                     | `{ ok, data: Quote[], pagination }`                                    |
| GET    | `/quotes/:id`                                 | `{ ok, data: Quote }`                                                  |
| POST   | `/quotes`                                     | `{ ok, data: Quote }`                                                  |
| DELETE | `/quotes/:id`                                 | `{ ok, message }`                                                      |
| GET    | `/dashboard`                                  | `{ ok, data: { stats: DashboardStats, recentApplications: App[] } }`   |
| GET    | `/jobs`                                       | `{ ok, data: Job[], pagination }`                                      |
| GET    | `/jobs/:id`                                   | `{ ok, data: Job }`                                                    |
| POST   | `/jobs`                                       | `{ ok, data: Job }`                                                    |
| PUT    | `/jobs/:id`                                   | `{ ok, data: Job }`                                                    |
| POST   | `/jobs/:id/close`                             | `{ ok, data: Job }`                                                    |
| GET    | `/jobs/:id/applications`                      | `{ ok, data: Application[], pagination }`                              |
| PUT    | `/jobs/:jobId/applications/:appId/status`     | `{ ok, data: Application }`                                            |
| GET    | `/applications/:appId`                        | `{ ok, data: Application }`                                            |

### `mobileMarketplace.ts` — mounted at `/api/v1/client/mobile`

| Method | Path                            | Shape                                                                                                        |
|--------|---------------------------------|--------------------------------------------------------------------------------------------------------------|
| GET    | `/marketplace/pricing`          | `{ ok, data: PricingPayload }`                                                                               |
| GET    | `/marketplace/staff`            | `{ ok, data: { staff: Staff[], pagination, clientTier, marketplaceAccessLane, subscriptionTier, ... } }`     |
| GET    | `/marketplace/staff/:id`        | `{ ok, data: { staff: Staff, clientTier, marketplaceAccessLane, ... } }`                                     |
| POST   | `/bookings`                     | `{ ok, data: Booking }`                                                                                      |
| GET    | `/bookings`                     | `{ ok, data: { bookings: Booking[], pagination } }`                                                          |
| GET    | `/bookings/:id`                 | `{ ok, data: Booking }`                                                                                      |
| POST   | `/bookings/:id/cancel`          | `{ ok, data: Booking }`                                                                                      |

### `mobileNotifications.ts` — mounted at `/api/v1/notifications` (unchanged)

| Method | Path        | Shape   |
|--------|-------------|---------|
| POST   | `/register` | `{ ok }` |
