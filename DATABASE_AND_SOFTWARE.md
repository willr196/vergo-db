# Database and Software Used

This project is a Next.js app for Will's Walks. It uses a PostgreSQL database through Prisma, with NextAuth for account sessions and a small set of API routes for bookings, messages, reviews, calendar export, registration, and dog-breed admin tools.

## Database

### PostgreSQL

The app database is PostgreSQL. The connection is configured through the `DATABASE_URL` environment variable.

PostgreSQL stores the live app data:

- user accounts
- login sessions
- email verification tokens
- dog-walking bookings
- customer reviews
- contact messages
- dog-breed dictionary entries

### Prisma

Prisma is the database ORM used by the app.

Relevant files:

- `prisma/schema.prisma` defines the database tables and relationships.
- `prisma/migrations/` contains the database migration history.
- `prisma.config.ts` points Prisma at the schema and migration folder.
- `src/lib/prisma.ts` creates the shared Prisma client used by API routes and server code.

The Prisma client is cached in development so hot reloads do not create too many database connections.

## Database Models

### `User`

Stores registered users, walkers, and admins.

Important fields:

- `email`, `name`, `passwordHash`
- `role`: `USER`, `WALKER`, or `ADMIN`
- `walkerApprovalStatus`: tracks whether walker accounts are pending, approved, or rejected
- walker profile fields such as bio, service area, rate, availability, and experience

Users can have bookings, reviews, messages, sessions, and auth accounts.

### `Account`, `Session`, and `VerificationToken`

These support NextAuth and email verification.

- `Account` stores provider account data.
- `Session` stores session records.
- `VerificationToken` stores temporary email verification tokens.

### `Booking`

Stores booking requests and confirmed meet-and-greet slots.

Important fields:

- owner contact details
- dog details
- date and time slot
- notes
- price
- booking status

There is a unique constraint on `date` and `timeSlot` so the same slot cannot be booked twice.

### `Review`

Stores customer reviews shown by the app.

### `Message`

Stores contact form or booking-related messages.

### `DogBreed`

Stores public dog-breed dictionary content.

Important fields:

- `slug`
- `name`
- `size`
- `category`
- care notes such as temperament, exercise, coat care, ideal home, and note
- optional `imageUrl`
- `isActive`
- `displayOrder`

The public breed pages fall back to local generated placeholder artwork when no stable breed image is available.

## Main Software Stack

### Next.js

Next.js is the web framework. It handles:

- app routes under `src/app`
- server-rendered pages
- API routes under `src/app/api`
- static generation for public pages
- production builds
- security headers from `next.config.ts`

Current package version: `next@15.1.11`.

### React

React powers the UI components.

Current package versions:

- `react@18.2.0`
- `react-dom@18.2.0`

### TypeScript

TypeScript is used for app code, API routes, Prisma types, and safer refactoring.

Main commands:

- `npm run typecheck`
- `npm run build`

### NextAuth

NextAuth handles authentication.

Relevant files:

- `src/auth.ts`
- `src/app/api/auth/[...nextauth]/route.ts`

The app currently uses credentials login with email and password. Passwords are hashed before storage, and login requires verified email. Walker accounts also require approval before sign-in.

### bcryptjs

`bcryptjs` hashes passwords during registration and compares passwords during login.

### Zod

Zod validates API input for routes such as:

- registration
- bookings
- messages
- reviews
- dog-breed admin actions

### Tailwind CSS

Tailwind CSS is used for utility styling.

Relevant files:

- `tailwind.config.js`
- `postcss.config.js`
- `src/app/globals.css`

The project also has custom CSS variables and shared component classes for the Will's Walks visual style.

## App Features Backed By Software

### Booking Flow

Bookings are handled through API routes and Prisma. Booking notification email code currently logs the notification details and is ready to be replaced with a real email provider.

Relevant files:

- `src/app/api/bookings/route.ts`
- `src/lib/notifications.ts`

### Email Verification

Registration creates a verification token in the database. The current email sender logs the verification link and is structured so a provider such as Resend, SendGrid, or Nodemailer can be added later.

Relevant files:

- `src/app/api/register/route.ts`
- `src/app/api/verify-email/route.ts`
- `src/lib/email-verification.ts`

### Calendar Export

The app can generate an `.ics` calendar feed for future confirmed bookings. Access is restricted to authenticated owner/admin usage.

Relevant file:

- `src/app/api/calendar/route.ts`

### Dog Breed Admin

The dog-breed dictionary can be managed through admin API routes. Prisma stores active breeds, ordering, images, categories, and care notes.

Relevant routes:

- `src/app/api/admin/dog-breeds/route.ts`
- `src/app/api/admin/dog-breeds/import/route.ts`
- `src/app/api/admin/dog-breeds/import-defaults/route.ts`
- `src/app/api/admin/dog-breeds/reorder/route.ts`
- `src/app/api/admin/dog-breeds/upload-image/route.ts`

## Environment Variables

The local `.env` file is intentionally ignored by Git and should not be committed.

Environment variables currently used by the project include:

- `DATABASE_URL`: PostgreSQL connection string for Prisma.
- `AUTH_SECRET`: secret used by Auth.js / NextAuth.
- `AUTH_URL` / `NEXTAUTH_URL`: app URL used by authentication and verification links.
- `NEXT_PUBLIC_CALENDLY_URL`: optional public calendar scheduling URL.
- `BOOKING_NOTIFICATION_EMAIL`: optional owner email used for notifications and calendar access.

Some optional variables are referenced in code even if they are not currently present in the local `.env`.

## Development Tools

### npm

npm is used for scripts and dependency management.

Common commands:

```bash
npm run dev
npm run typecheck
npm run lint
npm run build
npm run start
```

### ESLint

ESLint checks code quality and framework-specific Next.js rules.

Command:

```bash
npm run lint
```

### Prisma CLI

The Prisma CLI manages schema changes, migrations, and generated client code.

Typical commands:

```bash
npx prisma generate
npx prisma migrate dev
npx prisma studio
```

### Git and GitHub

Git tracks the codebase, and GitHub is the remote repository.

Remote:

```text
https://github.com/willr196/dogwalking.git
```

### Headless Chrome

Headless Chrome was used for visual QA screenshots during development. It is not required by the production app.

