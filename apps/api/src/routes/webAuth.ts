import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma } from '../prisma';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  getTokenExpiresAt,
  hashToken,
} from '../utils/jwt';
import { requireUserJwt, requireClientJwt } from '../middleware/jwtAuth';

const r = Router();

const DUMMY_HASH = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.G0G0G0G0G0G0G0';

const loginSchema = z.object({
  email: z.string().email().max(255).toLowerCase().trim(),
  password: z.string().min(8).max(72),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: { ok: false, error: 'Too many login attempts. Try again in 15 minutes.' },
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return `${req.ip}-${email}`;
  },
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { ok: false, error: 'Too many refresh attempts. Try again later.' },
});

// ============================================
// POST /api/v1/web/login — unified worker + client login
// ============================================
r.post('/login', loginLimiter, async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'Invalid email or password' });
    }

    const { email, password } = parsed.data;

    // --- Try User (worker) table first ---
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        firstName: true,
        lastName: true,
        emailVerified: true,
        staffTier: true,
        shortlistSelections: true,
        failedAttempts: true,
        lockedUntil: true,
      },
    });

    if (user) {
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        const min = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
        return res.status(423).json({
          ok: false,
          error: `Account temporarily locked. Try again in ${min} minute${min !== 1 ? 's' : ''}.`,
        });
      }

      const passwordMatches = await bcrypt.compare(password, user.passwordHash);

      if (!passwordMatches) {
        const newAttempts = (user.failedAttempts || 0) + 1;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedAttempts: newAttempts,
            lockedUntil: newAttempts >= 5 ? new Date(Date.now() + 30 * 60 * 1000) : null,
          },
        });
        return res.status(401).json({ ok: false, error: 'Invalid email or password' });
      }

      if (!user.emailVerified) {
        return res.status(403).json({
          ok: false,
          error: 'Please verify your email before logging in.',
          code: 'EMAIL_NOT_VERIFIED',
        });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
      });

      const accessToken = signAccessToken({ sub: user.id, type: 'user', email: user.email });
      const refreshToken = signRefreshToken({ sub: user.id, type: 'user', email: user.email });

      await prisma.refreshToken.create({
        data: {
          tokenHash: hashToken(refreshToken),
          userId: user.id,
          expiresAt: getTokenExpiresAt(refreshToken),
        },
      });

      console.log(`[WEB] Worker login: ${user.email}`);

      return res.json({
        ok: true,
        token: accessToken,
        refreshToken,
        userType: 'worker',
        user: {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          staffTier: user.staffTier,
        },
      });
    }

    // --- Try Client table ---
    const client = await prisma.client.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        companyName: true,
        contactName: true,
        emailVerified: true,
        status: true,
        subscriptionTier: true,
        failedAttempts: true,
        lockedUntil: true,
      },
    });

    const hashToCompare = client?.passwordHash || DUMMY_HASH;
    const clientPasswordMatches = await bcrypt.compare(password, hashToCompare);

    if (client?.lockedUntil && client.lockedUntil > new Date()) {
      const min = Math.ceil((client.lockedUntil.getTime() - Date.now()) / 60000);
      return res.status(423).json({
        ok: false,
        error: `Account temporarily locked. Try again in ${min} minute${min !== 1 ? 's' : ''}.`,
      });
    }

    if (!client || !clientPasswordMatches) {
      if (client) {
        const newAttempts = (client.failedAttempts || 0) + 1;
        await prisma.client.update({
          where: { id: client.id },
          data: {
            failedAttempts: newAttempts,
            lockedUntil: newAttempts >= 5 ? new Date(Date.now() + 30 * 60 * 1000) : null,
          },
        });
      }
      return res.status(401).json({ ok: false, error: 'Invalid email or password' });
    }

    if (!client.emailVerified) {
      return res.status(403).json({
        ok: false,
        error: 'Please verify your email before logging in.',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    if (client.status === 'PENDING') {
      return res.status(403).json({
        ok: false,
        error: 'Your account is pending approval. We will notify you once reviewed.',
        code: 'PENDING_APPROVAL',
      });
    }

    if (client.status === 'REJECTED') {
      return res.status(403).json({
        ok: false,
        error: 'Your account application was not approved. Please contact us for more information.',
        code: 'REJECTED',
      });
    }

    if (client.status === 'SUSPENDED') {
      return res.status(403).json({
        ok: false,
        error: 'Your account has been suspended. Please contact us for assistance.',
        code: 'SUSPENDED',
      });
    }

    await prisma.client.update({
      where: { id: client.id },
      data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const accessToken = signAccessToken({ sub: client.id, type: 'client', email: client.email });
    const refreshToken = signRefreshToken({ sub: client.id, type: 'client', email: client.email });

    await prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(refreshToken),
        clientId: client.id,
        expiresAt: getTokenExpiresAt(refreshToken),
      },
    });

    console.log(`[WEB] Client login: ${client.companyName}`);

    return res.json({
      ok: true,
      token: accessToken,
      refreshToken,
      userType: 'client',
      user: {
        id: client.id,
        email: client.email,
        name: client.contactName,
        companyName: client.companyName,
        subscriptionTier: client.subscriptionTier,
      },
    });
  } catch (error) {
    console.error('[ERROR] Web login failed:', error);
    return res.status(500).json({ ok: false, error: 'Login failed. Please try again.' });
  }
});

