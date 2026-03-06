import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireClientJwt } from '../middleware/jwtAuth';

const r = Router();
r.use(requireClientJwt);

const TIME_24H_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

const listStaffQuerySchema = z.object({
  staffTier: z.enum(['STANDARD', 'ELITE']).optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const listBookingsQuerySchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const createBookingSchema = z.object({
  staffId: z.string().min(1),
  quoteRequestId: z.string().min(1).optional(),
  eventName: z.string().max(200).optional(),
  eventDate: z.string().min(1),
  eventEndDate: z.string().optional(),
  location: z.string().min(2).max(200).trim(),
  venue: z.string().max(200).optional(),
  shiftStart: z.string().regex(TIME_24H_REGEX, 'shiftStart must be HH:mm'),
  shiftEnd: z.string().regex(TIME_24H_REGEX, 'shiftEnd must be HH:mm'),
  hoursEstimated: z.number().positive().max(24).optional(),
  clientNotes: z.string().max(2000).optional(),
});

const cancelBookingSchema = z.object({
  reason: z.string().max(500).optional(),
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

function computeHoursFromShift(shiftStart: string, shiftEnd: string): number {
  const start = shiftStart.match(TIME_24H_REGEX);
  const end = shiftEnd.match(TIME_24H_REGEX);
  if (!start || !end) {
    throw new Error('Shift times must use HH:mm format');
  }

  const startMinutes = Number(start[1]) * 60 + Number(start[2]);
  const endMinutes = Number(end[1]) * 60 + Number(end[2]);
  let diff = endMinutes - startMinutes;
  if (diff <= 0) diff += 24 * 60;

  return Number((diff / 60).toFixed(2));
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
        }
      : undefined,
    staff: booking.staff
      ? {
          id: booking.staff.id,
          firstName: booking.staff.firstName,
          lastName: booking.staff.lastName,
          staffTier: booking.staff.staffTier,
          staffAvatar: booking.staff.staffAvatar,
          staffRating: toNumber(booking.staff.staffRating),
          staffReviewCount: booking.staff.staffReviewCount,
          staffHighlights: booking.staff.staffHighlights,
        }
      : undefined,
    quoteRequest: booking.quoteRequest
      ? {
          id: booking.quoteRequest.id,
          eventType: booking.quoteRequest.eventType,
          eventDate: booking.quoteRequest.eventDate?.toISOString() || null,
        }
      : null,
  };
}

async function getClientSubscription(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      status: true,
      subscriptionTier: true,
      subscriptionStatus: true,
      subscriptionStartedAt: true,
      subscriptionExpiresAt: true,
    },
  });

  if (!client) return null;
  if (client.status !== 'APPROVED') return { error: 'Client account is not approved', code: 403 };
  return client;
}