## Notes

- There is no committed Docker, Fly.io, Vercel, or Netlify config in this repository.
- Email sending is prepared in code but currently uses console logging placeholders.
- The database provider is PostgreSQL. The actual hosted database depends on the `DATABASE_URL` value.

## League Table

This project is a local Python tool that turns a published Google Sheet, local CSV file, or Excel workbook into polished social-media league table graphics. It supports both a desktop widget and command-line exports.

## League Table Data Source

### Google Sheets, CSV, and Excel

The league table tool does not use a hosted database server. Its main data source is a Google Sheets CSV export URL, local `.csv` file, or local `.xlsx` / `.xls` workbook.

Input data is loaded and normalised by `data_loader.py`.

Supported source types:

- published Google Sheets CSV links
- Google Sheets share links that can be converted to export URLs
- local CSV files
- local Excel workbooks

The app can detect flexible table headers and map them to the fields needed for standings.

### Local JSON Config

`config.json` stores local app settings and saved user preferences.

Important stored values include:

- title, subtitle, and footer text
- selected theme and custom theme colours
- Google Sheet URL
- avatar and background image paths
- output directory
- maximum rendered rows
- enabled columns
- saved per-AI picks under `ai_picks`

This file acts as lightweight local persistence for the desktop app. It is not a relational database.

## League Table Data Models

### Standings Table

The standings table is loaded into a pandas `DataFrame`.

Important fields:

- `ai`
- `played`
- `wins`
- `losses`
- `pushes`
- `win_pct`
- `profit_loss`
- `roi`
- `streak`
- `trend`

Rows can be sorted by profit/loss, ROI, and wins, unless source order is preserved.

### Predictions Log

The predictions log is also loaded into a pandas `DataFrame` when a workbook contains the required tab.

Important fields:

- `date`
- `round_id`
- `ai`
- `acca_legs`
- `odds`
- `won`
- `profit`

The app groups prediction entries by round so pre-match picks and post-match results can be rendered separately.

## League Table Main Software Stack

### Python

Python is the main application language.

Relevant files:

- `main.py` handles CLI arguments and export flow.
- `gui.py` builds the desktop widget.
- `data_loader.py` loads and normalises table data.
- `renderer.py` renders the final images.
- `config.py` loads defaults, user config, and theme settings.

### pandas

pandas is used for CSV and Excel loading, header detection, type coercion, sorting, and table preparation.

### Pillow

Pillow renders the final PNG graphics.

It handles:

- background images
- table layout
- typography
- avatars
- badges and highlights
- feed and story export sizes

### requests

requests downloads Google Sheets CSV or workbook exports.

### openpyxl

openpyxl lets pandas read local Excel workbooks and Google Sheets workbook exports.

### Tkinter

Tkinter powers the local desktop widget.

The widget provides source selection, preview generation, theme controls, saved picks, filters, and export actions.

## League Table App Features Backed By Software

### Graphic Export

The app exports Instagram-ready PNG graphics.

Supported formats:

- feed: `1080x1350`
- story: `1080x1920`

Relevant files:

- `main.py`
- `renderer.py`

### Desktop Studio

The desktop studio provides a local UI for loading data, previewing graphics, editing visual settings, filtering the standings table, and exporting final images.

Relevant file:

- `gui.py`

### Picks Hub

The Picks Hub stores pasted notes for each AI locally in `config.json`.

Relevant files:

- `gui.py`
- `config.py`

### Avatar and Background Support

The renderer can use local avatar images from `avatars/` and an optional background image path from `config.json`.

Relevant folders and files:

- `avatars/`
- `assets/`
- `renderer.py`

## League Table Environment Variables

The league table tool does not require environment variables for normal local use.

The active Google Sheet URL, output folder, and visual settings are stored in `config.json` instead.

## League Table Development Tools

### pip

pip installs the Python dependencies from `requirements.txt`.

Command:

```bash
pip install -r requirements.txt
```

### Local Launchers

The project includes small launcher scripts for local use.

Relevant files:

- `league-table`
- `league`
- `install_local.sh`
- `uninstall_local.sh`

### Common Commands

Desktop widget:

```bash
python main.py
```

Local CSV export:

```bash
python main.py --csv sample_data.csv
```

Export feed and story together:

```bash
python main.py --csv sample_data.csv --format feed --format story
```

## League Table Notes

- There is no PostgreSQL, Prisma, or hosted database requirement in this project.
- Local app settings and saved picks are stored in `config.json`.
- Generated graphics are written to `outputs/`.
- The app can work with a live Google Sheet as long as the sheet is accessible through a published or shareable export link.

## Prediction Platform

This project is a token-based sports prediction platform. It uses a React frontend, an Express API, PostgreSQL persistence through Prisma, and background services for event importing, odds syncing, settlement, token allowances, leaderboards, leagues, rewards, and admin operations.

## Prediction Platform Database

### PostgreSQL

The app database is PostgreSQL. The connection is configured through the `DATABASE_URL` environment variable.

PostgreSQL stores the live platform data:

- user accounts and profile settings
- login, refresh-token, password-reset, and email-verification state
- token and points ledgers
- sports events and odds
- single predictions and accumulators
- leaderboards, achievements, and private leagues
- reward catalogue entries and redemptions
- admin audit log records

### Prisma

Prisma is the database ORM used by the API.

Relevant files:

- `prisma/schema.prisma` defines the database tables, enums, indexes, and relationships.
- `prisma/migrations/` contains the database migration history.
- `prisma/seed.ts` creates seed users, events, and rewards.
- `prisma/reset-users.ts` resets local user data when needed.
- `src/services/database.ts` creates and manages the shared Prisma client.

The Prisma schema treats token and points ledgers as the source of truth. Cached balances on the user record are used for fast reads but must match the transaction history.

## Prediction Platform Database Models

### `User`

Stores registered users and admins.

Important fields:

- `email`, `displayName`, and `passwordHash`
- `tokenBalance` and `pointsBalance`
- `isAdmin`, `isVerified`, and `showPublicProfile`
- `tokenVersion` for revoking existing auth tokens
- login lockout fields and refresh-token fields

Users can have predictions, accumulators, transactions, redemptions, achievements, owned leagues, league memberships, and league standings.

### `TokenTransaction` and `PointsTransaction`

