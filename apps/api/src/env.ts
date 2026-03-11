import 'dotenv/config'
import path from 'node:path'

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

const nodeEnv = process.env.NODE_ENV ?? 'development'
const allowLocalCvUploads =
  process.env.ALLOW_LOCAL_CV_UPLOADS === 'true' || nodeEnv !== 'production'
const localCvUploadRoot = process.env.LOCAL_CV_UPLOAD_ROOT ?? '/tmp/vergo-cv-uploads'
const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:8080'
const normalizedWebOrigin = webOrigin.replace(/\/+$/, '')
const exposeDevVerificationLinks =
  process.env.EXPOSE_DEV_VERIFICATION_LINKS === 'true' &&
  nodeEnv !== 'production' &&
  /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(normalizedWebOrigin)

export const env = {
  nodeEnv,
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
  allowLocalCvUploads,
  localCvUploadRoot,
  webOrigin,
  exposeDevVerificationLinks,
  resendApiKey: process.env.RESEND_API_KEY ?? '',
  resendConfigured: Boolean(process.env.RESEND_API_KEY),
  resendFromEmail: process.env.RESEND_FROM_EMAIL ?? 'noreply@vergoltd.com',
  resendToEmail: process.env.RESEND_TO_EMAIL ?? 'wrobb@vergoltd.com',
  resendToEmailConfigured: Boolean(process.env.RESEND_TO_EMAIL),

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

if (env.nodeEnv === 'production' && !env.s3Configured && !env.allowLocalCvUploads) {
  console.warn('[CONFIG] S3 is not fully configured; upload/CV endpoints will be unavailable');
}

if (env.nodeEnv === 'production' && env.allowLocalCvUploads && !env.s3Configured) {
  console.warn(`[CONFIG] Local CV uploads are enabled without S3 in production; files will be stored on local disk (${env.localCvUploadRoot})`);
  if (path.resolve(env.localCvUploadRoot).startsWith('/tmp')) {
    console.warn('[CONFIG] LOCAL_CV_UPLOAD_ROOT points to /tmp; uploaded CVs can disappear after restarts or when requests hit a different machine');
  }
}

if (env.nodeEnv === 'production' && !env.resendConfigured) {
  console.warn('[CONFIG] RESEND_API_KEY is missing; email sending will be unavailable');
}

if (!env.resendToEmailConfigured) {
  console.warn(`[CONFIG] RESEND_TO_EMAIL is missing; notification emails will be sent to the fallback inbox (${env.resendToEmail})`);
}

if (env.exposeDevVerificationLinks) {
  console.warn('[CONFIG] EXPOSE_DEV_VERIFICATION_LINKS is enabled for a loopback origin; verification links will be returned in auth responses');
}
