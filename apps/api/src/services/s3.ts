import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env } from '../env'

const s3 = new S3Client({ region: env.s3Region })

export async function presignUpload(key: string, contentType: string) {
  const cmd = new PutObjectCommand({ Bucket: env.s3Bucket, Key: key, ContentType: contentType })
  const url = await getSignedUrl(s3, cmd, { expiresIn: 600 })
  return { url }
}

export async function presignDownload(key: string) {
  const cmd = new GetObjectCommand({ Bucket: env.s3Bucket, Key: key })
  return getSignedUrl(s3, cmd, { expiresIn: 600 })
}