These are append-only ledger tables.

They store:

- transaction amount
- running balance after the transaction
- transaction type
- optional reference type and reference ID
- audit description
- immutable creation timestamp

Token transactions track staking, allowances, signup bonuses, refunds, winnings, redemptions, purchases, and admin adjustments. Points transactions track prediction wins, cashouts, redemptions, refunds, and admin adjustments.

### `TokenAllowance`

Stores weekly token allowance state for each user.

It tracks the week key, starting weekly allowance, daily top-ups claimed, total claimed tokens, and timestamps.

### `Event`

Stores imported or manually created sports events.

Important fields:

- sport key and sport title
- home and away team
- commence time
- status
- current odds
- API event ID
- lock and settlement timestamps

Events are used by predictions, accumulators, odds syncing, settlement, and admin event tools.

### `Prediction`

Stores single prediction picks.

Important fields:

- selected team
- stake amount
- odds at the time of prediction
- potential return
- status
- outcome and settlement timestamps
- cashout fields

Predictions are tied to users and events.

### `Accumulator` and `AccumulatorLeg`

These store multi-leg prediction slips.

The accumulator record stores the user, stake, combined odds, potential return, status, payout, and settlement state. Each leg links to an event and stores the selected team, odds, status, and outcome.

### `Leaderboard`

Stores materialized ranking data for weekly, monthly, and all-time periods.

Important fields:

- total predictions
- wins and losses
- total points won
- win rate
- longest and current streak

### `League`, `LeagueMembership`, and `LeagueStanding`

These support private and open social leagues.

Leagues have owners, invite codes, membership limits, descriptions, and an active/open state. League standings store weekly and all-time ranking data for members.

### `Reward` and `Redemption`

Rewards define redeemable catalogue items. Redemptions track user reward claims, points spent, fulfilment status, cancellation state, and admin notes.

### `PasswordResetToken` and `EmailVerificationToken`

These store temporary account-security tokens for password resets and email verification.

### `Achievement` and `UserAchievement`

Achievements define progression goals. User achievement rows track unlocked achievements, progress, and unlock timestamps.

### `AdminAuditLog`

Stores admin action history for user operations, event operations, reward operations, and system actions.

## Prediction Platform Main Software Stack

### Node.js

Node.js runs the backend API and background services.

Current engine requirement: `node >=20.0.0`.

### Express

Express is the API framework.

Relevant files:

- `src/app.ts` configures middleware, security headers, CORS, rate limiting, request logging, and API mounting.
- `src/index.ts` starts the server and background workers.
- `src/routes/index.ts` mounts the API route groups under `/api/v1`.

### React

React powers the frontend application.

Relevant files:

- `frontend/src/App.tsx`
- `frontend/src/main.tsx`
- `frontend/src/pages/`
- `frontend/src/components/`
- `frontend/src/context/`

Current frontend package versions:

- `react@18.3.1`
- `react-dom@18.3.1`
- `react-router-dom@6.28.0`

### Vite

Vite builds and serves the frontend during local development.

Relevant files:

- `frontend/vite.config.ts`
- `frontend/index.html`
- `frontend/vercel.json`

### TypeScript

TypeScript is used across the backend, frontend, Prisma-facing code, route handlers, services, tests, and shared types.

Main commands:

- `npm run typecheck`
- `npm run build`
- `cd frontend && npm run build`

### Prisma

Prisma manages database access, generated types, migrations, and seed data.

Main commands:

```bash
npm run db:generate
npm run db:migrate
npm run db:migrate:prod
npm run db:seed
npm run db:studio
```

### Zod

Zod validates environment variables, API inputs, request bodies, and selected frontend data contracts.

### bcryptjs

`bcryptjs` hashes user passwords and compares login credentials.

### jsonwebtoken

`jsonwebtoken` creates and verifies access tokens for authenticated API requests.

### cookie-parser

`cookie-parser` supports refresh-token sessions through HTTP-only cookies.

### helmet, cors, and express-rate-limit

These packages provide API security headers, cross-origin request handling, and request-rate limiting.

### pino

Pino is used for structured backend logging.

Relevant file:

- `src/logger.ts`

### Nodemailer

Nodemailer sends password-reset and email-verification emails when SMTP is configured. If SMTP is not configured, the app can log the links during development.

Relevant file:

- `src/services/email.ts`

### The Odds API

The Odds API provides event and odds data for configured sports.

Relevant files:

- `src/services/oddsApi.ts`
- `src/services/oddsSync.ts`
- `src/services/eventImport.ts`
- `src/config/sports.ts`

### Tailwind CSS

Tailwind CSS is used for frontend styling.

Relevant files:

- `frontend/tailwind.config.js`
- `frontend/postcss.config.js`
- `frontend/src/index.css`

## Prediction Platform App Features Backed By Software

### Authentication and Account Management

The API supports registration, login, refresh-token sessions, logout, logout-all, password reset, email verification, profile updates, password changes, and login lockout.

Relevant files:

- `src/routes/auth.ts`
- `src/services/auth.ts`
- `src/middleware/auth.ts`
- `frontend/src/context/AuthContext.tsx`
- `frontend/src/pages/LoginPage.tsx`
- `frontend/src/pages/RegisterPage.tsx`
- `frontend/src/pages/ForgotPasswordPage.tsx`
- `frontend/src/pages/ResetPasswordPage.tsx`
- `frontend/src/pages/VerifyEmailPage.tsx`

### Event and Odds Management

Events can be imported from The Odds API or managed through admin routes. The system can sync odds, lock started events, cancel stale events, and delete old finished events.

Relevant files:

- `src/routes/events.ts`
- `src/routes/admin.ts`
- `src/services/events.ts`
- `src/services/eventImport.ts`
- `src/services/oddsApi.ts`
- `src/services/oddsSync.ts`
- `scripts/importEvents.ts`

### Prediction Flow

Users can place single predictions against open events. The platform records stake, odds, potential return, status, settlement state, and cashout state.

Relevant files:

- `src/routes/predictions.ts`
- `src/services/predictions.ts`
- `src/services/outcomes.ts`
- `frontend/src/pages/EventsPage.tsx`
- `frontend/src/pages/EventDetailPage.tsx`
- `frontend/src/pages/PredictionsPage.tsx`

