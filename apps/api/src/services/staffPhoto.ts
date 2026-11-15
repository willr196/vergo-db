/**
 * Workers' profile photos for the admin pages. A photo is stored on the User
 * as a data: URL (staffAvatar, set at /staff/profile); the admin pages fetch it
 * as an image from GET /api/v1/ops/workers/:id/photo, behind the admin session,
 * rather than have every photo ride inside the list JSON.
 */

import { prisma } from '../prisma';

/** Where an admin page loads a worker's photo. `v` changes when the user row does, so a new photo is not served from cache. */
export function staffPhotoUrl(userId: string, updatedAt: Date) {
  return `/api/v1/ops/workers/${encodeURIComponent(userId)}/photo?v=${updatedAt.getTime()}`;
}

/** Photo URLs for the users among these that have a photo. One query, no photo bytes read. */
export async function staffPhotoUrls(userIds: Array<string | null | undefined>): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: ids }, staffAvatar: { not: null } },
    select: { id: true, updatedAt: true },
  });
  return new Map(users.map((u) => [u.id, staffPhotoUrl(u.id, u.updatedAt)]));
}

/** The image bytes of a stored photo, or null if it is not a base64 image. */
export function decodeStoredPhoto(dataUrl: string | null | undefined) {
  const match = /^data:(image\/(?:jpeg|png|webp|heic|heif));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(dataUrl?.trim() ?? '');
  if (!match) return null;
  return { mimeType: match[1].toLowerCase(), buffer: Buffer.from(match[2], 'base64') };
}
