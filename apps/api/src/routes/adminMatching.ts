import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { adminAuth } from '../middleware/adminAuth';
import { authLogger } from '../services/logger';
import { sendJobInviteEmail } from '../services/email';

const r = Router();
r.use(adminAuth);

// ============================================
// SCORING
// ============================================

function computeMatchScore(worker: {
  staffRating: any;
  staffReviewCount: number;
  staffTier: string | null;
  staffAvailable: boolean;
  applicant: { totalBookings: number } | null;
}, flags: {
  hasRoleMatch: boolean;
  hasAvailability: boolean;
  hasNoConflict: boolean;
}) {
  let score = 0;
  const reasons: string[] = [];

  if (flags.hasRoleMatch) {
    score += 40;
    reasons.push('Role history match');
  }
  if (flags.hasAvailability) {
    score += 30;
    reasons.push('Declared available');
  }
  if (flags.hasNoConflict) {
    score += 20;
    reasons.push('No booking conflict');
  }
  if (worker.staffAvailable) {
    score += 5;
    reasons.push('Set available');
  }
  if (worker.staffTier === 'ELITE') {
    score += 5;
    reasons.push('Elite tier');
  }
  if (worker.staffRating) {
    const ratingBonus = Math.round((Number(worker.staffRating) / 5) * 15);
    score += ratingBonus;
    if (ratingBonus > 0) reasons.push(`Rating ${Number(worker.staffRating).toFixed(1)}`);
  }
  const bookings = worker.applicant?.totalBookings ?? 0;
  const expBonus = Math.min(Math.floor(bookings * 0.5), 10);
  if (expBonus > 0) {
    score += expBonus;
    reasons.push(`${bookings} bookings`);
  }

  return { score, reasons };
}

// ============================================
// GET /api/v1/admin/matching/:jobId/matches
// Returns ranked workers for a specific job
// ============================================

const matchQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  tierFilter: z.enum(['STANDARD', 'ELITE']).optional(),
  availableOnly: z.coerce.boolean().default(false),
});

