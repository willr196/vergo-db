import 'dotenv/config'

const requireEnv = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
};

// Allow email fallback modes without forcing RESEND_API_KEY at boot
export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 8080),
  dbUrl: requireEnv('DATABASE_URL'),
  jwt: requireEnv('JWT_SECRET'),
  s3Region: requireEnv('S3_REGION'),
  s3Bucket: requireEnv('S3_BUCKET'),
  awsKey: requireEnv('AWS_ACCESS_KEY_ID'),
  awsSecret: requireEnv('AWS_SECRET_ACCESS_KEY'),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:8080',
  emailMode: process.env.EMAIL_MODE ?? 'resend', // 'resend' | 'log' | 's3'
  resendApiKey: process.env.RESEND_API_KEY, // only required if emailMode === 'resend'
};