### Accumulators

Users can place multi-leg accumulator slips. Each accumulator stores the combined odds and individual event legs.

Relevant files:

- `src/routes/accumulators.ts`
- `src/services/accumulators.ts`
- `frontend/src/components/BetSlip.tsx`
- `frontend/src/context/BetSlipContext.tsx`

### Token and Points Economy

The platform uses token balances for staking and points balances for rewards. Ledger services handle credits, debits, allowance grants, balance verification, and admin adjustments.

Relevant files:

- `src/routes/tokens.ts`
- `src/routes/points.ts`
- `src/services/ledger.ts`
- `src/services/ledgerCore.ts`
- `src/services/pointsLedger.ts`
- `src/services/tokenAllowance.ts`
- `frontend/src/pages/WalletPage.tsx`
- `frontend/src/pages/TransactionsPage.tsx`
- `frontend/src/pages/TransactionHistoryPage.tsx`

### Settlement and Payouts

The settlement worker checks event results, updates prediction and accumulator outcomes, refunds cancelled events, pays winnings, and updates leaderboard and league data.

Relevant files:

- `src/services/settlementWorker.ts`
- `src/services/predictions.ts`
- `src/services/accumulators.ts`
- `src/services/leaderboard.ts`
- `src/services/leagueStandings.ts`

### Leaderboards and Achievements

The app maintains weekly, monthly, and all-time leaderboards. Achievement services track progress and unlocked items.

Relevant files:

- `src/routes/leaderboard.ts`
- `src/routes/achievements.ts`
- `src/services/leaderboard.ts`
- `src/services/achievements.ts`
- `frontend/src/pages/LeaderboardPage.tsx`
- `frontend/src/components/LeaderboardPreview.tsx`

### Leagues

Users can create, join, leave, and manage private or open leagues. League standings are recalculated from member prediction results.

Relevant files:

- `src/routes/leagues.ts`
- `src/services/leagues.ts`
- `src/services/leagueStandings.ts`
- `frontend/src/pages/LeaguesPage.tsx`
- `frontend/src/pages/LeagueDetailPage.tsx`
- `frontend/src/pages/LeagueJoinPage.tsx`
- `frontend/src/pages/LeagueSettingsPage.tsx`

### Rewards

The reward system provides a redeemable catalogue, redemption history, and admin fulfilment tools.

Relevant files:

- `src/routes/rewards.ts`
- `src/services/rewards.ts`
- `frontend/src/pages/RewardsPage.tsx`
- `frontend/src/pages/admin/AdminRewardsPage.tsx`

### Admin Operations

Admin routes support user management, event management, reward management, system checks, audit logs, and manual operational actions.

Relevant files:

- `src/routes/admin.ts`
- `src/services/auditLog.ts`
- `frontend/src/components/AdminLayout.tsx`
- `frontend/src/pages/admin/AdminDashboardPage.tsx`
- `frontend/src/pages/admin/AdminUsersPage.tsx`
- `frontend/src/pages/admin/AdminEventsPage.tsx`
- `frontend/src/pages/admin/AdminRewardsPage.tsx`
- `frontend/src/pages/admin/AdminSystemPage.tsx`

### Health Checks

Health routes provide API liveness and readiness checks.

Relevant file:

- `src/routes/health.ts`

## Prediction Platform Environment Variables

The local `.env` file is intentionally ignored by Git and should not be committed.

Environment variables currently used by the project include:

- `DATABASE_URL`: PostgreSQL connection string for Prisma.
- `JWT_SECRET`: signing secret for API authentication tokens.
- `JWT_EXPIRES_IN`: access-token lifetime.
- `REFRESH_TOKEN_EXPIRES_DAYS`: refresh-token lifetime.
- `BCRYPT_SALT_ROUNDS`: password hashing cost.
- `PORT`: API server port.
- `NODE_ENV`: runtime environment.
- `FRONTEND_URL`: deployed frontend origin for production CORS.
- `TRUST_PROXY`: Express proxy trust setting for hosted deployments.
- `SIGNUP_BONUS_TOKENS`, `WEEKLY_START_TOKENS`, `DAILY_ALLOWANCE_TOKENS`, `MAX_ALLOWANCE_TOKENS`, `MIN_STAKE_AMOUNT`, and `MAX_STAKE_AMOUNT`: token economy settings.
- `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MINUTES`: general API rate-limit settings.
- `LOGIN_LOCKOUT_MAX_ATTEMPTS` and `LOGIN_LOCKOUT_WINDOW_MINUTES`: auth lockout settings.
- `THE_ODDS_API_KEY`, `THE_ODDS_API_REGIONS`, `THE_ODDS_API_MARKETS`, and `THE_ODDS_API_BASE_URL`: The Odds API configuration.
- `ODDS_SYNC_INTERVAL_SECONDS`, `SETTLEMENT_INTERVAL_SECONDS`, `ODDS_SYNC_LOOKAHEAD_HOURS`, `ODDS_CACHE_TTL_SECONDS`, `ODDS_SCORES_CACHE_TTL_SECONDS`, `ODDS_STALENESS_THRESHOLD_MINUTES`, `ODDS_API_MONTHLY_QUOTA`, `EVENT_IMPORT_INTERVAL_SECONDS`, and `AUTO_IMPORT_SPORTS`: odds, import, settlement, and quota settings.
- `CASHOUT_STALENESS_THRESHOLD_MS` and `CASHOUT_ODDS_DRIFT_THRESHOLD_PERCENT`: cashout policy settings.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM`: optional SMTP email settings.
- `PASSWORD_RESET_EXPIRES_MINUTES` and `EMAIL_VERIFICATION_EXPIRES_MINUTES`: account-token expiry settings.
- `SEED_ADMIN_EMAIL`, `SEED_USER_EMAIL`, and `SEED_PASSWORD`: optional seed script values.
- `VITE_API_URL`: frontend API base URL.

The canonical reference is `.env.example`.

## Prediction Platform Development Tools

### npm

npm is used for backend and frontend scripts.

Backend commands:

```bash
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm run start
```

Frontend commands:

```bash
cd frontend
npm run dev
npm test
npm run build
```

### Vitest

Vitest runs backend and frontend tests.

Relevant test folders and files:

- `src/__tests__/`
- `src/config/envUtils.test.ts`
- `frontend/src/**/*.test.tsx`
- `frontend/src/**/*.test.ts`

### ESLint

ESLint checks backend TypeScript code.

Command:

```bash
npm run lint
```

### Docker Compose

Docker Compose can run the local PostgreSQL database, API, and frontend services.

Relevant file:

- `docker-compose.yml`

Common command:

```bash
docker compose up -d
```

### Render

Render deployment configuration is included for hosted API, frontend, and database setup.

Relevant files:

- `render.yaml`
- `RENDER_MANUAL_SETUP.md`

### Utility Scripts

Relevant files:

- `scripts/importEvents.ts`
- `scripts/upsert-admin.ts`
- `scripts/backup-db.sh`

## Prediction Platform Notes

- The database provider is PostgreSQL.
- Prisma migrations are committed under `prisma/migrations/`.
- Token and points movement should go through ledger services so balances stay auditable.
- The Odds API quota affects event import, odds sync, and background polling.
- SMTP is optional for local development; email links can be logged when SMTP is not configured.
- `Promotions` and `Minigames` are scaffolded frontend routes and are not complete product features yet.

## GHUB

This project is a Next.js personal fitness and wellness hub. It uses Supabase for PostgreSQL persistence and authentication, with client-side pages for workouts, measurements, daily wellness logs, goals, sobriety tracking, recipes, blog posts, gallery entries, travel entries, and a workout library.

## GHUB Database

### Supabase PostgreSQL

The app database is Supabase PostgreSQL. Client access is configured through `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Server-side registration uses `SUPABASE_SERVICE_ROLE_KEY` for invite-only account creation.

