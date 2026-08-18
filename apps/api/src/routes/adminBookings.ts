import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma';
import { adminAuth } from '../middleware/adminAuth';
import { sendBookingReviewRequestEmail } from '../services/email';
import { bookingMoney, floatPosition, shiftHours } from '../lib/money';
import { PRICING, getPublicRateCard } from '../config/pricing';

const r = Router();
r.use(adminAuth);

const STAFF_PAY_DUE_DAYS = 14;

const staffSelectForMoney = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  staffTier: true,
  staffAvailable: true,
  staffRating: true,
  staffReviewCount: true,
  staffBio: true,
  staffHighlights: true,
  niLiable: true,
  pensionEnrolled: true,
} as const;

const clientSelectForMoney = {
  id: true,
  companyName: true,
  contactName: true,
  email: true,
  subscriptionTier: true,
  subscriptionStatus: true,
} as const;

const listBookingsQuerySchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']).optional(),
  bookingLane: z.enum(['FLEX', 'SELECT', 'MANAGED']).optional(),
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

function toPence(value: Prisma.Decimal | number | null | undefined): number {
  if (value == null) return 0;
  return Math.round(Number(value) * 100);
}

/**
 * PENDING/CONFIRMED map to "provisional" (hoursEstimated is the scheduled
 * figure); COMPLETED is when hoursEstimated has been overwritten with what
 * was actually worked (see POST /:id/complete) and so is final.
 */
function shapeBookingMoney(booking: {
  status: string;
  hoursEstimated: Prisma.Decimal | null;
  hourlyRateCharged: Prisma.Decimal;
  staffPayRate: Prisma.Decimal | null;
  staff: { niLiable: boolean; pensionEnrolled: boolean };
}) {
  return bookingMoney({
    hours: booking.hoursEstimated != null ? Number(booking.hoursEstimated) : 0,
    hourlyRateChargedPence: toPence(booking.hourlyRateCharged),
    staffPayRatePence: booking.staffPayRate != null ? toPence(booking.staffPayRate) : null,
    niLiable: booking.staff.niLiable,
    pensionEnrolled: booking.staff.pensionEnrolled,
    provisional: booking.status !== 'COMPLETED',
  });
}

/**
 * Legal status transitions for the booking lifecycle. Invoicing and payment
 * (invoicedAt/clientPaidAt/staffPaidAt) sit outside this map — they're
 * orthogonal timestamps gated on status === COMPLETED, not further status
 * values, so nothing that already switches on BookingStatus had to change.
 */
export const STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'REJECTED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'NO_SHOW', 'CANCELLED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

function assertValidTransition(from: string, to: string) {
  if (from === to) return;
  const allowed = STATUS_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    const allowedText = allowed.length > 0 ? allowed.join(', ') : 'nothing — this is a terminal status';
    throw Object.assign(
      new Error(`Cannot move a booking from ${from} to ${to}. Allowed: ${allowedText}.`),
      { statusCode: 409 }
    );
  }
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
    bookingLane: booking.bookingLane,
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
          phone: booking.staff.phone ?? null,
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

export interface QueueBookingInput {
  id: string;
  status: string;
  eventDate: Date;
  invoicedAt: Date | null;
  clientPaidAt: Date | null;
  staffPaidAt: Date | null;
}

export interface NeedsStaffItem {
  quoteRequestId: string;
  eventType: string;
  eventDate: Date | null;
  staffed: number;
  staffCount: number;
}

export interface QueueSection<T> {
  key: string;
  label: string;
  items: T[];
}

/**
 * Ordered by what breaks first if ignored: needs staff, staff not confirmed,
 * log hours, send invoice, chase payment, run payroll. Empty sections are
 * omitted so the dashboard doesn't show a wall of "nothing here" headers.
 * Pure so it can be tested without a database.
 */
