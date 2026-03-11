import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env } from '../env'

let s3: S3Client | null = null

export function requireS3Config() {
  if (!env.s3Configured) {
    throw new Error('S3 is not configured. Set S3_REGION, S3_BUCKET, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY.')
  }
}

export function getS3Client() {
  requireS3Config()
  if (!s3) {
    s3 = new S3Client({
      region: env.s3Region,
      credentials: {
        accessKeyId: env.awsKey,
        secretAccessKey: env.awsSecret,
      },
    })
  }
  return s3
}

export async function presignUpload(key: string, contentType: string) {
  requireS3Config()
  const s3Client = getS3Client()
  const cmd = new PutObjectCommand({ Bucket: env.s3Bucket, Key: key, ContentType: contentType })
  const url = await getSignedUrl(s3Client, cmd, { expiresIn: 600 })
  return { url }
}

export async function uploadBuffer(key: string, body: Buffer, contentType: string) {
  requireS3Config()
  const s3Client = getS3Client()
  const cmd = new PutObjectCommand({
    Bucket: env.s3Bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  })
  await s3Client.send(cmd)
}

export async function presignDownload(key: string) {
  requireS3Config()
  const s3Client = getS3Client()
  const cmd = new GetObjectCommand({ Bucket: env.s3Bucket, Key: key })
  return getSignedUrl(s3Client, cmd, { expiresIn: 600 })
}