Supabase stores the live app data:

- user profile records linked to Supabase Auth users
- workout logs and saved workout templates
- body measurements
- daily water, sleep, mood, and energy logs
- fitness goals
- sobriety milestones
- recipes, blog posts, gallery entries, and travel entries
- public exercise library data

### Supabase Auth

Supabase Auth handles email/password sessions. The app wraps auth state in `components/AuthProvider.js`, protects private pages with `components/RequireAuth.js`, and creates accounts through the invite-code registration API route.

Relevant files:

- `lib/supabase.js` creates the browser Supabase client.
- `components/AuthProvider.js` manages session state and sign-in/sign-out helpers.
- `components/RequireAuth.js` gates protected pages.
- `app/api/register/route.js` creates invite-only users with the service-role key.
- `supabase/schema.sql` defines tables, triggers, RLS policies, and indexes.
- `supabase/migrations/` contains follow-up SQL migrations.

The schema enables row-level security so private records are restricted to the authenticated owner, while public recipes, blog posts, gallery entries, travel entries, and exercises can be read publicly where policies allow it.

## GHUB Database Models

### `profiles`

Extends Supabase Auth users with app-specific profile data.

Important fields:

- `id`, linked to `auth.users`
- `email`, `display_name`, and `avatar_url`
- onboarding fields: `onboarding_completed` and `onboarding_hide_until`
- `created_at` and `updated_at`

A trigger creates or updates profile rows when auth users are inserted.

### `workouts`

Stores logged workouts.

Important fields:

- `name` and `type`
- `duration` and `calories`
- `notes`
- `exercises` JSON data
- workout `date`

### `workout_library`

Stores reusable workout templates for each user.

Important fields:

- `name` and `description`
- `goal`, `muscle_group`, and `cardio_mode`
- `exercises` JSON data
- `estimated_duration`

### `exercises`

Stores the global public exercise catalogue.

Important fields:

- `name` and `slug`
- `category` and `subcategory`
- `description`, `equipment`, and `difficulty`
- `instructions` JSON data
- optional `video_url`

The exercise table has public read access and indexes for category filtering and trigram name search.

### `measurements`

Stores body measurement history.

Important fields:

- `weight`
- `chest`, `waist`, `hips`, `arms`, and `thighs`
- measurement `date`

### `daily_logs`

Stores daily wellness check-ins.

Important fields:

- `water_intake`
- `sleep_hours` and `sleep_quality`
- `mood`, `energy`, and `notes`
- unique `user_id` and `date` pair

### `goals`

Stores user fitness goals.

Important fields:

- `name`
- `target`, `current`, and `unit`
- `category`
- `completed`
- optional `target_date`

### `sobriety`

Stores sobriety tracking records.

Important fields:

- sobriety `type`
- `start_date`
- `is_active`
- optional `notes`

### `recipes`, `blog_posts`, `gallery`, and `travel`

These tables store user-created content that can be public or private.

Important shared fields:

- `user_id`
- content-specific title, description, body, URL, or metadata fields
- `is_public`
- created/published/date fields

RLS policies allow public reads for rows marked public and owner-only writes for authenticated users.

## GHUB Main Software Stack

### Next.js

Next.js is the web framework. It handles:

- app routes under `app/`
- the registration API route under `app/api/register/route.js`
- metadata, sitemap, and robots output
- production builds and local development

Current package version: `next@14.0.4`.

### React

React powers the page components, auth context, protected-route wrapper, dashboard cards, forms, and interactive client-side flows.

Current package versions:

- `react@18.2.0`
- `react-dom@18.2.0`

### JavaScript

The project uses JavaScript files for Next.js pages, components, libraries, and scripts.

### Supabase JavaScript Client

`@supabase/supabase-js` is used for authentication, browser-side database reads/writes, and server-side admin user creation in the registration route.

Current package version: `@supabase/supabase-js@2.39.0`.

### Tailwind CSS

Tailwind CSS is used for utility styling.

Relevant files:

- `tailwind.config.js`
- `postcss.config.js`
- `app/globals.css`

The Tailwind config defines GHUB-specific colours, font families, and a primary gradient.

### Recharts

Recharts is available for dashboard and progress visualisation.

## GHUB App Features Backed By Software

### Invite-Only Registration and Login

Registration requires a secret code and uses the Supabase service-role key to create confirmed users. The route validates email/password/code input, rate-limits failed attempts in memory, compares the secret code with `timingSafeEqual`, and upserts the profile row after user creation.

Relevant files:

- `app/api/register/route.js`
- `app/register/page.js`
- `app/login/page.js`
- `components/AuthProvider.js`

