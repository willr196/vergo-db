// Admin API for managing scheduled emails

import { Router } from 'express';
import { z } from 'zod';
import { cancelScheduledEmail } from '../services/email/scheduler';
import { emailQueue } from '../services/email/queue';
import { adminAuth } from '../middleware/adminAuth';
import { prisma } from '../prisma';

const router = Router();

// All routes require admin authentication
router.use(adminAuth);

const listScheduledEmailsQuerySchema = z.object({
  status: z.string().max(50).optional(),
  emailType: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const scheduledEmailParamsSchema = z.object({
  id: z.string().min(1).max(191),
});

/**
 * GET /api/v1/admin/scheduled-emails
 * List all scheduled emails with optional filters
 */
router.get('/', async (req, res) => {
  try {
    const { status, emailType, page, limit } = listScheduledEmailsQuerySchema.parse(req.query);

    const where: Record<string, any> = {};
    if (status && typeof status === 'string') where.status = status;
    if (emailType && typeof emailType === 'string') where.emailType = emailType;

    const [scheduled, total] = await Promise.all([
      prisma.scheduledEmail.findMany({
        where,
        orderBy: { scheduledFor: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.scheduledEmail.count({ where }),
    ]);

    res.json({
      data: scheduled,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[ADMIN] Failed to list scheduled emails:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/v1/admin/scheduled-emails/:id
 * Cancel a scheduled email
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = scheduledEmailParamsSchema.parse(req.params);
    const scheduled = await prisma.scheduledEmail.findUnique({
      where: { id },
    });

    if (!scheduled) {
      return res.status(404).json({ error: 'Scheduled email not found' });
    }

    if (scheduled.status !== 'SCHEDULED') {
      return res.status(400).json({ error: `Cannot cancel email with status: ${scheduled.status}` });
    }

    const cancelled = await cancelScheduledEmail(scheduled.jobId);
    if (!cancelled) {
      return res.status(500).json({ error: 'Failed to cancel scheduled email' });
    }

    res.json({ success: true, message: 'Scheduled email cancelled' });
  } catch (error) {
    console.error('[ADMIN] Failed to cancel scheduled email:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/v1/admin/scheduled-emails/stats
 * Get email queue stats
 */
router.get('/stats', async (_req, res) => {
  try {
    const [queueStats, dbStats] = await Promise.all([
      emailQueue.getStats(),
      prisma.scheduledEmail.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
    ]);

    const scheduledCounts: Record<string, number> = {};
    for (const stat of dbStats) {
      scheduledCounts[stat.status] = stat._count.id;
    }

    res.json({
      queue: queueStats || { available: false },
      scheduled: scheduledCounts,
    });
  } catch (error) {
    console.error('[ADMIN] Failed to get stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