// GET /api/v1/client/mobile/marketplace/pricing
r.get('/marketplace/pricing', async (req, res, next) => {
  try {
    const client = await getClientSubscription(req.auth!.userId);
    if (!client) return res.status(404).json({ ok: false, error: 'Client not found' });
    if ('error' in client) return res.status(client.code).json({ ok: false, error: client.error });

    const [rates, plan] = await Promise.all([
      prisma.pricingTier.findMany({
        where: { clientTier: client.subscriptionTier },
        orderBy: { staffTier: 'asc' },
      }),
      prisma.subscriptionPlan.findUnique({
        where: { tier: client.subscriptionTier },
        select: {
          tier: true,
          name: true,
          weeklyPrice: true,
          monthlyPrice: true,
          annualPrice: true,
          features: true,
          isActive: true,
        },
      }),
    ]);

    const payload = {
      clientTier: client.subscriptionTier,
      subscriptionStatus: client.subscriptionStatus,
      subscriptionStartedAt: client.subscriptionStartedAt?.toISOString() || null,
      subscriptionExpiresAt: client.subscriptionExpiresAt?.toISOString() || null,
      plan: plan
        ? {
            tier: plan.tier,
            name: plan.name,
            weeklyPrice: toNumber(plan.weeklyPrice),
            monthlyPrice: toNumber(plan.monthlyPrice),
            annualPrice: toNumber(plan.annualPrice),
            features: plan.features,
            isActive: plan.isActive,
          }
        : null,
      rates: rates.map((row) => ({
        staffTier: row.staffTier,
        hourlyRate: toNumber(row.hourlyRate),
        staffPayRate: toNumber(row.staffPayRate),
        isBookable: row.isBookable,
      })),
    };

    res.json({ ok: true, data: payload });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/client/mobile/marketplace/staff
r.get('/marketplace/staff', async (req, res, next) => {
  try {
    const query = listStaffQuerySchema.parse(req.query);
    const skip = (query.page - 1) * query.limit;

    const client = await getClientSubscription(req.auth!.userId);
    if (!client) return res.status(404).json({ ok: false, error: 'Client not found' });
    if ('error' in client) return res.status(client.code).json({ ok: false, error: client.error });

    const where: any = {
      userType: 'JOB_SEEKER',
      staffAvailable: true,
      staffTier: { not: null },
    };

    if (query.staffTier) where.staffTier = query.staffTier;
    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { staffBio: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [staff, total, pricingRows] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: [
          { staffReviewCount: 'desc' },
          { createdAt: 'desc' },
        ],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          staffTier: true,
          staffBio: true,
          staffAvatar: true,
          staffAvailable: true,
          staffRating: true,
          staffReviewCount: true,
          staffHighlights: true,
        },
      }),
      prisma.user.count({ where }),
      prisma.pricingTier.findMany({
        where: { clientTier: client.subscriptionTier },
        select: { staffTier: true, hourlyRate: true, staffPayRate: true, isBookable: true },
      }),
    ]);

    const pricingByTier = new Map(
      pricingRows.map((row) => [
        row.staffTier,
        {
          hourlyRate: toNumber(row.hourlyRate),
          staffPayRate: toNumber(row.staffPayRate),
          isBookable: row.isBookable,
        },
      ])
    );

    const shaped = staff.map((member) => {
      const pricing = member.staffTier ? pricingByTier.get(member.staffTier) : null;
      return {
        id: member.id,
        firstName: member.firstName,
        lastName: member.lastName,
        fullName: `${member.firstName} ${member.lastName}`,
        staffTier: member.staffTier,
        staffBio: member.staffBio,
        staffAvatar: member.staffAvatar,
        staffAvailable: member.staffAvailable,
        staffRating: toNumber(member.staffRating),
        staffReviewCount: member.staffReviewCount,
        staffHighlights: member.staffHighlights,
        hourlyRate: pricing?.hourlyRate ?? null,
        staffPayRate: pricing?.staffPayRate ?? null,
        isBookable: pricing?.isBookable ?? false,
      };
    });

    const payload = {
      staff: shaped,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
        hasMore: query.page * query.limit < total,
      },
      clientTier: client.subscriptionTier,
    };

    res.json({ ok: true, ...payload, data: payload });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/client/mobile/marketplace/staff/:id
r.get('/marketplace/staff/:id', async (req, res, next) => {
  try {
    const client = await getClientSubscription(req.auth!.userId);
    if (!client) return res.status(404).json({ ok: false, error: 'Client not found' });
    if ('error' in client) return res.status(client.code).json({ ok: false, error: client.error });

    const staff = await prisma.user.findFirst({
      where: {
        id: req.params.id,
        userType: 'JOB_SEEKER',
        staffAvailable: true,
        staffTier: { not: null },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        staffTier: true,
        staffBio: true,
        staffAvatar: true,
        staffAvailable: true,
        staffRating: true,
        staffReviewCount: true,
        staffHighlights: true,
      },
    });

    if (!staff || !staff.staffTier) {
      return res.status(404).json({ ok: false, error: 'Staff member not found' });
    }

    const pricing = await prisma.pricingTier.findUnique({
      where: {
        clientTier_staffTier: {
          clientTier: client.subscriptionTier,
          staffTier: staff.staffTier,
        },
      },
      select: {
        hourlyRate: true,
        staffPayRate: true,
        isBookable: true,
      },
    });

    const payload = {
      staff: {
        id: staff.id,
        firstName: staff.firstName,
        lastName: staff.lastName,
        fullName: `${staff.firstName} ${staff.lastName}`,
        staffTier: staff.staffTier,
        staffBio: staff.staffBio,
        staffAvatar: staff.staffAvatar,
        staffAvailable: staff.staffAvailable,
        staffRating: toNumber(staff.staffRating),
        staffReviewCount: staff.staffReviewCount,
        staffHighlights: staff.staffHighlights,
        hourlyRate: pricing ? toNumber(pricing.hourlyRate) : null,
        staffPayRate: pricing ? toNumber(pricing.staffPayRate) : null,
        isBookable: pricing ? pricing.isBookable : false,
      },
      clientTier: client.subscriptionTier,
    };

    res.json({ ok: true, ...payload, data: payload });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/client/mobile/bookings
r.post('/bookings', async (req, res, next) => {
  try {
    const parsed = createBookingSchema.parse(req.body);
    const client = await getClientSubscription(req.auth!.userId);
    if (!client) return res.status(404).json({ ok: false, error: 'Client not found' });
    if ('error' in client) return res.status(client.code).json({ ok: false, error: client.error });

    if (client.subscriptionStatus !== 'ACTIVE') {
      return res.status(403).json({
        ok: false,
        error: 'An active subscription is required to create bookings',
        code: 'SUBSCRIPTION_NOT_ACTIVE',
      });
    }

    const eventDate = parseDateString(parsed.eventDate, 'eventDate');
    const eventEndDate = parsed.eventEndDate ? parseDateString(parsed.eventEndDate, 'eventEndDate') : null;
    if (eventEndDate && eventEndDate < eventDate) {
      return res.status(400).json({ ok: false, error: 'eventEndDate cannot be before eventDate' });
    }

    const staff = await prisma.user.findFirst({
      where: {
        id: parsed.staffId,
        userType: 'JOB_SEEKER',
        staffTier: { not: null },
      },
      select: {
        id: true,
        staffTier: true,
        staffAvailable: true,
      },
    });

    if (!staff || !staff.staffTier) {
      return res.status(404).json({ ok: false, error: 'Staff member not found' });
    }

    if (!staff.staffAvailable) {
      return res.status(400).json({ ok: false, error: 'Staff member is not currently available' });
    }

    if (parsed.quoteRequestId) {
      const quote = await prisma.quoteRequest.findFirst({
        where: { id: parsed.quoteRequestId, clientId: client.id },
        select: { id: true },
      });
      if (!quote) {
        return res.status(404).json({ ok: false, error: 'Linked quote request not found' });
      }
    }

    const pricing = await prisma.pricingTier.findUnique({
      where: {
        clientTier_staffTier: {
          clientTier: client.subscriptionTier,
          staffTier: staff.staffTier,
        },
      },
      select: {
        hourlyRate: true,
        staffPayRate: true,
        isBookable: true,
      },
    });

    if (!pricing) {
      return res.status(400).json({
        ok: false,
        error: `No pricing configured for ${client.subscriptionTier} x ${staff.staffTier}`,
      });
    }

    if (!pricing.isBookable) {
      return res.status(403).json({
        ok: false,
        error: 'Upgrade to Premium to book this staff tier',
        code: 'UPGRADE_REQUIRED',
      });
    }

    const computedHours = parsed.hoursEstimated ?? computeHoursFromShift(parsed.shiftStart, parsed.shiftEnd);
    const hoursEstimated = new Prisma.Decimal(computedHours.toFixed(2));
    const totalEstimated = new Prisma.Decimal((Number(pricing.hourlyRate) * computedHours).toFixed(2));

    const booking = await prisma.booking.create({
      data: {
        eventName: parsed.eventName || null,
        eventDate,
        eventEndDate,
        location: parsed.location,
        venue: parsed.venue || null,
        shiftStart: parsed.shiftStart,
        shiftEnd: parsed.shiftEnd,
        hoursEstimated,
        clientTierAtBooking: client.subscriptionTier,
        staffTierAtBooking: staff.staffTier,
        hourlyRateCharged: pricing.hourlyRate,
        staffPayRate: pricing.staffPayRate,
        totalEstimated,
        clientNotes: parsed.clientNotes || null,
        clientId: client.id,
        staffId: staff.id,
        quoteRequestId: parsed.quoteRequestId || null,
      },
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
            contactName: true,
            email: true,
            subscriptionTier: true,
          },
        },
        staff: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            staffTier: true,
            staffAvatar: true,
            staffRating: true,
            staffReviewCount: true,
            staffHighlights: true,
          },
        },
        quoteRequest: {
          select: {
            id: true,
            eventType: true,
            eventDate: true,
          },
        },
      },
    });

    const payload = shapeBooking(booking);
    res.status(201).json({ ok: true, booking: payload, data: payload });
  } catch (error) {
    if (error instanceof Error && error.message.includes('must be a valid date')) {
      return res.status(400).json({ ok: false, error: error.message });
    }
    next(error);
  }
});