### Dashboard and Onboarding

The dashboard aggregates workouts, calories, duration, daily logs, goals, sobriety, and profile onboarding state.

Relevant file:

- `app/dashboard/page.js`

### Workout Tracking and Workout Library

Users can log workouts, save reusable workout templates, start workouts from the library, and use the public exercise catalogue.

Relevant files:

- `app/workouts/page.js`
- `app/library/page.js`
- `app/library/[slug]/page.js`
- `lib/exerciseCatalog.js`
- `lib/workoutRecommendations.js`
- `scripts/seed-exercises.js`

### Wellness Tracking

The app tracks body measurements, daily wellness logs, goals, and sobriety records through Supabase tables scoped to the logged-in user.

Relevant files:

- `app/measurements/page.js`
- `app/daily/page.js`
- `app/goals/page.js`
- `app/sobriety/page.js`

### Public and Private Content

Recipes, blog posts, gallery entries, and travel entries support public/private visibility through the `is_public` database field and RLS policies.

Relevant files:

- `app/recipes/page.js`
- `app/blog/page.js`
- `app/gallery/page.js`
- `app/travel/page.js`

### Profile Management

Users can edit display name and avatar URL stored on the `profiles` table.

Relevant file:

- `app/profile/page.js`

## GHUB Environment Variables

The local `.env.local` file is intentionally ignored by Git and should not be committed.

Environment variables currently used by the project include:

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL used by browser and server code.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: public Supabase anon key for browser access under RLS.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only key used by invite-only registration.
- `SECRET_CODE`: invite code required during registration.
- `ADMIN_EMAIL`: optional extra admin email setting documented in `.env.example`.
- `NEXT_PUBLIC_SITE_URL`: deployment URL used by metadata and sitemap code.

The canonical local reference is `.env.example`.

## GHUB Development Tools

### npm

npm is used for scripts and dependency management.

Common commands:

```bash
npm install
npm run dev
npm run lint
npm run build
npm run start
```

### ESLint

ESLint runs Next.js lint checks.

Command:

```bash
npm run lint
```

### Supabase SQL Editor

Schema changes are applied through the Supabase SQL Editor or by running SQL from the committed schema and migration files.

Relevant files:

- `supabase/schema.sql`
- `supabase/migrations/20240217000000_add_exercises.sql`
- `supabase/migrations/20260220000000_add_query_indexes.sql`

### Vercel

The README documents Vercel as the expected hosting path. Vercel environment variables must match the Supabase project and invite-code settings before deployment.

## GHUB Notes

- The database provider is Supabase PostgreSQL.
- Supabase Auth is the account system; `profiles` stores app-specific user metadata.
- RLS policies are part of the security model and should be updated alongside table changes.
- The public exercise catalogue is stored in `exercises` and can be seeded from `scripts/seed-exercises.js`.
- Gallery database support exists, but upload/storage implementation may require additional Supabase Storage setup.

## Vergo

Vergo is an event staffing platform with an Express API, static public web pages, and an Expo React Native mobile app. It uses PostgreSQL through Prisma for staff, clients, jobs, bookings, applications, email tracking, sessions, and marketplace data.

## Vergo Database

### PostgreSQL

The app database is PostgreSQL. The API reads the connection string from `DATABASE_URL`, and Prisma can use `DIRECT_DATABASE_URL` for direct migration access.

PostgreSQL stores the live platform data:

- applicants and job-seeker accounts
- client company accounts
- admin accounts and web sessions
- jobs, roles, saved jobs, and job applications
- quote requests and staff bookings
- pricing tiers, subscription plans, and marketplace tiers
- refresh tokens and push tokens
- email records, email events, preferences, and scheduled emails
- contact form submissions and CV upload verification records

### Prisma

Prisma is the ORM used by the API.

Relevant files:

- `apps/api/prisma/schema.prisma` defines the database tables, enums, indexes, and relationships.
- `apps/api/prisma/migrations/` contains the database migration history.
- `apps/api/src/prisma.ts` creates the shared Prisma client.
- `apps/api/scripts/prisma-deploy-with-retry.js` runs production-safe migration deploys with retry and lock handling.
- `apps/api/prisma/seed.ts`, `apps/api/prisma/seed-jobs.ts`, and `apps/api/prisma/seed-marketplace.ts` seed admin, job, and marketplace data.

## Vergo Database Models

### `Applicant`

Stores staff applicant profiles and CV/application intake details.

Important fields:

- contact details such as first name, last name, email, and phone
- right-to-work, experience, hourly rate, postcode, bio, and profile visibility
- `staffTier`, `averageRating`, `totalBookings`, and promotion metadata

Applicants can have application records and may be linked to a `User` account.

### `User`

Stores job-seeker and staff user accounts.

Important fields:

- email, password hash, email verification, reset token, failed login tracking, and lockout data
- profile fields such as first name, last name, phone, company details, and billing address
- staff marketplace fields such as tier, bio, avatar, availability, rating, review count, and highlights
- `mustChangePassword`, `seqId`, and optional `applicantId`

Users can have job applications, saved jobs, bookings, push tokens, and refresh tokens.

### `Client`

Stores client company accounts.

Important fields:

- company and contact details
- email verification, password reset, failed login tracking, and lockout data
- approval status, admin notes, subscription tier, and subscription status
- logo, postcode, bookings, jobs, quote requests, push tokens, and refresh tokens

### `AdminUser` and `user_sessions`

`AdminUser` stores admin credentials and lockout state. `user_sessions` stores Express session data through the PostgreSQL session store.

### `Role`, `Application`, and `ApplicationRole`

These support the applicant intake flow.

- `Role` stores staffing roles.
- `Application` stores CV uploads, source, status, notes, and file metadata.
- `ApplicationRole` links applications to one or more roles with optional experience level.

### `Job`, `JobApplication`, and `SavedJob`

These power the job board and mobile application flow.

- `Job` stores internal and external roles, location, event date, pay, status, tier, staff requirements, and client ownership.
- `JobApplication` links a user to a job with application status, cover note, admin notes, and optional rate uplift.
- `SavedJob` stores a user's saved jobs.

### `QuoteRequest` and `Booking`

These support client quotes and staff booking workflows.

