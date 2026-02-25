/**
 * Mobile Push Notification Routes
 * Handles push token registration for both job seekers and clients
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { verifyAccessToken } from '../utils/jwt';
import { logger } from '../services/logger';

const r = Router();

const registerSchema = z.object({
  pushToken: z.string().min(1).max(500),
  platform: z.enum(['ios', 'android']).optional().default('android'),
});

/**
 * POST /api/v1/notifications/register
 * Accepts a Bearer JWT from either a user or a client.
 * Upserts the push token so the same device token is never duplicated.
 */
r.post('/register', async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header) {
      return res.status(401).json({ ok: false, error: 'Missing authorization token' });
    }

    const [scheme, rawToken] = header.split(' ');
    if (scheme !== 'Bearer' || !rawToken) {
      return res.status(401).json({ ok: false, error: 'Invalid authorization header' });
    }

    let userId: string | null = null;
    let clientId: string | null = null;

    try {
      const payload = verifyAccessToken(rawToken);
      if (payload.tokenType !== 'access') {
        return res.status(401).json({ ok: false, error: 'Invalid token type' });
      }
      if (payload.type === 'user') {
        userId = payload.sub;
      } else if (payload.type === 'client') {
        clientId = payload.sub;
      } else {
        return res.status(401).json({ ok: false, error: 'Unrecognised token subject' });
      }
    } catch {
      return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
    }

    const body = registerSchema.parse(req.body);

    // Upsert: update owner if token already exists, otherwise create
    await prisma.pushToken.upsert({
      where: { token: body.pushToken },
      update: {
        userId,
        clientId,
        platform: body.platform,
        updatedAt: new Date(),
      },
      create: {
        token: body.pushToken,
        platform: body.platform,
        userId,
        clientId,
      },
    });

    logger.info(`Push token registered for ${userId ? `user ${userId}` : `client ${clientId}`}`);

    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

export default r;