r.get('/:jobId/matches', async (req, res, next) => {
  try {
    const job = await prisma.job.findUnique({
      where: { id: req.params.jobId },
      select: {
        id: true,
        title: true,
        roleId: true,
        eventDate: true,
        staffNeeded: true,
        staffConfirmed: true,
        status: true,
        role: { select: { name: true } },
      },
    });

    if (!job) return res.status(404).json({ error: 'Job not found' });

    const query = matchQuerySchema.parse(req.query);

    // Workers who already have an active application or confirmed invite to this job
    const alreadyEngaged = await prisma.jobApplication.findMany({
      where: {
        jobId: job.id,
        status: { in: ['PENDING', 'SHORTLISTED', 'CONFIRMED'] },
      },
      select: { userId: true },
    });
    const engagedIds = new Set(alreadyEngaged.map((a) => a.userId));

    // Workers with existing invite (any status) — shown separately in invite list
    const existingInvites = await prisma.jobInvite.findMany({
      where: { jobId: job.id },
      select: { userId: true, status: true },
    });
    const invitedIds = new Map(existingInvites.map((i) => [i.userId, i.status]));

    // Workers who have confirmed history in this role
    const roleMatchIds = new Set(
      (
        await prisma.jobApplication.findMany({
          where: {
            job: { roleId: job.roleId },
            status: { in: ['CONFIRMED', 'SHORTLISTED'] },
          },
          select: { userId: true },
          distinct: ['userId'],
        })
      ).map((a) => a.userId)
    );

    const eventDate = job.eventDate;

    // Build where clause for workers
    const workerWhere: any = {
      userType: 'JOB_SEEKER',
      staffTier: { not: null },
    };
    if (query.tierFilter) workerWhere.staffTier = query.tierFilter;

    const allWorkers = await prisma.user.findMany({
      where: workerWhere,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        staffTier: true,
        staffAvailable: true,
        staffRating: true,
        staffReviewCount: true,
        staffBio: true,
        staffAvatar: true,
        applicant: {
          select: {
            id: true,
            totalBookings: true,
            postcode: true,
          },
        },
        // Availability windows that cover the event date
        availability: eventDate
          ? {
              where: {
                dateFrom: { lte: eventDate },
                dateTo: { gte: eventDate },
              },
              select: { id: true },
              take: 1,
            }
          : { select: { id: true }, take: 0 },
        // Any confirmed/pending booking on the same day
        bookings: eventDate
          ? {
              where: {
                eventDate: {
                  gte: new Date(new Date(eventDate).toISOString().split('T')[0] + 'T00:00:00.000Z'),
                  lt: new Date(new Date(eventDate).toISOString().split('T')[0] + 'T23:59:59.999Z'),
                },
                status: { in: ['CONFIRMED', 'PENDING'] },
              },
              select: { id: true },
              take: 1,
            }
          : { select: { id: true }, take: 0 },
      },
    });

    const scored = allWorkers.map((w) => {
      const hasAvailability = w.availability.length > 0;
      const hasNoConflict = w.bookings.length === 0;
      const hasRoleMatch = roleMatchIds.has(w.id);
      const { score, reasons } = computeMatchScore(w, {
        hasRoleMatch,
        hasAvailability,
        hasNoConflict,
      });

      return {
        id: w.id,
        firstName: w.firstName,
        lastName: w.lastName,
        email: w.email,
        staffTier: w.staffTier,
        staffAvailable: w.staffAvailable,
        staffRating: w.staffRating ? Number(w.staffRating) : null,
        staffReviewCount: w.staffReviewCount,
        staffBio: w.staffBio,
        staffAvatar: w.staffAvatar,
        postcode: w.applicant?.postcode ?? null,
        totalBookings: w.applicant?.totalBookings ?? 0,
        score,
        reasons,
        hasAvailability,
        hasNoConflict,
        hasRoleMatch,
        alreadyEngaged: engagedIds.has(w.id),
        inviteStatus: invitedIds.get(w.id) ?? null,
      };
    });

    const filtered = query.availableOnly
      ? scored.filter((w) => w.hasAvailability && w.hasNoConflict)
      : scored;

    filtered.sort((a, b) => b.score - a.score);

    const total = filtered.length;
    const skip = (query.page - 1) * query.limit;
    const page = filtered.slice(skip, skip + query.limit);

    const payload = {
      job: {
        id: job.id,
        title: job.title,
        role: job.role.name,
        eventDate: job.eventDate,
        staffNeeded: job.staffNeeded,
        staffConfirmed: job.staffConfirmed,
        spotsLeft: Math.max(0, job.staffNeeded - job.staffConfirmed),
      },
      workers: page,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };

    res.json({ ok: true, ...payload, data: payload });
  } catch (e) {
    next(e);
  }
});

// ============================================
// POST /api/v1/admin/matching/:jobId/invites
// Admin invites a worker to a job
// ============================================

const createInviteBody = z.object({
  userId: z.string().min(1),
  adminNote: z.string().max(500).optional(),
});