- `QuoteRequest` stores event requirements, dates, location, roles, budget, requested lane, quote status, and quoted amount.
- `Booking` stores assigned staff, event details, client/staff tier at booking time, charged/pay rates, status, lane, and lifecycle timestamps.

### `PricingTier` and `SubscriptionPlan`

These define client subscription plans and staff pricing rules for marketplace bookings.

### `Contact`

Stores public contact and staff request submissions, including event details, message content, status, and admin notes.

### `RefreshToken` and `PushToken`

These support JWT mobile authentication and Expo push notification registration for users and clients.

### `Email`, `EmailEvent`, `EmailPreferences`, and `ScheduledEmail`

These support Resend-backed email delivery, webhook event tracking, unsubscribe preferences, and scheduled email campaigns.

### `FileUploadVerification`

Stores temporary verification records for uploaded CV files.

## Vergo Main Software Stack

### Node.js and Express

The API is a Node.js Express server in `apps/api`.

It handles:

- public web pages from `apps/api/public`
- session-based web authentication
- JWT-based mobile authentication
- admin, client, job-seeker, job board, marketplace, quote, booking, and notification routes
- health and readiness checks
- security headers, CORS, compression, rate limiting, logging, and HTTPS redirect behavior

Relevant files:

- `apps/api/src/index.ts`
- `apps/api/src/env.ts`
- `apps/api/src/routes/`
- `apps/api/public/`

### TypeScript

TypeScript is used for the API and the mobile app.

Main commands:

- `cd apps/api && npm run build`
- `cd apps/mobile && npm run typecheck`

### Prisma

Prisma manages PostgreSQL access, generated types, migrations, and seed scripts for the API.

Main commands:

```bash
cd apps/api
npm run prisma -- migrate dev
npm run prisma:deploy
npm run seed
npm run seed:jobs
npm run seed:marketplace
```

### React Native and Expo

The mobile app is an Expo React Native app in `apps/mobile`.

It supports:

- job-seeker login, registration, profile editing, job browsing, applying, and application tracking
- client login, registration, profile editing, job posting, job management, applicant review, and booking workflows
- push notification registration and deep-link routing
- offline-aware stores and queued actions

Current package versions:

- `expo@~54.0.30`
- `react-native@0.81.5`
- `react@19.1.0`

### React Navigation

React Navigation powers the mobile navigation stack and tabs.

Relevant files:

- `apps/mobile/src/navigation/RootNavigator.tsx`
- `apps/mobile/src/navigation/navigationRef.ts`

### Zustand

Zustand stores mobile auth, jobs, applications, client jobs, client applications, network, UI, and notification state.

Relevant files:

- `apps/mobile/src/store/`

### Axios

Axios is used by the mobile API client for JWT bearer-token requests.

Relevant files:

- `apps/mobile/src/api/client.ts`
- `apps/mobile/src/api/`

### bcrypt

`bcrypt` hashes and verifies passwords for admin, job-seeker, and client authentication flows.

### jsonwebtoken

`jsonwebtoken` signs and verifies mobile access and refresh tokens. Access tokens are short-lived, while refresh tokens are stored, hashed, rotated, and revocable in the database.

### express-session and connect-pg-simple

Web/admin flows use cookie sessions stored in PostgreSQL through `connect-pg-simple`.

### helmet, cors, express-rate-limit, and compression

These provide HTTP security headers, origin control, request rate limiting, and gzip compression.

Redis can back rate limiting when `REDIS_URL` is configured.

### ioredis and BullMQ

Redis and BullMQ are used for optional email queueing when `EMAIL_QUEUE_ENABLED` is true.

### Resend

Resend is used for transactional email delivery, notification emails, webhooks, and email event tracking.

Relevant files:

- `apps/api/src/services/email/`
- `apps/api/src/routes/webhooks.ts`
- `apps/api/src/routes/unsubscribe.ts`

### AWS S3

S3 is used for CV and media upload storage when configured. Local CV upload storage is allowed outside production or when explicitly enabled.

Relevant files:

- `apps/api/src/services/s3.ts`
- `apps/api/src/routes/applications.ts`
- `apps/api/src/utils/mobileMediaUpload.ts`

### Sentry and pino

Sentry provides optional error tracking. `pino` provides structured logging.

Relevant files:

- `apps/api/src/services/sentry.ts`
- `apps/api/src/services/logger.ts`

## Vergo App Features Backed By Software

### Public Website

Static public pages are served by the Express API from `apps/api/public`. These pages cover the Vergo marketing site, hiring pages, job pages, pricing, contact, applications, and dashboards.

### Web Authentication

The API supports session-based web authentication for admin, job seeker, and client routes.

Relevant routes:

- `apps/api/src/routes/auth.ts`
- `apps/api/src/routes/userAuth.ts`
- `apps/api/src/routes/clientAuth.ts`
- `apps/api/src/routes/webAuth.ts`

### Mobile Authentication

The mobile app uses JWT access tokens and refresh tokens. Refresh tokens are stored in the database, rotated, and revoked when needed.

Relevant routes:

- `apps/api/src/routes/userAuth.ts`
- `apps/api/src/routes/clientAuth.ts`

Relevant mobile files:

- `apps/mobile/src/api/auth.ts`
- `apps/mobile/src/store/authStore.ts`

### Jobs and Applications

Vergo supports job publishing, browsing, job applications, saved jobs, status tracking, shortlist flows, and client applicant review.

Relevant routes:

- `apps/api/src/routes/jobs.ts`
- `apps/api/src/routes/mobileJobs.ts`
- `apps/api/src/routes/jobApplications.ts`
- `apps/api/src/routes/mobileJobApplications.ts`

Relevant mobile files:

- `apps/mobile/src/screens/jobseeker/JobsScreen.tsx`
- `apps/mobile/src/screens/jobseeker/JobDetailScreen.tsx`
- `apps/mobile/src/screens/jobseeker/ApplicationsScreen.tsx`
- `apps/mobile/src/screens/client/MyJobsScreen.tsx`
- `apps/mobile/src/screens/client/ApplicantListScreen.tsx`

### Client Workflows

Clients can register, manage company profiles, create and edit jobs, review applicants, manage quotes, and view bookings.

Relevant routes:

