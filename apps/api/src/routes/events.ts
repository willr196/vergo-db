import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { adminAuth } from '../middleware/adminAuth';

const r = Router();

type AdminEventStatus = 'UPCOMING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';

function toAdminEventStatus(status: string | null | undefined): AdminEventStatus {
  const s = (status ?? '').toUpperCase();
  if (s === 'COMPLETED') return 'COMPLETED';
  if (s === 'ACCEPTED' || s === 'CONFIRMED') return 'CONFIRMED';
  if (s === 'DECLINED' || s === 'CANCELLED') return 'CANCELLED';
  return 'UPCOMING';
}

// ============================================
// GET /api/v1/events - List events (ADMIN)
// ============================================
// The admin dashboard's Events tab expects an array payload.
// We currently project "events" from QuoteRequest rows.
r.get('/', adminAuth, async (_req, res) => {
  try {
    const quotes = await prisma.quoteRequest.findMany({
      orderBy: [{ eventDate: 'asc' }, { createdAt: 'desc' }],
      take: 200,
      select: {
        id: true,
        eventType: true,
        eventDate: true,
        status: true,
        client: { select: { companyName: true } },
      },
    });

    const events = quotes.map((q) => ({
      id: q.id,
      eventName: q.eventType,
      eventDate: q.eventDate,
      clientName: q.client.companyName,
      status: toAdminEventStatus(q.status),
    }));

    return res.json(events);
  } catch (err) {
    // Keep admin UI usable even if quote/event data isn't configured yet.
    console.error('[EVENTS] Failed to list events:', err);
    return res.json([]);
  }
});

const updateStatusBody = z.object({
  status: z.enum(['UPCOMING', 'CONFIRMED', 'COMPLETED', 'CANCELLED']),
});

// ============================================
// PATCH /api/v1/events/:id/status - Update status (ADMIN)
// ============================================
r.patch('/:id/status', adminAuth, async (req, res) => {
  try {
    const { status } = updateStatusBody.parse(req.body);

    // Map admin UI statuses to QuoteRequest statuses used elsewhere (mobile client endpoints, etc).
    const quoteStatus =
      status === 'CONFIRMED' ? 'ACCEPTED' :
      status === 'COMPLETED' ? 'COMPLETED' :
      status === 'CANCELLED' ? 'DECLINED' :
      'NEW';

    await prisma.quoteRequest.update({
      where: { id: req.params.id },
      data: { status: quoteStatus },
    });

    return res.json({ ok: true });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      return res.status(404).json({ error: 'Not found' });
    }
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: err.issues });
    }
    console.error('[EVENTS] Failed to update event status:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default r;

