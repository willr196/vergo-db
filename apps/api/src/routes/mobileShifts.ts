import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireUserJwt } from '../middleware/jwtAuth';
import { sendPushToClient } from '../services/notifications';

const r = Router();

const listQuerySchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']).optional(),
  view: z.enum(['upcoming', 'history']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// A confirmation is a material commitment to an assignment.  Requiring an
// explicit acknowledgement also gives the agency an auditable record that the
// worker saw and accepted the current terms before the shift was confirmed.
const confirmSchema = z.object({
  acceptedTerms: z.literal(true),
});

const declineSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});

const checkOutSchema = z.object({
  notes: z.string().trim().min(1).max(1000).optional(),
});

// How far either side of the event date a worker may check in. Bookings store
// the date and the shift times separately, and shiftStart is free text, so the
// window is anchored to the date rather than parsed from the string. Four hours
// early covers setup calls; 36 hours late covers shifts that run past midnight
// and anyone who forgets until the following morning.
const CHECK_IN_WINDOW_BEFORE_MS = 4 * 60 * 60 * 1000;
const CHECK_IN_WINDOW_AFTER_MS = 36 * 60 * 60 * 1000;

// A shift longer than this is almost certainly a forgotten check-out rather
// than a real 24-hour stint, so it is rejected and left for the office to fix.
const MAX_SHIFT_HOURS = 20;

export function isWithinCheckInWindow(eventDate: Date, now: Date): boolean {
  const day = new Date(eventDate);
  day.setUTCHours(0, 0, 0, 0);
  return (
    now.getTime() >= day.getTime() - CHECK_IN_WINDOW_BEFORE_MS
    && now.getTime() <= day.getTime() + CHECK_IN_WINDOW_AFTER_MS
  );
}

export function hoursBetween(from: Date, to: Date): number {
  return Math.round(((to.getTime() - from.getTime()) / 3_600_000) * 100) / 100;
}

const bookingInclude = {
  client: {
    select: {
      id: true,
      companyName: true,
      contactName: true,
    },
  },
} satisfies Prisma.BookingInclude;

function numberOrNull(value: Prisma.Decimal | null | undefined): number | null {
  return value == null ? null : Number(value);
}

function shapeShift(booking: Prisma.BookingGetPayload<{ include: typeof bookingInclude }>) {
  return {
    id: booking.id,
    status: booking.status,
    eventName: booking.eventName,
    eventDate: booking.eventDate.toISOString(),
    eventEndDate: booking.eventEndDate?.toISOString() ?? null,
    location: booking.location,
    venue: booking.venue,
    shiftStart: booking.shiftStart,
    shiftEnd: booking.shiftEnd,
    hoursEstimated: numberOrNull(booking.hoursEstimated),
    staffPayRate: numberOrNull(booking.staffPayRate),
    expectedPay: booking.hoursEstimated && booking.staffPayRate
      ? Number(booking.hoursEstimated.mul(booking.staffPayRate))
      : null,
    clientNotes: booking.clientNotes,
    rejectionReason: booking.rejectionReason,
    confirmedAt: booking.confirmedAt?.toISOString() ?? null,
    completedAt: booking.completedAt?.toISOString() ?? null,
    checkedInAt: booking.checkedInAt?.toISOString() ?? null,
    checkedOutAt: booking.checkedOutAt?.toISOString() ?? null,
    hoursWorked: numberOrNull(booking.hoursWorked),
    workerShiftNotes: booking.workerShiftNotes,
    createdAt: booking.createdAt.toISOString(),
    updatedAt: booking.updatedAt.toISOString(),
    client: {
      id: booking.client.id,
      companyName: booking.client.companyName,
      contactName: booking.client.contactName,
    },
  };
}

r.use(requireUserJwt);

// GET /api/v1/mobile/shifts
r.get('/', async (req, res, next) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const terminalStatuses = ['REJECTED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'] as const;
    const where: Prisma.BookingWhereInput = {
      staffId: req.auth!.userId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.view === 'upcoming' && !query.status
        ? { eventDate: { gte: startOfToday }, status: { in: ['PENDING', 'CONFIRMED'] } }
        : {}),
      ...(query.view === 'history' && !query.status
        ? {
            OR: [
              { eventDate: { lt: startOfToday } },
              { status: { in: [...terminalStatuses] } },
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: bookingInclude,
        orderBy: query.view === 'history'
          ? [{ eventDate: 'desc' }, { shiftStart: 'desc' }]
          : [{ eventDate: 'asc' }, { shiftStart: 'asc' }],
        skip,
        take: query.limit,
      }),
      prisma.booking.count({ where }),
    ]);

    res.json({
      ok: true,
      data: {
        shifts: bookings.map(shapeShift),
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
          hasMore: query.page * query.limit < total,
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'Invalid shift query' });
    }
    next(error);
  }
});

