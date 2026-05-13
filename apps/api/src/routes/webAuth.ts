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

const forceChangePasswordSchema = z.object({
  email: z.string().email().max(255).toLowerCase().trim(),
  currentPassword: z.string().min(1).max(72),
  newPassword: z.string().min(8).max(72),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

const createClientBriefSchema = z.object({
  eventType: z.string().min(2).max(100).trim(),
  eventDate: z.string().optional(),
  eventEndDate: z.string().optional(),
  location: z.string().min(2).max(200).trim(),
  venue: z.string().max(200).trim().optional(),
  requestedLane: z.enum(['FLEX', 'SELECT', 'MANAGED']).optional(),
  staffCount: z.coerce.number().int().min(1).max(500),
  roles: z.string().min(2).max(500).trim(),
  shiftStart: z.string().max(10).trim().optional(),
  shiftEnd: z.string().max(10).trim().optional(),
  description: z.string().max(2000).trim().optional(),
  budget: z.string().max(100).trim().optional(),
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

function parseOptionalDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function establishWorkerSession(
  req: import('express').Request,
  user: { id: string; email: string }
) {
  return new Promise<void>((resolve, reject) => {
    if (!req.session) {
      resolve();
      return;
    }

    req.session.regenerate((err) => {
      if (err) {
        reject(err);
        return;
      }

      req.session.userId = user.id;
      req.session.userEmail = user.email;
      req.session.isUser = true;
      (req.session as any).userLoginTime = Date.now();
      (req.session as any).userLastActivity = Date.now();

      req.session.save((saveErr) => {
        if (saveErr) {
          reject(saveErr);
          return;
        }
        resolve();
      });
    });
  });
}

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
        mustChangePassword: true,
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
            lockedUntil: newAttempts >= 8 ? new Date(Date.now() + 30 * 60 * 1000) : null,
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

      if (user.mustChangePassword) {
        return res.status(403).json({
          ok: false,
          error: 'You must set a new password before continuing.',
          code: 'MUST_CHANGE_PASSWORD',
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

      await establishWorkerSession(req, user);

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
            lockedUntil: newAttempts >= 8 ? new Date(Date.now() + 30 * 60 * 1000) : null,
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
// POST /api/v1/web/force-change-password
// ============================================
r.post('/force-change-password', loginLimiter, async (req, res) => {
  try {
    const parsed = forceChangePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'Invalid input' });
    }

    const { email, currentPassword, newPassword } = parsed.data;

    if (currentPassword === newPassword) {
      return res.status(400).json({ ok: false, error: 'New password must be different from your temporary password' });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        firstName: true,
        lastName: true,
        mustChangePassword: true,
        staffTier: true,
        shortlistSelections: true,
        failedAttempts: true,
        lockedUntil: true,
      },
    });

    const hashToCompare = user?.passwordHash || DUMMY_HASH;
    const passwordMatches = await bcrypt.compare(currentPassword, hashToCompare);

    if (!user || !passwordMatches) {
      if (user) {
        const newAttempts = (user.failedAttempts || 0) + 1;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedAttempts: newAttempts,
            lockedUntil: newAttempts >= 8 ? new Date(Date.now() + 30 * 60 * 1000) : null,
          },
        });
      }
      return res.status(401).json({ ok: false, error: 'Invalid email or password' });
    }

    if (!user.mustChangePassword) {
      return res.status(400).json({ ok: false, error: 'Password change not required. Please log in normally.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        failedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    console.log(`[WEB] Force password change completed: ${user.email}`);

    const accessToken = signAccessToken({ sub: user.id, type: 'user', email: user.email });
    const refreshToken = signRefreshToken({ sub: user.id, type: 'user', email: user.email });

    await prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(refreshToken),
        userId: user.id,
        expiresAt: getTokenExpiresAt(refreshToken),
      },
    });

    await establishWorkerSession(req, user);

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
  } catch (error) {
    console.error('[ERROR] Web force-change-password failed:', error);
    return res.status(500).json({ ok: false, error: 'Request failed. Please try again.' });
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
// POST /api/v1/web/client/briefs — create authenticated client brief
// ============================================
r.post('/client/briefs', requireClientJwt, async (req, res) => {
  try {
    const parsed = createClientBriefSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid brief details',
        details: parsed.error.issues.map((i) => i.message),
      });
    }

    const data = parsed.data;
    const brief = await prisma.quoteRequest.create({
      data: {
        eventType: data.eventType,
        eventDate: parseOptionalDate(data.eventDate),
        eventEndDate: parseOptionalDate(data.eventEndDate),
        location: data.location,
        venue: data.venue || null,
        requestedLane: data.requestedLane || null,
        staffCount: data.staffCount,
        roles: data.roles,
        shiftStart: data.shiftStart || null,
        shiftEnd: data.shiftEnd || null,
        description: data.description || null,
        budget: data.budget || null,
        status: 'NEW',
        clientId: req.auth!.userId,
      },
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

    return res.status(201).json({
      ok: true,
      brief: {
        ...brief,
        quotedAmount: brief.quotedAmount ? Number(brief.quotedAmount) : null,
      },
    });
  } catch (error) {
    console.error('[ERROR] Web client brief creation failed:', error);
    return res.status(500).json({ ok: false, error: 'Failed to create brief' });
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

// ============================================
// WORKER AVAILABILITY
// ============================================

const availabilityBody = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateFrom must be YYYY-MM-DD'),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateTo must be YYYY-MM-DD'),
  notes: z.string().max(200).optional(),
});

function toDateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

// GET /api/v1/web/worker/availability
r.get('/worker/availability', requireUserJwt, async (req, res, next) => {
  try {
    const windows = await prisma.availability.findMany({
      where: { userId: req.auth!.userId },
      orderBy: { dateFrom: 'asc' },
      select: { id: true, dateFrom: true, dateTo: true, notes: true, createdAt: true },
    });
    res.json({ ok: true, availability: windows, data: windows });
  } catch (e) { next(e); }
});

// POST /api/v1/web/worker/availability
r.post('/worker/availability', requireUserJwt, async (req, res, next) => {
  try {
    const parsed = availabilityBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'Invalid input', issues: parsed.error.issues });
    }

    const { dateFrom, dateTo, notes } = parsed.data;
    const from = toDateOnly(dateFrom);
    const to = toDateOnly(dateTo);

    if (to < from) {
      return res.status(400).json({ ok: false, error: 'dateTo must be on or after dateFrom' });
    }

    // Cap future window to 1 year
    const maxDate = new Date();
    maxDate.setFullYear(maxDate.getFullYear() + 1);
    if (from > maxDate) {
      return res.status(400).json({ ok: false, error: 'Availability cannot be set more than 1 year in advance' });
    }

    const window = await prisma.availability.create({
      data: { userId: req.auth!.userId, dateFrom: from, dateTo: to, notes: notes ?? null },
      select: { id: true, dateFrom: true, dateTo: true, notes: true, createdAt: true },
    });

    res.status(201).json({ ok: true, window, data: window });
  } catch (e) { next(e); }
});

