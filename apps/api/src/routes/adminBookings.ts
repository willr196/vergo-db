import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma';
import { adminAuth } from '../middleware/adminAuth';

const r = Router();
r.use(adminAuth);

const listBookingsQuerySchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']).optional(),
  clientId: z.string().optional(),
  staffId: z.string().optional(),
  search: z.string().max(100).optional(),
  eventDateFrom: z.string().optional(),
  eventDateTo: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const updateBookingStatusSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']),
  adminNotes: z.string().max(2000).optional(),
  rejectionReason: z.string().max(500).optional(),
});

const updateNotesSchema = z.object({
  adminNotes: z.string().max(2000),
});

const confirmSchema = z.object({
  adminNotes: z.string().max(2000).optional(),
});

const rejectSchema = z.object({
  rejectionReason: z.string().min(1).max(500),
  adminNotes: z.string().max(2000).optional(),
});

const completeSchema = z.object({
  hoursActual: z.number().positive().max(24).optional(),
  adminNotes: z.string().max(2000).optional(),
});

function toNumber(value: Prisma.Decimal | null | undefined): number | null {
  if (value == null) return null;
  return Number(value);
}

function parseDateString(value: string, fieldName: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} must be a valid date`);
  }
  return parsed;
}

function shapeBooking(booking: any) {
  return {
    id: booking.id,
    status: booking.status,
    eventName: booking.eventName,
    eventDate: booking.eventDate?.toISOString() || null,
    eventEndDate: booking.eventEndDate?.toISOString() || null,
    location: booking.location,
    venue: booking.venue,
    shiftStart: booking.shiftStart,
    shiftEnd: booking.shiftEnd,
    hoursEstimated: toNumber(booking.hoursEstimated),
    clientTierAtBooking: booking.clientTierAtBooking,
    staffTierAtBooking: booking.staffTierAtBooking,
    hourlyRateCharged: toNumber(booking.hourlyRateCharged),
    staffPayRate: toNumber(booking.staffPayRate),
    totalEstimated: toNumber(booking.totalEstimated),
    clientNotes: booking.clientNotes,
    adminNotes: booking.adminNotes,
    rejectionReason: booking.rejectionReason,
    confirmedAt: booking.confirmedAt?.toISOString() || null,
    confirmedBy: booking.confirmedBy,
    completedAt: booking.completedAt?.toISOString() || null,
    quoteRequestId: booking.quoteRequestId || null,
    createdAt: booking.createdAt?.toISOString() || null,
    updatedAt: booking.updatedAt?.toISOString() || null,
    client: booking.client
      ? {
          id: booking.client.id,
          companyName: booking.client.companyName,
          contactName: booking.client.contactName,
          email: booking.client.email,
          subscriptionTier: booking.client.subscriptionTier,
          subscriptionStatus: booking.client.subscriptionStatus,
        }
      : undefined,
    staff: booking.staff
      ? {
          id: booking.staff.id,
          firstName: booking.staff.firstName,
          lastName: booking.staff.lastName,
          email: booking.staff.email,
          staffTier: booking.staff.staffTier,
          staffAvailable: booking.staff.staffAvailable,
          staffRating: toNumber(booking.staff.staffRating),
          staffReviewCount: booking.staff.staffReviewCount,
          staffBio: booking.staff.staffBio,
          staffHighlights: booking.staff.staffHighlights,
        }
      : undefined,
    quoteRequest: booking.quoteRequest
      ? {
          id: booking.quoteRequest.id,
          eventType: booking.quoteRequest.eventType,
          eventDate: booking.quoteRequest.eventDate?.toISOString() || null,
          status: booking.quoteRequest.status,
        }
      : null,
  };
}

function bookingPriorityRank(booking: ReturnType<typeof shapeBooking>) {
  if (booking.status === 'PENDING' && booking.clientTierAtBooking === 'PREMIUM') return 0;
  if (booking.status === 'PENDING') return 1;
  return 2;
}

// GET /api/v1/admin/bookings/stats
r.get('/stats', async (_req, res, next) => {
  try {
    const [counts, totals] = await Promise.all([
      prisma.booking.groupBy({ by: ['status'], _count: { id: true } }),
      prisma.booking.aggregate({
        _sum: {
          totalEstimated: true,
        },
      }),
    ]);

    const countByStatus: Record<string, number> = {};
    for (const row of counts) countByStatus[row.status] = row._count.id;

    const payload = {
      total: Object.values(countByStatus).reduce((acc, value) => acc + value, 0),
      pending: countByStatus.PENDING || 0,
      confirmed: countByStatus.CONFIRMED || 0,
      rejected: countByStatus.REJECTED || 0,
      cancelled: countByStatus.CANCELLED || 0,
      completed: countByStatus.COMPLETED || 0,
      noShow: countByStatus.NO_SHOW || 0,
      totalEstimatedValue: Number(totals._sum.totalEstimated || 0),
    };

    res.json({ ok: true, data: payload });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/admin/bookings
r.get('/', async (req, res, next) => {
  try {
    const query = listBookingsQuerySchema.parse(req.query);
    const skip = (query.page - 1) * query.limit;

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.clientId) where.clientId = query.clientId;
    if (query.staffId) where.staffId = query.staffId;

    if (query.eventDateFrom || query.eventDateTo) {
      where.eventDate = {};
      if (query.eventDateFrom) where.eventDate.gte = parseDateString(query.eventDateFrom, 'eventDateFrom');
      if (query.eventDateTo) where.eventDate.lte = parseDateString(query.eventDateTo, 'eventDateTo');
    }

    if (query.search) {
      where.OR = [
        { eventName: { contains: query.search, mode: 'insensitive' } },
        { location: { contains: query.search, mode: 'insensitive' } },
        { venue: { contains: query.search, mode: 'insensitive' } },
        { client: { companyName: { contains: query.search, mode: 'insensitive' } } },
        { client: { contactName: { contains: query.search, mode: 'insensitive' } } },
        { staff: { firstName: { contains: query.search, mode: 'insensitive' } } },
        { staff: { lastName: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [bookings, total, pendingCount] = await Promise.all([
      prisma.booking.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take: query.limit,
        include: {
          client: {
            select: {
              id: true,
              companyName: true,
              contactName: true,
              email: true,
              subscriptionTier: true,
              subscriptionStatus: true,
            },
          },
          staff: {
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
              staffHighlights: true,
            },
          },
          quoteRequest: {
            select: {
              id: true,
              eventType: true,
              eventDate: true,
              status: true,
            },
          },
        },
      }),
      prisma.booking.count({ where }),
      prisma.booking.count({ where: { status: 'PENDING' } }),
    ]);

    const shaped = bookings
      .map(shapeBooking)
      .sort((a, b) => {
        const rankDiff = bookingPriorityRank(a) - bookingPriorityRank(b);
        if (rankDiff !== 0) return rankDiff;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
    const payload = {
      bookings: shaped,
      pendingCount,
      pagination: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
        pages: Math.ceil(total / query.limit),
      },
    };

    res.json({ ok: true, data: payload });
  } catch (error) {
    if (error instanceof Error && error.message.includes('must be a valid date')) {
      return res.status(400).json({ ok: false, error: error.message });
    }
    next(error);
  }
});

// GET /api/v1/admin/bookings/:id
r.get('/:id', async (req, res, next) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
            contactName: true,
            email: true,
            subscriptionTier: true,
            subscriptionStatus: true,
          },
        },
        staff: {
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
            staffHighlights: true,
          },
        },
        quoteRequest: {
          select: {
            id: true,
            eventType: true,
            eventDate: true,
            status: true,
          },
        },
      },
    });

    if (!booking) {
      return res.status(404).json({ ok: false, error: 'Booking not found' });
    }

    const payload = shapeBooking(booking);
    res.json({ ok: true, data: payload });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/v1/admin/bookings/:id/status
r.patch('/:id/status', async (req, res, next) => {
  try {
    const { status, adminNotes, rejectionReason } = updateBookingStatusSchema.parse(req.body);

    if (status === 'REJECTED' && !rejectionReason) {
      return res.status(400).json({ ok: false, error: 'rejectionReason is required when status is REJECTED' });
    }

    const existing = await prisma.booking.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        status: true,
      },
    });

    if (!existing) {
      return res.status(404).json({ ok: false, error: 'Booking not found' });
    }

    const updateData: any = {
      status,
    };

    if (typeof adminNotes === 'string') updateData.adminNotes = adminNotes;

    if (status === 'CONFIRMED') {
      updateData.confirmedAt = new Date();
      updateData.confirmedBy = req.session.username || 'admin';
    }

    if (status === 'REJECTED') {
      updateData.rejectionReason = rejectionReason;
    } else if (typeof rejectionReason === 'string') {
      updateData.rejectionReason = rejectionReason;
    }

    if (status === 'COMPLETED') {
      updateData.completedAt = new Date();
    }

    const booking = await prisma.booking.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
            contactName: true,
            email: true,
            subscriptionTier: true,
            subscriptionStatus: true,
          },
        },
        staff: {
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
            staffHighlights: true,
          },
        },
        quoteRequest: {
          select: {
            id: true,
            eventType: true,
            eventDate: true,
            status: true,
          },
        },
      },
    });

    console.log(
      `[AUDIT] Booking status changed | bookingId=${booking.id} from=${existing.status} to=${status} admin=${req.session.username || 'admin'}`
    );

    res.json({ ok: true, data: shapeBooking(booking) });
  } catch (error) {
    next(error);
  }
});

// PUT /api/v1/admin/bookings/:id/notes
r.put('/:id/notes', async (req, res, next) => {
  try {
    const { adminNotes } = updateNotesSchema.parse(req.body);

    const booking = await prisma.booking.update({
      where: { id: req.params.id },
      data: { adminNotes },
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
            contactName: true,
            email: true,
            subscriptionTier: true,
            subscriptionStatus: true,
          },
        },
        staff: {
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
            staffHighlights: true,
          },
        },
        quoteRequest: {
          select: {
            id: true,
            eventType: true,
            eventDate: true,
            status: true,
          },
        },
      },
    });

    res.json({ ok: true, data: shapeBooking(booking) });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return res.status(404).json({ ok: false, error: 'Booking not found' });
    }
    next(error);
  }
});

// POST /api/v1/admin/bookings/:id/confirm
r.post('/:id/confirm', async (req, res, next) => {
  try {
    const data = confirmSchema.parse(req.body);

    const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!booking) return res.status(404).json({ ok: false, error: 'Booking not found' });
    if (booking.status !== 'PENDING') {
      return res.status(400).json({ ok: false, error: 'Only pending bookings can be confirmed' });
    }

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        confirmedBy: req.session.username,
        adminNotes: data.adminNotes || booking.adminNotes,
      },
    });

    console.log(`[BOOKING] Confirmed: ${booking.id} by ${req.session.username}`);
    res.json({ ok: true, data: { id: updated.id, status: updated.status } });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/admin/bookings/:id/reject
r.post('/:id/reject', async (req, res, next) => {
  try {
    const data = rejectSchema.parse(req.body);

    const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!booking) return res.status(404).json({ ok: false, error: 'Booking not found' });
    if (booking.status !== 'PENDING') {
      return res.status(400).json({ ok: false, error: 'Only pending bookings can be rejected' });
    }

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: 'REJECTED',
        rejectionReason: data.rejectionReason,
        adminNotes: data.adminNotes || booking.adminNotes,
      },
    });

    console.log(`[BOOKING] Rejected: ${booking.id} by ${req.session.username} | Reason: ${data.rejectionReason}`);
    res.json({ ok: true, data: { id: updated.id, status: updated.status } });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/admin/bookings/:id/complete
r.post('/:id/complete', async (req, res, next) => {
  try {
    const data = completeSchema.parse(req.body);

    const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!booking) return res.status(404).json({ ok: false, error: 'Booking not found' });
    if (booking.status !== 'CONFIRMED') {
      return res.status(400).json({ ok: false, error: 'Only confirmed bookings can be completed' });
    }

    const finalHours = data.hoursActual ?? (booking.hoursEstimated ? Number(booking.hoursEstimated) : null);
    const finalTotal =
      finalHours != null
        ? new Prisma.Decimal((Number(booking.hourlyRateCharged) * finalHours).toFixed(2))
        : booking.totalEstimated;

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        hoursEstimated: finalHours != null ? new Prisma.Decimal(finalHours) : booking.hoursEstimated,
        totalEstimated: finalTotal,
        adminNotes: data.adminNotes || booking.adminNotes,
      },
    });

    console.log(`[BOOKING] Completed: ${booking.id} | Hours: ${finalHours} | Total: £${finalTotal}`);
    res.json({ ok: true, data: { id: updated.id, status: updated.status } });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/admin/bookings/:id/no-show
r.post('/:id/no-show', async (req, res, next) => {
  try {
    const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!booking) return res.status(404).json({ ok: false, error: 'Booking not found' });
    if (booking.status !== 'CONFIRMED') {
      return res.status(400).json({ ok: false, error: 'Only confirmed bookings can be marked as no-show' });
    }

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'NO_SHOW' },
    });

    console.log(`[BOOKING] No-show: ${booking.id}`);
    res.json({ ok: true, data: { id: updated.id, status: updated.status } });
  } catch (error) {
    next(error);
  }
});

export default r;
