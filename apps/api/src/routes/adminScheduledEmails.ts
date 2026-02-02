// Admin API for managing scheduled emails

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { cancelScheduledEmail } from '../services/email/scheduler';
import { emailQueue } from '../services/email/queue';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/v1/admin/scheduled-emails
 * List all scheduled emails with optional filters
 */
router.get('/', async (req, res) => {
  try {
    const { status, emailType, page = '1', limit = '20' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));

    const where: Record<string, any> = {};
    if (status && typeof status === 'string') where.status = status;
    if (emailType && typeof emailType === 'string') where.emailType = emailType;

    const [scheduled, total] = await Promise.all([
      prisma.scheduledEmail.findMany({
        where,
        orderBy: { scheduledFor: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.scheduledEmail.count({ where }),
    ]);

    res.json({
      data: scheduled,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
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
    const scheduled = await prisma.scheduledEmail.findUnique({
      where: { id: req.params.id },
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