// GET /api/v1/client/mobile/bookings
r.get('/bookings', async (req, res, next) => {
  try {
    const query = listBookingsQuerySchema.parse(req.query);
    const skip = (query.page - 1) * query.limit;

    const where: any = { clientId: req.auth!.userId };
    if (query.status) where.status = query.status;
    if (query.dateFrom || query.dateTo) {
      where.eventDate = {};
      if (query.dateFrom) where.eventDate.gte = parseDateString(query.dateFrom, 'dateFrom');
      if (query.dateTo) where.eventDate.lte = parseDateString(query.dateTo, 'dateTo');
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        orderBy: [{ eventDate: 'asc' }, { createdAt: 'desc' }],
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
            },
          },
          staff: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              staffTier: true,
              staffAvatar: true,
              staffRating: true,
              staffReviewCount: true,
              staffHighlights: true,
            },
          },
          quoteRequest: {
            select: {
              id: true,
              eventType: true,
              eventDate: true,
            },
          },
        },
      }),
      prisma.booking.count({ where }),
    ]);

    const shaped = bookings.map(shapeBooking);
    const payload = {
      bookings: shaped,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
        hasMore: query.page * query.limit < total,
      },
    };

    res.json({ ok: true, ...payload, data: payload });
  } catch (error) {
    if (error instanceof Error && error.message.includes('must be a valid date')) {
      return res.status(400).json({ ok: false, error: error.message });
    }
    next(error);
  }
});