// GET /api/v1/mobile/shifts/:id
r.get('/:id', async (req, res, next) => {
  try {
    const booking = await prisma.booking.findFirst({
      where: { id: req.params.id, staffId: req.auth!.userId },
      include: bookingInclude,
    });
    if (!booking) return res.status(404).json({ ok: false, error: 'Shift not found' });

    res.json({ ok: true, data: shapeShift(booking) });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/mobile/shifts/:id/confirm
r.post('/:id/confirm', async (req, res, next) => {
  try {
    confirmSchema.parse(req.body ?? {});

    const existing = await prisma.booking.findFirst({
      where: { id: req.params.id, staffId: req.auth!.userId },
      select: { id: true, status: true, clientId: true, eventName: true, eventDate: true },
    });
    if (!existing) return res.status(404).json({ ok: false, error: 'Shift not found' });
    if (existing.status !== 'PENDING') {
      return res.status(409).json({ ok: false, error: 'Only pending shifts can be confirmed' });
    }

    const activeTerms = await prisma.termsVersion.findFirst({
      where: { publishedAt: { not: null } },
      orderBy: { publishedAt: 'desc' },
      select: { version: true },
    });

    const booking = await prisma.booking.update({
      where: { id: existing.id },
      data: {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        confirmedBy: `staff:${req.auth!.userId}`,
        ...(activeTerms ? { termsVersionAtConfirmation: activeTerms.version } : {}),
      },
      include: bookingInclude,
    });

    sendPushToClient(
      existing.clientId,
      'Shift Confirmed',
      `${booking.eventName || 'Your shift'} has been confirmed by a staff member.`,
      { type: 'shift_confirmed', bookingId: booking.id }
    ).catch((error) => console.error('[PUSH] shift confirmation:', error));

    res.json({ ok: true, data: shapeShift(booking) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'You must accept the shift terms to confirm' });
    }
    next(error);
  }
});

// POST /api/v1/mobile/shifts/:id/decline
r.post('/:id/decline', async (req, res, next) => {
  try {
    const { reason } = declineSchema.parse(req.body ?? {});

    const existing = await prisma.booking.findFirst({
      where: { id: req.params.id, staffId: req.auth!.userId },
      select: { id: true, status: true, clientId: true, eventName: true },
    });
    if (!existing) return res.status(404).json({ ok: false, error: 'Shift not found' });
    if (existing.status !== 'PENDING') {
      return res.status(409).json({ ok: false, error: 'Only pending shifts can be declined' });
    }

    const booking = await prisma.booking.update({
      where: { id: existing.id },
      data: {
        status: 'REJECTED',
        rejectionReason: reason ?? null,
      },
      include: bookingInclude,
    });

    sendPushToClient(
      existing.clientId,
      'Shift Declined',
      `${booking.eventName || 'A shift'} was declined by the assigned worker.`,
      { type: 'shift_declined', bookingId: booking.id }
    ).catch((error) => console.error('[PUSH] shift decline:', error));

    res.json({ ok: true, data: shapeShift(booking) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'Invalid decline reason' });
    }
    next(error);
  }
});

// POST /api/v1/mobile/shifts/:id/check-in
r.post('/:id/check-in', async (req, res, next) => {
  try {
    const existing = await prisma.booking.findFirst({
      where: { id: req.params.id, staffId: req.auth!.userId },
      select: {
        id: true,
        status: true,
        eventDate: true,
        checkedInAt: true,
        clientId: true,
        eventName: true,
      },
    });
    if (!existing) return res.status(404).json({ ok: false, error: 'Shift not found' });

    if (existing.status !== 'CONFIRMED') {
      return res.status(409).json({ ok: false, error: 'Only confirmed shifts can be checked in to' });
    }
    if (existing.checkedInAt) {
      return res.status(409).json({ ok: false, error: 'You have already checked in to this shift' });
    }
    if (!isWithinCheckInWindow(existing.eventDate, new Date())) {
      return res.status(409).json({
        ok: false,
        error: 'This shift is not open for check-in yet. Check in from four hours before the start.',
      });
    }

    const booking = await prisma.booking.update({
      where: { id: existing.id },
      data: { checkedInAt: new Date() },
      include: bookingInclude,
    });

    sendPushToClient(
      existing.clientId,
      'Staff On Site',
      `A staff member has checked in for ${booking.eventName || 'your booking'}.`,
      { type: 'shift_checked_in', bookingId: booking.id }
    ).catch((error) => console.error('[PUSH] shift check-in:', error));

    res.json({ ok: true, data: shapeShift(booking) });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/mobile/shifts/:id/check-out
r.post('/:id/check-out', async (req, res, next) => {
  try {
    const { notes } = checkOutSchema.parse(req.body ?? {});

    const existing = await prisma.booking.findFirst({
      where: { id: req.params.id, staffId: req.auth!.userId },
      select: {
        id: true,
        status: true,
        checkedInAt: true,
        checkedOutAt: true,
        clientId: true,
        eventName: true,
      },
    });
    if (!existing) return res.status(404).json({ ok: false, error: 'Shift not found' });

    if (!existing.checkedInAt) {
      return res.status(409).json({ ok: false, error: 'You need to check in before you can check out' });
    }
    if (existing.checkedOutAt) {
      return res.status(409).json({ ok: false, error: 'You have already checked out of this shift' });
    }

    const checkedOutAt = new Date();
    const hoursWorked = hoursBetween(existing.checkedInAt, checkedOutAt);
    if (hoursWorked > MAX_SHIFT_HOURS) {
      return res.status(409).json({
        ok: false,
        error: 'This shift has been open too long to close from the app. Contact the office so it can be corrected.',
      });
    }

    // Check-out records attendance; it does not complete the booking. Marking a
    // booking COMPLETED overwrites hoursEstimated with the worked figure,
    // recomputes the client total and sends the review request, and that is the
    // office's call after it has seen the hours. See POST /:id/complete in
    // adminBookings.ts, which reads hoursWorked as its default.
    const booking = await prisma.booking.update({
      where: { id: existing.id },
      data: {
        checkedOutAt,
        hoursWorked: new Prisma.Decimal(hoursWorked),
        ...(notes ? { workerShiftNotes: notes } : {}),
      },
      include: bookingInclude,
    });

    sendPushToClient(
      existing.clientId,
      'Shift Finished',
      `${booking.eventName || 'A shift'} finished after ${hoursWorked} hours on site.`,
      { type: 'shift_checked_out', bookingId: booking.id }
    ).catch((error) => console.error('[PUSH] shift check-out:', error));

    res.json({ ok: true, data: shapeShift(booking) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'Invalid check-out notes' });
    }
    next(error);
  }
});

export default r;