// DELETE /api/v1/web/worker/availability/:id
r.delete('/worker/availability/:id', requireUserJwt, async (req, res, next) => {
  try {
    const existing = await prisma.availability.findUnique({
      where: { id: req.params.id },
      select: { id: true, userId: true },
    });

    if (!existing || existing.userId !== req.auth!.userId) {
      return res.status(404).json({ ok: false, error: 'Availability window not found' });
    }

    await prisma.availability.delete({ where: { id: existing.id } });
    res.json({ ok: true, data: { id: existing.id } });
  } catch (e) { next(e); }
});

// ============================================
// WORKER INVITES
// ============================================

// GET /api/v1/web/worker/invites
r.get('/worker/invites', requireUserJwt, async (req, res, next) => {
  try {
    const invites = await prisma.jobInvite.findMany({
      where: { userId: req.auth!.userId, status: { in: ['PENDING', 'ACCEPTED'] } },
      orderBy: { createdAt: 'desc' },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            location: true,
            venue: true,
            eventDate: true,
            shiftStart: true,
            shiftEnd: true,
            payRate: true,
            payType: true,
            staffNeeded: true,
            staffConfirmed: true,
            status: true,
            role: { select: { name: true } },
          },
        },
      },
    });

    const shaped = invites.map((i) => ({
      id: i.id,
      status: i.status,
      adminNote: i.adminNote,
      workerNote: i.workerNote,
      createdAt: i.createdAt,
      respondedAt: i.respondedAt,
      job: {
        ...i.job,
        payRate: i.job.payRate ? Number(i.job.payRate) : null,
        spotsLeft: Math.max(0, i.job.staffNeeded - i.job.staffConfirmed),
      },
    }));

    res.json({ ok: true, invites: shaped, data: shaped });
  } catch (e) { next(e); }
});