// GET /api/v1/client/mobile/bookings/:id
r.get('/bookings/:id', async (req, res, next) => {
  try {
    const booking = await prisma.booking.findFirst({
      where: {
        id: req.params.id,
        clientId: req.auth!.userId,
      },
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
            contactName: true,
            email: true,
            subscriptionTier: true,
          },
        },
        staff: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            staffTier: true,
            staffAvatar: true,
            staffRating: true,
            staffReviewCount: true,
            staffHighlights: true,
          },
        },
        quoteRequest: {
          select: {
            id: true,
            eventType: true,
            eventDate: true,
          },
        },
      },
    });

    if (!booking) {
      return res.status(404).json({ ok: false, error: 'Booking not found' });
    }

    const payload = shapeBooking(booking);
    res.json({ ok: true, booking: payload, data: payload });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/client/mobile/bookings/:id/cancel
r.post('/bookings/:id/cancel', async (req, res, next) => {
  try {
    const parsed = cancelBookingSchema.parse(req.body ?? {});

    const existing = await prisma.booking.findFirst({
      where: {
        id: req.params.id,
        clientId: req.auth!.userId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!existing) {
      return res.status(404).json({ ok: false, error: 'Booking not found' });
    }

    if (existing.status === 'CANCELLED') {
      return res.status(400).json({ ok: false, error: 'Booking is already cancelled' });
    }
    if (existing.status === 'COMPLETED') {
      return res.status(400).json({ ok: false, error: 'Completed bookings cannot be cancelled' });
    }

    const booking = await prisma.booking.update({
      where: { id: existing.id },
      data: {
        status: 'CANCELLED',
        rejectionReason:
          parsed.reason ||
          (existing.status === 'PENDING'
            ? 'Cancelled by client'
            : 'Cancelled by client after confirmation'),
      },
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
            contactName: true,
            email: true,
            subscriptionTier: true,
          },
        },
        staff: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            staffTier: true,
            staffAvatar: true,
            staffRating: true,
            staffReviewCount: true,
            staffHighlights: true,
          },
        },
        quoteRequest: {
          select: {
            id: true,
            eventType: true,
            eventDate: true,
          },
        },
      },
    });

    const payload = shapeBooking(booking);
    res.json({ ok: true, booking: payload, data: payload });
  } catch (error) {
    next(error);
  }
});

export default r;
