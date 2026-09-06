import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { adminAuth } from '../middleware/adminAuth';
import { authLogger } from '../services/logger';
import { getStaffSchedule } from '../services/jobStaffing';

const r = Router();

const tierBody = z.object({
  tier: z.enum(['STANDARD', 'GOLD'])
});

const visibilityBody = z.object({
  visible: z.boolean()
});

r.patch('/:applicantId/tier', adminAuth, async (req, res, next) => {
  try {
    const parsed = tierBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', issues: parsed.error.issues });
    }

    const current = await prisma.applicant.findUnique({
      where: { id: req.params.applicantId },
      select: { id: true, staffTier: true, promotedToGoldAt: true }
    });

    if (!current) {
      return res.status(404).json({ error: 'Applicant not found' });
    }

    const nextTier = parsed.data.tier;
    const promotedToGoldAt = nextTier === 'GOLD'
      ? (current.staffTier === 'GOLD' ? current.promotedToGoldAt : new Date())
      : null;

    const applicant = await prisma.applicant.update({
      where: { id: current.id },
      data: {
        staffTier: nextTier,
        promotedToGoldAt
      },
      select: {
        id: true,
        staffTier: true,
        promotedToGoldAt: true,
        updatedAt: true
      }
    });

    const adminUsername = (req.session as any)?.username || 'admin';
    authLogger.info({
      action: 'applicant_tier_updated',
      admin: adminUsername,
      applicantId: applicant.id,
      tier: applicant.staffTier
    }, 'Admin updated applicant tier');

    res.json({ ok: true, applicant, data: applicant });
  } catch (e) { next(e); }
});

r.patch('/:applicantId/visibility', adminAuth, async (req, res, next) => {
  try {
    const parsed = visibilityBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', issues: parsed.error.issues });
    }

    const current = await prisma.applicant.findUnique({
      where: { id: req.params.applicantId },
      select: { id: true }
    });

    if (!current) {
      return res.status(404).json({ error: 'Applicant not found' });
    }

    const applicant = await prisma.applicant.update({
      where: { id: current.id },
      data: { profileVisible: parsed.data.visible },
      select: {
        id: true,
        profileVisible: true,
        updatedAt: true
      }
    });

    const adminUsername = (req.session as any)?.username || 'admin';
    authLogger.info({
      action: 'applicant_visibility_updated',
      admin: adminUsername,
      applicantId: applicant.id,
      visible: applicant.profileVisible
    }, 'Admin updated applicant visibility');

    res.json({ ok: true, applicant, data: applicant });
  } catch (e) { next(e); }
});

/**
 * GET /api/v1/admin/staff/:applicantId/schedule
 *
 * Which jobs this person is working and on which days. Keyed by applicant id
 * because that is what the roster drawer has; the days themselves hang off the
 * User account, so someone who has never been sent a login email simply has an
 * empty schedule rather than a 404.
 */
r.get('/:applicantId/schedule', adminAuth, async (req, res, next) => {
  try {
    const applicant = await prisma.applicant.findUnique({
      where: { id: req.params.applicantId },
      select: { id: true }
    });

    if (!applicant) {
      return res.status(404).json({ error: 'Applicant not found' });
    }

    const user = await prisma.user.findUnique({
      where: { applicantId: applicant.id },
      select: { id: true, firstName: true, lastName: true }
    });

    if (!user) {
      const empty = {
        hasAccount: false,
        jobs: [],
        totals: { jobCount: 0, dayCount: 0, upcomingDayCount: 0, nextDate: null }
      };
      return res.json({ ok: true, ...empty, data: empty });
    }

    const schedule = await getStaffSchedule(user.id);
    const payload = { hasAccount: true, userId: user.id, ...schedule };

    res.json({ ok: true, ...payload, data: payload });
  } catch (e) { next(e); }
});

export default r;
