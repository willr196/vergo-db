import 'dotenv/config'

const requireEnv = (k: string) => {
  const v = process.env[k]
  if (!v) throw new Error(`Missing env: ${k}`)
  return v
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
  s3Region: requireEnv('S3_REGION'),
  s3Bucket: requireEnv('S3_BUCKET'),
  awsKey: requireEnv('AWS_ACCESS_KEY_ID'),
  awsSecret: requireEnv('AWS_SECRET_ACCESS_KEY'),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:8080',
  resendApiKey: requireEnv('RESEND_API_KEY'),
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
}
