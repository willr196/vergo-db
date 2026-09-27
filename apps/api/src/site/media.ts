import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Response } from 'express';
import sharp from 'sharp';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../env';
import { getS3Client, uploadBuffer } from '../services/s3';

/**
 * Photos uploaded in the admin "Site content" section. Each upload becomes
 * WebP copies at 800px and 1600px wide (only widths the original reaches, and
 * always at least one), stored under site/<id>-<width>.webp in the existing
 * S3 bucket, and served at /media/site/<id>-<width>.webp.
 *
 * Without S3 (local development only) the files go to apps/api/uploads/site/.
 * A Fly machine's disk doesn't survive a deploy, so production needs S3.
 */

export const PHOTO_WIDTHS = [800, 1600];
export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const LOCAL_DIR = path.join(process.cwd(), 'uploads', 'site');
const KEY = /^[a-f0-9-]{36}-\d{2,4}\.webp$/;

export function mediaStorage(): 's3' | 'local' | null {
  // Tests always write to local disk: the dev .env carries real S3
  // credentials, and a test run must never put files in the live bucket.
  if (process.env.NODE_ENV === 'test') return 'local';
  if (env.s3Configured) return 's3';
  return process.env.NODE_ENV === 'production' ? null : 'local';
}

export interface StoredPhoto {
  /** "/media/site/<id>-{w}.webp" */
  path: string;
  variants: number[];
  width: number;
  height: number;
}

/**
 * Checks the upload is really an image (sharp reads it or throws), then
 * writes the WebP widths. The original isn't kept: EXIF, GPS included, is
 * dropped by the re-encode.
 */
export async function storePhoto(input: Buffer): Promise<StoredPhoto> {
  const storage = mediaStorage();
  if (!storage) throw Object.assign(new Error('Photo uploads need S3, which is not configured here.'), { status: 503 });
  if (input.byteLength > MAX_PHOTO_BYTES) throw Object.assign(new Error('That photo is over 12MB.'), { status: 400 });

  const notAPhoto = () => Object.assign(new Error('That file is not a photo we can use (JPEG, PNG, WebP, HEIC or AVIF).'), { status: 400 });
  let meta: sharp.Metadata;
  try {
    meta = await sharp(input, { failOn: 'error' }).metadata();
  } catch {
    throw notAPhoto();
  }
  if (!meta.width || !meta.height || !['jpeg', 'png', 'webp', 'heif', 'avif', 'tiff'].includes(meta.format || '')) {
    throw notAPhoto();
  }
  // .rotate() applies the EXIF orientation, so a portrait phone photo's
  // width and height are swapped from what the header says.
  const rotated = (meta.orientation || 1) >= 5;
  const width = rotated ? meta.height : meta.width;
  const height = rotated ? meta.width : meta.height;

  const widths = PHOTO_WIDTHS.filter((w) => w <= width);
  if (!widths.length) widths.push(width);

  const id = randomUUID();
  for (const w of widths) {
    const body = await sharp(input).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    const file = `${id}-${w}.webp`;
    if (storage === 's3') {
      await uploadBuffer(`site/${file}`, body, 'image/webp');
    } else {
      fs.mkdirSync(LOCAL_DIR, { recursive: true });
      fs.writeFileSync(path.join(LOCAL_DIR, file), body);
    }
  }
  return { path: `/media/site/${id}-{w}.webp`, variants: widths, width, height };
}

/** GET /media/site/:file. Keys are unique per upload, so a year's cache is safe. */
export async function sendMedia(file: string, res: Response): Promise<void> {
  if (!KEY.test(file)) {
    res.status(404).end();
    return;
  }
  const storage = mediaStorage();
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.type('image/webp');
  if (storage === 's3') {
    try {
      const out = await getS3Client().send(new GetObjectCommand({ Bucket: env.s3Bucket, Key: `site/${file}` }));
      const bytes = await out.Body?.transformToByteArray();
      if (!bytes) throw new Error('empty');
      res.send(Buffer.from(bytes));
    } catch {
      res.removeHeader('Cache-Control');
      res.status(404).end();
    }
    return;
  }
  const local = path.join(LOCAL_DIR, file);
  if (storage === 'local' && fs.existsSync(local)) {
    res.sendFile(local);
    return;
  }
  res.removeHeader('Cache-Control');
  res.status(404).end();
}