// ============================================
// POST /api/v1/web/refresh
// ============================================
r.post('/refresh', refreshLimiter, async (req, res) => {
  try {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'Invalid input' });
    }

    const payload = verifyRefreshToken(parsed.data.refreshToken);
    if (payload.tokenType !== 'refresh') {
      return res.status(401).json({ ok: false, error: 'Invalid refresh token' });
    }

    const tokenHash = hashToken(parsed.data.refreshToken);
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
    const now = new Date();

    if (!stored || stored.expiresAt < now) {
      return res.status(401).json({ ok: false, error: 'Refresh token expired or not found' });
    }

    if (stored.revokedAt) {
      // Replay detected — revoke all active tokens for this subject
      if (payload.type === 'user') {
        await prisma.refreshToken.updateMany({
          where: { userId: payload.sub, revokedAt: null },
          data: { revokedAt: now },
        });
      } else {
        await prisma.refreshToken.updateMany({
          where: { clientId: payload.sub, revokedAt: null },
          data: { revokedAt: now },
        });
      }
      console.warn(`[SECURITY] Refresh token reuse (web): sub=${payload.sub}`);
      return res.status(401).json({
        ok: false,
        error: 'Token reuse detected. Please log in again.',
        code: 'REFRESH_TOKEN_REUSE_DETECTED',
      });
    }

    // Rotate tokens
    await prisma.refreshToken.update({ where: { tokenHash }, data: { revokedAt: now } });

    const accessToken = signAccessToken({ sub: payload.sub, type: payload.type, email: payload.email });
    const newRefreshToken = signRefreshToken({ sub: payload.sub, type: payload.type, email: payload.email });

    await prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(newRefreshToken),
        ...(payload.type === 'user' ? { userId: payload.sub } : { clientId: payload.sub }),
        expiresAt: getTokenExpiresAt(newRefreshToken),
      },
    });

    return res.json({ ok: true, token: accessToken, refreshToken: newRefreshToken });
  } catch {
    return res.status(401).json({ ok: false, error: 'Invalid or expired refresh token' });
  }
});