r.post('/:jobId/invites', async (req, res, next) => {
  try {
    const job = await prisma.job.findUnique({
      where: { id: req.params.jobId },
      select: {
        id: true,
        title: true,
        status: true,
        eventDate: true,
        location: true,
        shiftStart: true,
        shiftEnd: true,
        staffNeeded: true,
        staffConfirmed: true,
        role: { select: { name: true } },
      },
    });

    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (!['OPEN', 'PENDING'].includes(job.status)) {
      return res.status(400).json({ error: 'Can only invite to open or pending jobs' });
    }

    const parsed = createInviteBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', issues: parsed.error.issues });
    }

    const worker = await prisma.user.findUnique({
      where: { id: parsed.data.userId },
      select: { id: true, firstName: true, lastName: true, email: true, staffTier: true },
    });

    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    // Check for existing invite
    const existing = await prisma.jobInvite.findUnique({
      where: { jobId_userId: { jobId: job.id, userId: worker.id } },
    });
    if (existing) {
      return res.status(409).json({
        error: `Worker already has a ${existing.status.toLowerCase()} invite for this job`,
        inviteId: existing.id,
        status: existing.status,
      });
    }

    const invite = await prisma.jobInvite.create({
      data: {
        jobId: job.id,
        userId: worker.id,
        adminNote: parsed.data.adminNote ?? null,
        status: 'PENDING',
      },
    });

    // Send invite email (non-blocking)
    sendJobInviteEmail({
      to: worker.email,
      workerName: worker.firstName,
      jobTitle: job.title,
      roleName: job.role.name,
      eventDate: job.eventDate,
      location: job.location,
      shiftStart: job.shiftStart ?? undefined,
      shiftEnd: job.shiftEnd ?? undefined,
      adminNote: parsed.data.adminNote,
      inviteId: invite.id,
    }).catch((err) => {
      authLogger.warn({ err, inviteId: invite.id }, 'Failed to send job invite email');
    });

    const adminUsername = (req.session as any)?.username || 'admin';
    authLogger.info(
      { action: 'job_invite_created', admin: adminUsername, inviteId: invite.id, jobId: job.id, userId: worker.id },
      'Admin created job invite'
    );

    const payload = {
      id: invite.id,
      jobId: invite.jobId,
      userId: invite.userId,
      status: invite.status,
      worker: { id: worker.id, firstName: worker.firstName, lastName: worker.lastName, email: worker.email },
    };

    res.status(201).json({ ok: true, invite: payload, data: payload });
  } catch (e) {
    next(e);
  }
});

// ============================================
// GET /api/v1/admin/matching/:jobId/invites
// List all invites for a job
// ============================================

r.get('/:jobId/invites', async (req, res, next) => {
  try {
    const invites = await prisma.jobInvite.findMany({
      where: { jobId: req.params.jobId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            staffTier: true,
            staffRating: true,
            staffAvatar: true,
          },
        },
      },
    });

    const shaped = invites.map((i) => ({
      id: i.id,
      status: i.status,
      adminNote: i.adminNote,
      workerNote: i.workerNote,
      respondedAt: i.respondedAt,
      createdAt: i.createdAt,
      worker: {
        id: i.user.id,
        firstName: i.user.firstName,
        lastName: i.user.lastName,
        email: i.user.email,
        staffTier: i.user.staffTier,
        staffRating: i.user.staffRating ? Number(i.user.staffRating) : null,
        staffAvatar: i.user.staffAvatar,
      },
    }));

    res.json({ ok: true, invites: shaped, data: shaped });
  } catch (e) {
    next(e);
  }
});

// ============================================
// DELETE /api/v1/admin/matching/:jobId/invites/:inviteId
// Cancel / retract an invite
// ============================================

r.delete('/:jobId/invites/:inviteId', async (req, res, next) => {
  try {
    const invite = await prisma.jobInvite.findUnique({
      where: { id: req.params.inviteId },
      select: { id: true, jobId: true, status: true },
    });

    if (!invite || invite.jobId !== req.params.jobId) {
      return res.status(404).json({ error: 'Invite not found' });
    }
    if (invite.status === 'ACCEPTED') {
      return res.status(409).json({ error: 'Cannot cancel an accepted invite — withdraw the job application instead' });
    }

    await prisma.jobInvite.delete({ where: { id: invite.id } });

    const adminUsername = (req.session as any)?.username || 'admin';
    authLogger.info(
      { action: 'job_invite_cancelled', admin: adminUsername, inviteId: invite.id },
      'Admin cancelled job invite'
    );

    res.json({ ok: true, data: { id: invite.id } });
  } catch (e) {
    next(e);
  }
});

// ============================================
// GET /api/v1/admin/matching/:jobId/invites/summary
// Quick stats: pending/accepted/declined counts
// ============================================

r.get('/:jobId/invites/summary', async (req, res, next) => {
  try {
    const groups = await prisma.jobInvite.groupBy({
      by: ['status'],
      where: { jobId: req.params.jobId },
      _count: { status: true },
    });

    const summary: Record<string, number> = { PENDING: 0, ACCEPTED: 0, DECLINED: 0, EXPIRED: 0 };
    for (const g of groups) {
      summary[g.status] = g._count.status;
    }

    res.json({ ok: true, summary, data: summary });
  } catch (e) {
    next(e);
  }
});

export default r;
