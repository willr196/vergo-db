# Email Service Upgrade Guide

## What Changed

The email system was refactored from a single 810-line file into a modular, production-ready system with 6 new capabilities.

### Before
- One file (`src/services/email.ts`) with all HTML inline
- No retry logic - if an email failed, it was gone
- No tracking - no idea if emails were delivered or opened
- No unsubscribe - no way for users to manage email preferences
- `console.log` everywhere

### After
- **Composable templates** - reusable components (header, footer, buttons, info boxes) so every email looks consistent and changes are made in one place
- **Background queue** - emails are processed in the background with automatic retries (3 attempts with exponential backoff)
- **Delivery tracking** - every email is tracked: sent, delivered, opened, clicked, bounced
- **Unsubscribe management** - users can manage preferences or one-click unsubscribe, with categories (transactional emails always go through)
- **Scheduled emails** - quote follow-ups (3 days), review reminders (48h), shift reminders (24h before)
- **Structured logging** - Pino logger with sensitive data redaction, Sentry error tracking

---

## What You Need To Set Up

### 1. Redis (for email queue) - OPTIONAL

The email queue uses Redis via BullMQ. **Without Redis, emails still send normally** - they just send synchronously instead of being queued with retries.

**If you want the queue (recommended for production):**

- **Fly.io (your current host):** Run `fly redis create` in your project, then add the connection string to your app secrets
- **Or use Upstash Redis:** Free tier at https://upstash.com - sign up, create a Redis database, copy the connection string
- **Or run locally:** Install Redis (`sudo apt install redis-server` on Ubuntu, `brew install redis` on Mac)

**Environment variables to add:**
```
REDIS_URL=redis://your-redis-url:6379
EMAIL_QUEUE_ENABLED=true
```

If you skip this, everything still works. You just don't get background processing or retries.

---

### 2. Resend Webhook (for delivery tracking) - OPTIONAL

This lets you see if emails were delivered, opened, clicked, or bounced.

**Setup steps:**
1. Go to https://resend.com/webhooks (you already have a Resend account)
2. Click "Add Webhook"
3. Set the URL to: `https://vergo-app.fly.dev/api/v1/webhooks/resend`
4. Select events: `email.sent`, `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`
5. Copy the signing secret

**Environment variable to add:**
```
RESEND_WEBHOOK_SECRET=whsec_your_signing_secret
```

If you skip this, emails still send fine. You just won't have delivery/open tracking in your database.

---

### 3. Sentry (for error tracking) - OPTIONAL

Sentry captures errors and sends you alerts when things break. Free tier available.

**Setup steps:**
1. Go to https://sentry.io and sign up (free tier: 5,000 errors/month)
2. Create a new project, select "Node.js / Express"
3. Copy the DSN

**Environment variables to add:**
```
SENTRY_DSN=https://your-key@your-org.ingest.sentry.io/your-project-id
LOG_LEVEL=info
```

`LOG_LEVEL` options: `debug`, `info`, `warn`, `error`. Default is `info`.

If you skip this, errors are still logged to the console. You just won't get alerts or a dashboard.

---

### 4. Database Migration - REQUIRED

The Prisma schema has new tables for email tracking, preferences, and scheduled emails. You need to run a migration.

```bash
cd apps/api
npx prisma migrate dev --name email-system-upgrade
```

For production (Fly.io):
```bash
npx prisma migrate deploy
```

**New tables created:**
- `Email` - tracks every sent email and its delivery status
- `EmailEvent` - individual events (sent, delivered, opened, clicked, bounced)
- `EmailPreferences` - user/client email opt-in/out preferences
- `ScheduledEmail` - tracks delayed/scheduled emails

---

### 5. npm Dependencies - ALREADY INSTALLED

These were installed during the upgrade. No action needed, but for reference:

| Package | Purpose | Required? |
|---------|---------|-----------|
| `bullmq` | Email queue with retries | Only if using Redis |
| `ioredis` | Redis client for BullMQ | Only if using Redis |
| `@sentry/node` | Error tracking | Only if using Sentry |
| `pino-pretty` | Pretty log output in dev | Dev only |

`pino` and `resend` were already in your project.

---

## Environment Variables Summary

Add these to your `.env` file (local) or Fly.io secrets (`fly secrets set KEY=VALUE`):

```bash
# REQUIRED: Run the database migration (see section 4)

# OPTIONAL: Email queue with retries
REDIS_URL=redis://localhost:6379
EMAIL_QUEUE_ENABLED=true

# OPTIONAL: Email delivery tracking
RESEND_WEBHOOK_SECRET=whsec_xxx

# OPTIONAL: Error monitoring
SENTRY_DSN=https://xxx@sentry.io/xxx
LOG_LEVEL=info
```

---

## Nothing Breaks If You Do Nothing

The only **required** step is the database migration. Everything else is optional and degrades gracefully:

| Feature | Without setup | With setup |
|---------|--------------|------------|
| Email sending | Works (same as before) | Works |
| Email queue | Sends synchronously | Background + 3 retries |
| Delivery tracking | No tracking | Full tracking in DB |
| Unsubscribe | Links work after DB migration | Links work after DB migration |
| Scheduled emails | Needs Redis | Automatic reminders |
| Error tracking | Console logs only | Sentry dashboard + alerts |
| Structured logging | Works out of the box | Works out of the box |

---

## File Structure

```
src/services/email/
├── index.ts              # Main service (all send functions)
├── types.ts              # TypeScript interfaces
├── sender.ts             # Low-level Resend wrapper + DB tracking
├── queue.ts              # BullMQ email queue
├── preferences.ts        # Unsubscribe/preference management
├── scheduler.ts          # Scheduled/delayed emails
└── templates/
    ├── components.ts     # Reusable HTML components
    └── index.ts          # Template builders for each email type

src/services/
├── logger.ts             # Pino structured logger
├── sentry.ts             # Sentry error tracking
├── email.ts              # Backward-compatible re-exports
└── email.legacy.ts       # Original file backup (safe to delete later)

src/routes/
├── webhooks.ts           # Resend webhook handler
├── unsubscribe.ts        # Unsubscribe pages + API
└── adminScheduledEmails.ts  # Admin API for scheduled emails
```

## Rollback

If anything goes wrong, the original email service is saved at `src/services/email.legacy.ts`. To rollback:

1. Delete the `src/services/email/` directory
2. Copy `email.legacy.ts` back to `email.ts`
3. Remove the new imports from `src/index.ts` (emailQueue, webhooks, unsubscribe, adminScheduledEmails, logger, sentry)
4. Revert `prisma/schema.prisma` to remove the new models
5. Run `npx prisma generate`
