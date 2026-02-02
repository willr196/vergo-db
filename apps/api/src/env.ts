import 'dotenv/config'

const requireEnv = (k: string) => {
  const v = process.env[k]
  if (!v) throw new Error(`Missing env: ${k}`)
  return v
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 8080),
  dbUrl: requireEnv('DATABASE_URL'),
  jwt: requireEnv('JWT_SECRET'),
  jwtRefresh: process.env.JWT_REFRESH_SECRET || requireEnv('JWT_SECRET'),
  s3Region: requireEnv('S3_REGION'),
  s3Bucket: requireEnv('S3_BUCKET'),
  awsKey: requireEnv('AWS_ACCESS_KEY_ID'),
  awsSecret: requireEnv('AWS_SECRET_ACCESS_KEY'),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:8080',
  resendApiKey: requireEnv('RESEND_API_KEY'),

  // Email Queue (Phase 2)
  redisUrl: process.env.REDIS_URL,
  emailQueueEnabled: process.env.EMAIL_QUEUE_ENABLED === 'true',

  // Resend Webhooks (Phase 3)
  resendWebhookSecret: process.env.RESEND_WEBHOOK_SECRET,

  // Monitoring (Phase 6)
  sentryDsn: process.env.SENTRY_DSN,
  logLevel: process.env.LOG_LEVEL ?? 'info',
}