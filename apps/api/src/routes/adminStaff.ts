import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { adminAuth } from '../middleware/adminAuth';
import { authLogger } from '../services/logger';

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

export default r;