// POST /api/v1/web/worker/invites/:id/respond
const respondInviteBody = z.object({
  accept: z.boolean(),
  workerNote: z.string().max(500).optional(),
});

r.post('/worker/invites/:id/respond', requireUserJwt, async (req, res, next) => {
  try {
    const parsed = respondInviteBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'Invalid input' });
    }

    const invite = await prisma.jobInvite.findUnique({
      where: { id: req.params.id },
      include: { job: { select: { id: true, title: true, status: true, staffNeeded: true, staffConfirmed: true } } },
    });

    if (!invite || invite.userId !== req.auth!.userId) {
      return res.status(404).json({ ok: false, error: 'Invite not found' });
    }
    if (invite.status !== 'PENDING') {
      return res.status(409).json({ ok: false, error: `Invite already ${invite.status.toLowerCase()}` });
    }
    if (!['OPEN', 'PENDING'].includes(invite.job.status)) {
      return res.status(400).json({ ok: false, error: 'This job is no longer accepting applications' });
    }

    const newStatus = parsed.data.accept ? 'ACCEPTED' : 'DECLINED';

    await prisma.$transaction(async (tx) => {
      await tx.jobInvite.update({
        where: { id: invite.id },
        data: {
          status: newStatus,
          workerNote: parsed.data.workerNote ?? null,
          respondedAt: new Date(),
        },
      });

      if (parsed.data.accept) {
        // Check not already applied
        const existing = await tx.jobApplication.findUnique({
          where: { userId_jobId: { userId: req.auth!.userId, jobId: invite.jobId } },
        });
        if (!existing) {
          await tx.jobApplication.create({
            data: {
              userId: req.auth!.userId,
              jobId: invite.jobId,
              status: 'SHORTLISTED',
              coverNote: parsed.data.workerNote ?? null,
            },
          });
        }
      }
    });

    res.json({ ok: true, status: newStatus, data: { status: newStatus } });
  } catch (e) { next(e); }
});

// ============================================
// CLIENT: Submit review for completed booking
// ============================================

const reviewBody = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

r.post('/client/bookings/:id/review', requireClientJwt, async (req, res, next) => {
  try {
    const parsed = reviewBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'Rating must be 1–5', issues: parsed.error.issues });
    }

    const booking = await prisma.booking.findFirst({
      where: { id: req.params.id, clientId: req.auth!.userId },
      select: { id: true, staffId: true, clientId: true, status: true, review: { select: { id: true } } },
    });

    if (!booking) return res.status(404).json({ ok: false, error: 'Booking not found' });
    if (booking.status !== 'COMPLETED') {
      return res.status(400).json({ ok: false, error: 'Reviews can only be submitted for completed bookings' });
    }
    if (booking.review) {
      return res.status(409).json({ ok: false, error: 'A review has already been submitted for this booking' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.bookingReview.create({
        data: {
          bookingId: booking.id,
          staffId: booking.staffId,
          clientId: booking.clientId,
          rating: parsed.data.rating,
          comment: parsed.data.comment ?? null,
        },
      });

      // Recalculate worker's average rating
      const reviews = await tx.bookingReview.findMany({
        where: { staffId: booking.staffId },
        select: { rating: true },
      });
      const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

      await tx.user.update({
        where: { id: booking.staffId },
        data: {
          staffRating: Math.round(avg * 100) / 100,
          staffReviewCount: reviews.length,
        },
      });
    });

    res.status(201).json({ ok: true, data: { message: 'Review submitted' } });
  } catch (e) { next(e); }
});

export default r;