// ============================================
// POST /api/v1/web/logout
// ============================================
r.post('/logout', async (req, res) => {
  try {
    const parsed = logoutSchema.safeParse(req.body);
    const token = parsed.success ? parsed.data.refreshToken : undefined;

    if (token) {
      await prisma.refreshToken.updateMany({
        where: { tokenHash: hashToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ ok: false, error: 'Logout failed' });
  }
});

// ============================================
// GET /api/v1/web/worker/me — authenticated worker profile
// ============================================
r.get('/worker/me', requireUserJwt, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        staffTier: true,
        shortlistSelections: true,
        staffAvailable: true,
        staffRating: true,
        staffReviewCount: true,
        _count: { select: { jobApplications: true } },
      },
    });

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    // Count how many Shortlist-tier jobs this worker has applied to
    const shortlistApplications = await prisma.jobApplication.count({
      where: { userId: req.auth!.userId, job: { tier: 'SHORTLIST' } },
    });

    return res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        name: `${user.firstName} ${user.lastName}`,
        phone: user.phone,
        staffTier: user.staffTier,
        shortlistSelections: user.shortlistSelections,
        shortlistApplications,
        staffAvailable: user.staffAvailable,
        staffRating: user.staffRating ? Number(user.staffRating) : null,
        staffReviewCount: user.staffReviewCount,
        totalApplications: user._count.jobApplications,
      },
    });
  } catch (error) {
    console.error('[ERROR] Web worker/me failed:', error);
    return res.status(500).json({ ok: false, error: 'Failed to get profile' });
  }
});

// ============================================
// GET /api/v1/web/client/me — authenticated client profile
// ============================================
r.get('/client/me', requireClientJwt, async (req, res) => {
  try {
    const client = await prisma.client.findUnique({
      where: { id: req.auth!.userId },
      select: {
        id: true,
        email: true,
        companyName: true,
        contactName: true,
        phone: true,
        industry: true,
        website: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        status: true,
      },
    });

    if (!client) {
      return res.status(404).json({ ok: false, error: 'Client not found' });
    }

    return res.json({ ok: true, client });
  } catch (error) {
    console.error('[ERROR] Web client/me failed:', error);
    return res.status(500).json({ ok: false, error: 'Failed to get profile' });
  }
});

// ============================================
// GET /api/v1/web/client/briefs — client quote requests / briefs
// ============================================
r.get('/client/briefs', requireClientJwt, async (req, res) => {
  try {
    const briefs = await prisma.quoteRequest.findMany({
      where: { clientId: req.auth!.userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        eventType: true,
        eventDate: true,
        eventEndDate: true,
        location: true,
        venue: true,
        staffCount: true,
        roles: true,
        status: true,
        quotedAmount: true,
        quoteSentAt: true,
        requestedLane: true,
        description: true,
        createdAt: true,
      },
    });

    const shaped = briefs.map((b) => ({
      ...b,
      quotedAmount: b.quotedAmount ? Number(b.quotedAmount) : null,
    }));

    return res.json({ ok: true, briefs: shaped });
  } catch (error) {
    console.error('[ERROR] Web client/briefs failed:', error);
    return res.status(500).json({ ok: false, error: 'Failed to get briefs' });
  }
});

// ============================================
// GET /api/v1/web/client/bookings — client bookings / events
// ============================================
r.get('/client/bookings', requireClientJwt, async (req, res) => {
  try {
    const bookings = await prisma.booking.findMany({
      where: { clientId: req.auth!.userId },
      orderBy: [{ eventDate: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        eventName: true,
        eventDate: true,
        eventEndDate: true,
        location: true,
        venue: true,
        shiftStart: true,
        shiftEnd: true,
        status: true,
        bookingLane: true,
        hourlyRateCharged: true,
        hoursEstimated: true,
        totalEstimated: true,
        confirmedAt: true,
        createdAt: true,
        staff: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            staffTier: true,
          },
        },
      },
    });

    const shaped = bookings.map((b) => ({
      ...b,
      hourlyRateCharged: Number(b.hourlyRateCharged),
      hoursEstimated: b.hoursEstimated ? Number(b.hoursEstimated) : null,
      totalEstimated: b.totalEstimated ? Number(b.totalEstimated) : null,
    }));

    return res.json({ ok: true, bookings: shaped });
  } catch (error) {
    console.error('[ERROR] Web client/bookings failed:', error);
    return res.status(500).json({ ok: false, error: 'Failed to get bookings' });
  }
});

export default r;