export function buildQueue(bookings: QueueBookingInput[], needsStaff: NeedsStaffItem[], now: Date = new Date()) {
  const sections: QueueSection<unknown>[] = [
    { key: 'needsStaff', label: 'Needs staff', items: needsStaff.filter((q) => q.staffed < q.staffCount) },
    { key: 'staffNotConfirmed', label: 'Staff not confirmed', items: bookings.filter((b) => b.status === 'PENDING') },
    { key: 'logHours', label: 'Log hours', items: bookings.filter((b) => b.status === 'CONFIRMED' && b.eventDate < now) },
    { key: 'sendInvoice', label: 'Send invoice', items: bookings.filter((b) => b.status === 'COMPLETED' && b.invoicedAt == null) },
    { key: 'chasePayment', label: 'Chase payment', items: bookings.filter((b) => b.invoicedAt != null && b.clientPaidAt == null) },
    { key: 'runPayroll', label: 'Run payroll', items: bookings.filter((b) => b.clientPaidAt != null && b.staffPaidAt == null) },
  ];
  return sections.filter((section) => section.items.length > 0);
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
    if (query.bookingLane) where.bookingLane = query.bookingLane;
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

// GET /api/v1/admin/bookings/staff-options - roster members eligible to be booked
r.get('/staff-options', async (req, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const where: any = {
      userType: 'JOB_SEEKER',
      staffTier: { not: null }
    };
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ];
    }

    const staff = await prisma.user.findMany({
      where,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 100,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        staffTier: true,
        staffAvailable: true
      }
    });

    res.json({ ok: true, data: staff });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/admin/bookings/dashboard - the whole admin bookings page loads
// from this one call: the action queue, open/recent bookings decorated with
// their derived money, the float position, and the current rate card.
r.get('/dashboard', async (_req, res, next) => {
  try {
    const relevanceCutoff = new Date();
    relevanceCutoff.setDate(relevanceCutoff.getDate() - 30);

    const [bookings, openQuoteRequests] = await Promise.all([
      prisma.booking.findMany({
        where: {
          OR: [
            { status: { notIn: ['REJECTED', 'CANCELLED'] } },
            { updatedAt: { gte: relevanceCutoff } },
          ],
        },
        orderBy: [{ eventDate: 'asc' }],
        take: 300,
        include: {
          client: { select: clientSelectForMoney },
          staff: { select: staffSelectForMoney },
        },
      }),
      prisma.quoteRequest.findMany({
        where: { status: { notIn: ['DECLINED', 'COMPLETED'] } },
        include: { bookings: { select: { id: true, status: true } } },
      }),
    ]);

    const decorated = bookings.map((booking) => ({
      ...shapeBooking(booking),
      money: shapeBookingMoney(booking),
    }));

    const needsStaff: NeedsStaffItem[] = openQuoteRequests.map((qr) => ({
      quoteRequestId: qr.id,
      eventType: qr.eventType,
      eventDate: qr.eventDate,
      staffed: qr.bookings.filter((b) => b.status !== 'REJECTED' && b.status !== 'CANCELLED').length,
      staffCount: qr.staffCount,
    }));

    const queue = buildQueue(
      bookings.map((b) => ({
        id: b.id,
        status: b.status,
        eventDate: b.eventDate,
        invoicedAt: b.invoicedAt,
        clientPaidAt: b.clientPaidAt,
        staffPaidAt: b.staffPaidAt,
      })),
      needsStaff
    );

    const float = floatPosition(
      bookings
        .filter((b) => b.clientPaidAt != null && b.staffPaidAt == null)
        .map((b) => {
          const money = shapeBookingMoney(b);
          return {
            id: b.id,
            revenuePence: money.revenuePence,
            wagePence: money.wagePence,
            onCostsPence: money.onCostsPence,
            clientPaidAt: b.clientPaidAt,
            staffPaidAt: b.staffPaidAt,
            staffPayDueAt: b.staffPayDueAt,
          };
        })
    );

    res.json({
      ok: true,
      data: {
        queue,
        bookings: decorated,
        float,
        pricing: { ...getPublicRateCard(), accountRate: PRICING.accountRate },
      },
    });
  } catch (error) {
    next(error);
  }
});

const createTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  clientId: z.string().min(1),
  staffId: z.string().min(1),
  role: z.string().max(100).optional(),
  weekdays: z.array(z.number().int().min(1).max(7)).min(1),
  shiftStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  shiftEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  breakMins: z.number().int().min(0).max(300).default(0),
  hourlyRateCharged: z.number().positive().optional(),
  staffPayRate: z.number().positive().optional(),
  bookingLane: z.enum(['FLEX', 'SELECT', 'MANAGED']).optional(),
});

// POST /api/v1/admin/bookings/templates
r.post('/templates', async (req, res, next) => {
  try {
    const data = createTemplateSchema.parse(req.body);

    try {
      shiftHours(data.shiftStart, data.shiftEnd, data.breakMins);
    } catch (shiftError: any) {
      return res.status(400).json({ ok: false, error: shiftError.message });
    }

    const [client, staff] = await Promise.all([
      prisma.client.findUnique({ where: { id: data.clientId }, select: { id: true } }),
      prisma.user.findUnique({ where: { id: data.staffId }, select: { id: true, staffTier: true } }),
    ]);
    if (!client) return res.status(404).json({ ok: false, error: 'Client not found' });
    if (!staff) return res.status(404).json({ ok: false, error: 'Staff member not found' });

    const template = await prisma.bookingTemplate.create({
      data: {
        name: data.name,
        clientId: data.clientId,
        staffId: data.staffId,
        role: data.role,
        weekdays: data.weekdays,
        shiftStart: data.shiftStart,
        shiftEnd: data.shiftEnd,
        breakMins: data.breakMins,
        hourlyRateCharged: data.hourlyRateCharged != null ? new Prisma.Decimal(data.hourlyRateCharged) : null,
        staffPayRate: data.staffPayRate != null ? new Prisma.Decimal(data.staffPayRate) : null,
        bookingLane: data.bookingLane || 'FLEX',
      },
    });

    res.status(201).json({ ok: true, data: template });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/admin/bookings/templates
r.get('/templates', async (req, res, next) => {
  try {
    const templates = await prisma.bookingTemplate.findMany({
      where: { active: true },
      orderBy: [{ name: 'asc' }],
      include: {
        client: { select: { id: true, companyName: true } },
        staff: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    res.json({ ok: true, data: templates });
  } catch (error) {
    next(error);
  }
});

/** ISO weekday: 1 = Monday .. 7 = Sunday. */
export function isoWeekday(date: Date): number {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

/** The dates within [weekStarting, weekStarting+6] matching the given ISO weekdays. */
export function datesForWeekdays(weekStarting: Date, weekdays: number[]): Date[] {
  const wanted = new Set(weekdays);
  const dates: Date[] = [];
  for (let offset = 0; offset < 7; offset++) {
    const date = new Date(weekStarting);
    date.setUTCDate(date.getUTCDate() + offset);
    if (wanted.has(isoWeekday(date))) dates.push(date);
  }
  return dates;
}

const generateFromTemplateSchema = z.object({
  weekStarting: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// POST /api/v1/admin/bookings/templates/:id/generate - creates this week's
// bookings from a template. Idempotent: re-running it for the same week
// can't double-book a day, enforced by the Booking @@unique([templateId,
// eventDate]) constraint via skipDuplicates rather than a check-then-create
// race.
r.post('/templates/:id/generate', async (req, res, next) => {
  try {
    const { weekStarting } = generateFromTemplateSchema.parse(req.body);
    const weekStart = parseDateString(weekStarting, 'weekStarting');

    const template = await prisma.bookingTemplate.findUnique({
      where: { id: req.params.id },
      include: {
        client: { select: { id: true, subscriptionTier: true } },
        staff: { select: { id: true, staffTier: true } },
      },
    });
    if (!template) return res.status(404).json({ ok: false, error: 'Template not found' });
    if (!template.active) return res.status(400).json({ ok: false, error: 'Template is not active' });
    if (!template.staff.staffTier) {
      return res.status(400).json({ ok: false, error: 'This template\'s staff member has no staff tier set.' });
    }

    let hourlyRateCharged = template.hourlyRateCharged != null ? Number(template.hourlyRateCharged) : undefined;
    let staffPayRate = template.staffPayRate != null ? Number(template.staffPayRate) : undefined;
    if (hourlyRateCharged == null || staffPayRate == null) {
      const tier = await prisma.pricingTier.findUnique({
        where: { clientTier_staffTier: { clientTier: template.client.subscriptionTier, staffTier: template.staff.staffTier } },
      });
      if (hourlyRateCharged == null) {
        if (!tier) {
          return res.status(400).json({ ok: false, error: 'No PricingTier is set for this template\'s client/staff tier combination — set an explicit rate on the template.' });
        }
        hourlyRateCharged = Number(tier.hourlyRate);
      }
      if (staffPayRate == null && tier?.staffPayRate != null) {
        staffPayRate = Number(tier.staffPayRate);
      }
    }

    const hours = shiftHours(template.shiftStart, template.shiftEnd, template.breakMins);
    const totalEstimated = new Prisma.Decimal((hourlyRateCharged * hours).toFixed(2));
    const now = new Date();

    const dates = datesForWeekdays(weekStart, template.weekdays);
    const rows = dates.map((eventDate) => ({
      clientId: template.clientId,
      staffId: template.staffId,
      templateId: template.id,
      eventName: template.role || template.name,
      eventDate,
      location: '',
      shiftStart: template.shiftStart,
      shiftEnd: template.shiftEnd,
      hoursEstimated: new Prisma.Decimal(hours),
      clientTierAtBooking: template.client.subscriptionTier,
      staffTierAtBooking: template.staff.staffTier as NonNullable<typeof template.staff.staffTier>,
      hourlyRateCharged: new Prisma.Decimal(hourlyRateCharged as number),
      staffPayRate: staffPayRate != null ? new Prisma.Decimal(staffPayRate) : null,
      totalEstimated,
      bookingLane: template.bookingLane,
      status: 'CONFIRMED' as const,
      confirmedAt: now,
      confirmedBy: req.session.username || 'admin',
    }));

    const created = await prisma.booking.createMany({ data: rows, skipDuplicates: true });

    console.log(`[TEMPLATE] Generated ${created.count}/${rows.length} bookings from ${template.id} for week of ${weekStarting}`);
    res.json({
      ok: true,
      data: {
        requested: rows.length,
        created: created.count,
        skippedAsAlreadyGenerated: rows.length - created.count,
      },
    });
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('must be a valid date')) {
      return res.status(400).json({ ok: false, error: error.message });
    }
    if (error?.message && /longer than the shift|Invalid time/.test(error.message)) {
      return res.status(400).json({ ok: false, error: error.message });
    }
    next(error);
  }
});

const createBookingSchema = z.object({
  clientId: z.string().min(1),
  staffId: z.string().min(1),
  eventName: z.string().max(200).optional(),
  eventDate: z.string(),
  eventEndDate: z.string().optional(),
  location: z.string().min(1).max(200),
  venue: z.string().max(200).optional(),
  shiftStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  shiftEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  breakMins: z.number().int().min(0).max(300).optional(),
  hoursEstimated: z.number().positive().max(24).optional(),
  // Explicit rate takes precedence; omit to fall back to the client/staff
  // tier's PricingTier rate.
  hourlyRateCharged: z.number().positive().optional(),
  staffPayRate: z.number().positive().optional(),
  bookingLane: z.enum(['FLEX', 'SELECT', 'MANAGED']).optional(),
  status: z.enum(['PENDING', 'CONFIRMED']).default('CONFIRMED'),
  clientNotes: z.string().max(2000).optional(),
  adminNotes: z.string().max(2000).optional()
});

// POST /api/v1/admin/bookings - manually create a booking. Rate precedence:
// explicit hourlyRateCharged/staffPayRate > the client/staff tier's
// PricingTier rate.
r.post('/', async (req, res, next) => {
  try {
    const data = createBookingSchema.parse(req.body);

    // Validate the shift before anything else touches the database — a bad
    // shift (unparseable time, break longer than the shift) should never
    // reach the ledger.
    let derivedHours: number;
    try {
      derivedHours = shiftHours(data.shiftStart, data.shiftEnd, data.breakMins ?? 0);
    } catch (shiftError: any) {
      return res.status(400).json({ ok: false, error: shiftError.message });
    }

    const [client, staff] = await Promise.all([
      prisma.client.findUnique({ where: { id: data.clientId }, select: { id: true, subscriptionTier: true } }),
      prisma.user.findUnique({ where: { id: data.staffId }, select: { id: true, staffTier: true } })
    ]);
    if (!client) return res.status(404).json({ ok: false, error: 'Client not found' });
    if (!staff) return res.status(404).json({ ok: false, error: 'Staff member not found' });
    if (!staff.staffTier) {
      return res.status(400).json({ ok: false, error: 'This roster member has no staff tier set — set one before booking them.' });
    }

    let hourlyRateCharged = data.hourlyRateCharged;
    let staffPayRate = data.staffPayRate;
    if (hourlyRateCharged == null || staffPayRate == null) {
      const tier = await prisma.pricingTier.findUnique({
        where: { clientTier_staffTier: { clientTier: client.subscriptionTier, staffTier: staff.staffTier } }
      });
      if (hourlyRateCharged == null) {
        if (!tier) {
          return res.status(400).json({ ok: false, error: 'No PricingTier is set for this client/staff tier combination — provide hourlyRateCharged explicitly.' });
        }
        hourlyRateCharged = Number(tier.hourlyRate);
      }
      if (staffPayRate == null && tier?.staffPayRate != null) {
        staffPayRate = Number(tier.staffPayRate);
      }
    }

    const eventDate = parseDateString(data.eventDate, 'eventDate');
    const eventEndDate = data.eventEndDate ? parseDateString(data.eventEndDate, 'eventEndDate') : null;
    if (eventEndDate && eventEndDate < eventDate) {
      return res.status(400).json({ ok: false, error: 'eventEndDate cannot be before eventDate' });
    }

    const hoursEstimated = new Prisma.Decimal(data.hoursEstimated ?? derivedHours);
    const totalEstimated = new Prisma.Decimal((hourlyRateCharged * Number(hoursEstimated)).toFixed(2));

    const booking = await prisma.booking.create({
      data: {
        clientId: client.id,
        staffId: staff.id,
        eventName: data.eventName,
        eventDate,
        eventEndDate,
        location: data.location,
        venue: data.venue,
        shiftStart: data.shiftStart,
        shiftEnd: data.shiftEnd,
        hoursEstimated,
        clientTierAtBooking: client.subscriptionTier,
        staffTierAtBooking: staff.staffTier,
        hourlyRateCharged: new Prisma.Decimal(hourlyRateCharged),
        staffPayRate: staffPayRate != null ? new Prisma.Decimal(staffPayRate) : null,
        totalEstimated,
        bookingLane: data.bookingLane || 'FLEX',
        clientNotes: data.clientNotes,
        adminNotes: data.adminNotes,
        status: data.status,
        confirmedAt: data.status === 'CONFIRMED' ? new Date() : null,
        confirmedBy: data.status === 'CONFIRMED' ? (req.session.username || 'admin') : null
      },
      include: {
        client: {
          select: { id: true, companyName: true, contactName: true, email: true, subscriptionTier: true, subscriptionStatus: true }
        },
        staff: {
          select: {
            id: true, firstName: true, lastName: true, email: true, staffTier: true,
            staffAvailable: true, staffRating: true, staffReviewCount: true, staffBio: true, staffHighlights: true
          }
        }
      }
    });

    console.log(`[BOOKING] Manually created: ${booking.id} by ${req.session.username || 'admin'}`);
    res.status(201).json({ ok: true, data: shapeBooking(booking) });
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

    try {
      assertValidTransition(existing.status, status);
    } catch (transitionError: any) {
      return res.status(transitionError.statusCode || 409).json({ ok: false, error: transitionError.message });
    }

    const updateData: any = {
      status,
    };

    if (typeof adminNotes === 'string') updateData.adminNotes = adminNotes;

    if (status === 'CONFIRMED') {
      updateData.confirmedAt = new Date();
      updateData.confirmedBy = req.session.username || 'admin';

      const activeTerms = await prisma.termsVersion.findFirst({
        where: { publishedAt: { not: null } },
        orderBy: { publishedAt: 'desc' },
        select: { version: true },
      });
      if (activeTerms) updateData.termsVersionAtConfirmation = activeTerms.version;
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

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: {
        client: { select: { id: true, contactName: true, email: true, companyName: true } },
        staff: { select: { firstName: true, lastName: true } },
      },
    });
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

    // Fire review request to the client (non-blocking)
    if (booking.client) {
      sendBookingReviewRequestEmail({
        to: booking.client.email,
        clientName: booking.client.contactName,
        staffName: `${booking.staff.firstName} ${booking.staff.lastName}`,
        eventDate: booking.eventDate,
        bookingId: booking.id,
      }).catch((err) => console.error('[EMAIL] Review request failed:', err));
    }

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

const invoiceSchema = z.object({
  invoiceRef: z.string().max(100).optional(),
});

// POST /api/v1/admin/bookings/:id/invoice - starts the float clock.
r.post('/:id/invoice', async (req, res, next) => {
  try {
    const data = invoiceSchema.parse(req.body);

    const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!booking) return res.status(404).json({ ok: false, error: 'Booking not found' });
    if (booking.status !== 'COMPLETED') {
      return res.status(400).json({ ok: false, error: 'Only completed bookings can be invoiced' });
    }
    if (booking.invoicedAt) {
      return res.status(400).json({ ok: false, error: 'Booking has already been invoiced' });
    }

    const invoicedAt = new Date();
    const staffPayDueAt = new Date(invoicedAt);
    staffPayDueAt.setDate(staffPayDueAt.getDate() + STAFF_PAY_DUE_DAYS);

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: { invoicedAt, staffPayDueAt, invoiceRef: data.invoiceRef ?? booking.invoiceRef },
    });

    console.log(`[BOOKING] Invoiced: ${booking.id} by ${req.session.username || 'admin'}`);
    res.json({ ok: true, data: { id: updated.id, invoicedAt: updated.invoicedAt, staffPayDueAt: updated.staffPayDueAt } });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/admin/bookings/:id/mark-client-paid
r.post('/:id/mark-client-paid', async (req, res, next) => {
  try {
    const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!booking) return res.status(404).json({ ok: false, error: 'Booking not found' });
    if (!booking.invoicedAt) {
      return res.status(400).json({ ok: false, error: 'Booking has not been invoiced yet' });
    }
    if (booking.clientPaidAt) {
      return res.status(400).json({ ok: false, error: 'Client payment has already been recorded' });
    }

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: { clientPaidAt: new Date() },
    });

    console.log(`[BOOKING] Client paid: ${booking.id} by ${req.session.username || 'admin'}`);
    res.json({ ok: true, data: { id: updated.id, clientPaidAt: updated.clientPaidAt } });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/admin/bookings/:id/mark-staff-paid - closes out the float for this booking.
r.post('/:id/mark-staff-paid', async (req, res, next) => {
  try {
    const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!booking) return res.status(404).json({ ok: false, error: 'Booking not found' });
    if (!booking.clientPaidAt) {
      return res.status(400).json({ ok: false, error: 'Client has not paid yet' });
    }
    if (booking.staffPaidAt) {
      return res.status(400).json({ ok: false, error: 'Staff payment has already been recorded' });
    }

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: { staffPaidAt: new Date() },
    });

    console.log(`[BOOKING] Staff paid: ${booking.id} by ${req.session.username || 'admin'}`);
    res.json({ ok: true, data: { id: updated.id, staffPaidAt: updated.staffPaidAt } });
  } catch (error) {
    next(error);
  }
});

export default r;