- `apps/api/src/routes/mobileClient.ts`
- `apps/api/src/routes/quotes.ts`
- `apps/api/src/routes/bookings.ts`
- `apps/api/src/routes/adminClients.ts`
- `apps/api/src/routes/adminBookings.ts`
- `apps/api/src/routes/adminQuotes.ts`

### Marketplace

Marketplace routes expose staff browsing, staff tiers, subscription plans, pricing tiers, and admin marketplace controls.

Relevant routes:

- `apps/api/src/routes/marketplace.ts`
- `apps/api/src/routes/mobileMarketplace.ts`
- `apps/api/src/routes/staffBrowse.ts`
- `apps/api/src/routes/adminMarketplace.ts`

### Email and Notifications

The API sends transactional emails through Resend, can queue email work through Redis/BullMQ, stores email delivery records, accepts Resend webhooks, and manages email preferences and unsubscribe links.

Relevant files:

- `apps/api/src/services/email/`
- `apps/api/src/routes/mobileNotifications.ts`
- `apps/api/src/routes/adminNotifications.ts`
- `apps/api/src/routes/adminScheduledEmails.ts`
- `apps/api/src/routes/webhooks.ts`
- `apps/api/src/routes/unsubscribe.ts`

### Uploads

CV and profile/media uploads use S3 when configured, with local CV storage available for development and controlled fallback environments.

Relevant files:

- `apps/api/src/routes/applications.ts`
- `apps/api/src/utils/mobileMediaUpload.ts`
- `apps/mobile/src/utils/profileUtils.ts`

### Admin Operations

Admin routes manage analytics, stats, clients, staff, bookings, quotes, marketplace settings, applications, contacts, and scheduled notifications.

Relevant routes:

- `apps/api/src/routes/adminAnalytics.ts`
- `apps/api/src/routes/adminStats.ts`
- `apps/api/src/routes/adminClients.ts`
- `apps/api/src/routes/adminStaff.ts`
- `apps/api/src/routes/adminBookings.ts`
- `apps/api/src/routes/adminQuotes.ts`
- `apps/api/src/routes/adminMarketplace.ts`
- `apps/api/src/routes/applications.ts`
- `apps/api/src/routes/contacts.ts`

### Health and Readiness

The API includes readiness checks for PostgreSQL, email queue availability, S3 configuration, and Resend configuration.

Relevant file:

- `apps/api/src/index.ts`

## Vergo Environment Variables

The local `.env` files are intentionally ignored by Git and should not be committed.

API environment variables currently used by the project include:

- `DATABASE_URL`: PostgreSQL connection string for Prisma and API runtime.
- `DIRECT_DATABASE_URL`: optional direct PostgreSQL connection string for Prisma migrations.
- `JWT_SECRET`: required access-token signing secret.
- `JWT_REFRESH_SECRET`: refresh-token signing secret; required and distinct in production.
- `SESSION_SECRET`: web session signing secret; required in production.
- `PORT`: API listen port.
- `WEB_ORIGIN`: canonical web origin used for CORS, redirects, and links.
- `S3_REGION`, `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`: S3 upload storage settings.
- `ALLOW_LOCAL_CV_UPLOADS`: enables local upload storage where allowed.
- `LOCAL_CV_UPLOAD_ROOT`: local CV upload directory.
- `RESEND_API_KEY`: Resend API key for transactional email.
- `RESEND_FROM_EMAIL`: sender address for email.
- `RESEND_TO_EMAIL`: notification inbox fallback/target.
- `RESEND_WEBHOOK_SECRET`: webhook verification secret.
- `REDIS_URL`: Redis connection string for rate limiting and optional queues.
- `EMAIL_QUEUE_ENABLED`: enables BullMQ-backed email queueing.
- `SENTRY_DSN`: optional Sentry error tracking DSN.
- `LOG_LEVEL`: pino log level.
- `MEMORY_LOG_ENABLED`, `MEMORY_LOG_INTERVAL_MS`, `MEMORY_WARN_RSS_MB`: memory monitoring controls.
- `ADMIN_USERNAME`, `ADMIN_PASSWORD`: seed credentials for admin setup.

Mobile environment variables include:

- `EXPO_PUBLIC_API_URL`: public API base URL used by the mobile app.
- `EXPO_PUBLIC_FIREBASE_API_KEY`: optional Firebase push configuration.
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID`: optional Firebase push configuration.

## Vergo Development Tools

### npm

npm is used for scripts and dependency management in both `apps/api` and `apps/mobile`.

Common API commands:

```bash
cd apps/api
npm install
npm run dev
npm run build
npm test
npm run start
```

Common mobile commands:

```bash
cd apps/mobile
npm install
npm run start
npm run android
npm run ios
npm run web
```

### TypeScript

The API build uses `tsc`. The mobile app uses `tsc --noEmit` for type checks.

Commands:

```bash
cd apps/api && npm run build
cd apps/mobile && npm run typecheck
```

### Jest and node:test

The mobile app uses Jest. The API compiles TypeScript and then runs Node's built-in test runner against compiled tests.

Commands:

```bash
cd apps/mobile && npm test
cd apps/api && npm test
```

### ESLint

The mobile app includes an Expo ESLint setup.

Command:

```bash
cd apps/mobile && npm run lint
```

### Prisma CLI

Prisma commands are exposed through the API package.

Common commands:

```bash
cd apps/api
npm run prisma -- migrate dev
npm run prisma:deploy
npm run seed
npm run db:reset
```

### Expo and EAS

Expo runs the mobile app locally. EAS build profiles are configured for development, preview, and production builds.

Relevant files:

- `apps/mobile/app.json`
- `apps/mobile/eas.json`

### Docker and Fly.io

The API includes Docker configuration and Fly deployment support.

Relevant files:

- `apps/api/Dockerfile`
- `fly.toml`

## Vergo Notes

- The database provider is PostgreSQL.
- Prisma is the source of truth for database schema and migrations.
- The API supports both legacy session-based web routes and JWT mobile routes.
- Mobile API responses use `{ ok, ... }` payloads for the mobile client contract.
- Resend, Redis, S3, and Sentry are optional integrations that degrade or disable related features when not configured, except where production safety checks require configuration.
- Production should use strong, distinct JWT and session secrets, HTTPS `WEB_ORIGIN`, durable upload storage, and migrated PostgreSQL schema.
