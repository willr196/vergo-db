import 'dotenv/config'

const requireEnv = (k: string) => {
  const v = process.env[k]
  if (!v) throw new Error(`Missing env: ${k}`)
  return v
}

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const jwt = requireEnv('JWT_SECRET')
const jwtRefresh = process.env.JWT_REFRESH_SECRET || jwt
if ((process.env.NODE_ENV ?? 'development') === 'production' && !process.env.JWT_REFRESH_SECRET) {
  console.warn('[SECURITY] JWT_REFRESH_SECRET not set; falling back to JWT_SECRET')
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 8080),
  dbUrl: requireEnv('DATABASE_URL'),
  jwt,
  jwtRefresh,
  s3Region: process.env.S3_REGION ?? '',
  s3Bucket: process.env.S3_BUCKET ?? '',
  awsKey: process.env.AWS_ACCESS_KEY_ID ?? '',
  awsSecret: process.env.AWS_SECRET_ACCESS_KEY ?? '',
  s3Configured: Boolean(
    process.env.S3_REGION &&
    process.env.S3_BUCKET &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
  ),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:8080',
  resendApiKey: process.env.RESEND_API_KEY ?? '',
  resendConfigured: Boolean(process.env.RESEND_API_KEY),
  resendFromEmail: process.env.RESEND_FROM_EMAIL ?? 'noreply@vergoltd.com',
  resendToEmail: process.env.RESEND_TO_EMAIL ?? 'wrobb@vergoltd.com',

  // Email Queue (Phase 2)
  redisUrl: process.env.REDIS_URL,
  emailQueueEnabled: process.env.EMAIL_QUEUE_ENABLED === 'true',

  // Resend Webhooks (Phase 3)
  resendWebhookSecret: process.env.RESEND_WEBHOOK_SECRET,

  // Monitoring (Phase 6)
  sentryDsn: process.env.SENTRY_DSN,
  logLevel: process.env.LOG_LEVEL ?? 'info',
  memoryLogEnabled: (process.env.MEMORY_LOG_ENABLED ?? (((process.env.NODE_ENV ?? 'development') === 'production') ? 'true' : 'false')) === 'true',
  memoryLogIntervalMs: parsePositiveInt(process.env.MEMORY_LOG_INTERVAL_MS, 5 * 60 * 1000),
  memoryWarnRssMb: parsePositiveInt(process.env.MEMORY_WARN_RSS_MB, 384),
}

if (env.nodeEnv === 'production' && !env.s3Configured) {
  console.warn('[CONFIG] S3 is not fully configured; upload/CV endpoints will be unavailable');
}

if (env.nodeEnv === 'production' && !env.resendConfigured) {
  console.warn('[CONFIG] RESEND_API_KEY is missing; email sending will be unavailable');
}
