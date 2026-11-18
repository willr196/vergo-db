import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireUserJwtOrSession } from '../middleware/jwtAuth';
import { sendPushToClient } from '../services/notifications';
import { PRICING, ON_COSTS, splitAllInPay } from '../config/pricing';
import { sendStaffShiftAlertEmail } from '../services/email';
import { writeAudit, writeAuditBestEffort, workerAppActor, workerChannel } from '../ops/audit';
import { syncStaffingStatus } from './ops/bookings';
import { loadOpsSettings, payDaysAround } from '../ops/settings';
import { londonDateKey } from '../ops/time';

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
  // A shift offered through VERGO Ops: what the worker needs to know for the
  // day. Never the charge rate, the margin or anything about other workers.
  opsBooking: {
    select: {
      reference: true, eventType: true, address: true,
      onSiteContactName: true, onSiteContactPhone: true, vergoLead: true, status: true,
    },
  },
  requirement: {
    select: {
      role: true, dressCode: true, equipment: true, duties: true, healthSafetyRisks: true, riskControls: true,
      breakInfo: true, requiredExperience: true, travelContribution: true,
    },
  },
} satisfies Prisma.BookingInclude;

// The detail screen also gets the running order and the assignment
// confirmation, if one has been issued for this shift.
const detailInclude = {
  ...bookingInclude,
  opsBooking: {
    select: {
      ...bookingInclude.opsBooking.select,
      scheduleItems: { select: { id: true, time: true, title: true, assignee: true, notes: true }, orderBy: { createdAt: 'asc' } },
    },
  },
  workerDocuments: {
    where: { type: 'ASSIGNMENT_CONFIRMATION', status: { in: ['ISSUED', 'ACCEPTED'] } },
    select: { id: true },
    orderBy: { issuedAt: 'desc' },
    take: 1,
  },
} satisfies Prisma.BookingInclude;

type ShiftRow = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>
  | Prisma.BookingGetPayload<{ include: typeof detailInclude }>;

function shapeOps(booking: ShiftRow) {
  const o = booking.opsBooking;
  if (!o) return null;
  const req = booking.requirement;
  const items = 'scheduleItems' in o ? o.scheduleItems : undefined;
  return {
    reference: o.reference,
    eventType: o.eventType,
    address: o.address,
    bookingStatus: o.status,
    onSiteContact: o.onSiteContactName || o.onSiteContactPhone ? { name: o.onSiteContactName, phone: o.onSiteContactPhone } : null,
    vergoLead: o.vergoLead,
    breakMins: booking.breakMins ?? null,
    dressCode: req?.dressCode ?? null,
    equipment: req?.equipment ?? null,
    duties: req?.duties ?? null,
    healthSafetyRisks: req?.healthSafetyRisks ?? null,
    riskControls: req?.riskControls ?? null,
    breakInfo: req?.breakInfo ?? null,
    requiredExperience: req?.requiredExperience ?? null,
    travelContribution: numberOrNull(req?.travelContribution),
    // Detail only. Timed lines in clock order, then untimed notes, as in Ops.
    runningOrder: items
      ? [...items.filter((i) => i.time).sort((a, b) => a.time!.localeCompare(b.time!)), ...items.filter((i) => !i.time)]
      : undefined,
    confirmationDocumentId: 'workerDocuments' in booking ? booking.workerDocuments[0]?.id ?? null : undefined,
  };
}

function numberOrNull(value: Prisma.Decimal | null | undefined): number | null {
  return value == null ? null : Number(value);
}

function shapeShift(booking: ShiftRow) {
  return {
    id: booking.id,
    status: booking.status,
    eventName: booking.eventName,
    role: booking.role ?? booking.requirement?.role ?? null,
    eventDate: booking.eventDate.toISOString(),
    eventEndDate: booking.eventEndDate?.toISOString() ?? null,
    location: booking.location,
    venue: booking.venue,
    shiftStart: booking.shiftStart,
    shiftEnd: booking.shiftEnd,
    hoursEstimated: numberOrNull(booking.hoursEstimated),
    staffPayRate: numberOrNull(booking.staffPayRate),
    // Billed at the four-hour minimum, which is what the worker is actually
    // paid, so a three-hour shift does not show three hours of pay.
    billableHours: booking.hoursEstimated
      ? Math.max(Number(booking.hoursEstimated), PRICING.minimumChargeHours)
      : null,
    expectedPay: booking.hoursEstimated && booking.staffPayRate
      ? Math.round(
        Math.max(Number(booking.hoursEstimated), PRICING.minimumChargeHours)
        * Number(booking.staffPayRate) * 100
      ) / 100
      : null,
    clientNotes: booking.clientNotes,
    rejectionReason: booking.rejectionReason,
    confirmedAt: booking.confirmedAt?.toISOString() ?? null,
    completedAt: booking.completedAt?.toISOString() ?? null,
    checkedInAt: booking.checkedInAt?.toISOString() ?? null,
    checkedOutAt: booking.checkedOutAt?.toISOString() ?? null,
    hoursWorked: numberOrNull(booking.hoursWorked),
    workerShiftNotes: booking.workerShiftNotes,
    timesheetConfirmedAt: booking.timesheetConfirmedAt?.toISOString() ?? null,
    timesheetQuery: booking.timesheetQuery,
    createdAt: booking.createdAt.toISOString(),
    updatedAt: booking.updatedAt.toISOString(),
    client: {
      id: booking.client.id,
      companyName: booking.client.companyName,
      contactName: booking.client.contactName,
    },
    ops: shapeOps(booking),
  };
}

/**
 * When a worker accepts or declines a VERGO Ops offer (in the app or on the
 * website's staff pages), Ops hears
 * about it the way it would from the office: an audit row, and the booking
 * moves between Confirmed / Staffing / Fully staffed.
 */
async function tellOps(shift: { id: string; opsBookingId: string | null }, userId: string, to: 'CONFIRMED' | 'REJECTED', reason: string | null | undefined, via: 'app' | 'website') {
  if (!shift.opsBookingId) return;
  const actor = await workerAppActor(userId, via);
  const where = via === 'website' ? 'on the website' : 'in the app';
  await writeAudit(actor, {
    action: 'ASSIGNMENT_CHANGED', entityType: 'OpsBooking', entityId: shift.opsBookingId,
    oldValue: { assignmentId: shift.id, status: 'PENDING' },
    newValue: { assignmentId: shift.id, status: to },
    reason: to === 'CONFIRMED'
      ? `Accepted by the worker ${where}`
      : reason ? `Declined by the worker ${where}: ${reason}` : `Declined by the worker ${where}`,
  });
  await syncStaffingStatus(shift.opsBookingId, actor);
}

// The app sends a bearer token; the website's /staff/shifts page sends its session.
r.use(requireUserJwtOrSession);

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
/**
 * The worker's own pay, estimated from their shifts: by month, this tax year,
 * and what is booked ahead. Pay rates are all in (holiday pay inside them), so
 * each amount is split into basic and holiday the way Ops does. Each shift is
 * paid for at least the minimum hours, the same as the client is charged.
 * Estimates only: payroll decides what is actually paid.
 */
export function shiftPay(hours: number, ratePounds: number) {
  const billed = Math.max(hours, PRICING.minimumChargeHours);
  const totalPence = Math.round(billed * ratePounds * 100);
  const { wagePence, holidayPence } = splitAllInPay(totalPence);
  return { hours: billed, payPence: totalPence, basicPence: wagePence, holidayPence };
}

/** 6 April of the current tax year, as YYYY-MM-DD. */
export function taxYearStart(now: Date): string {
  const y = now.getUTCFullYear();
  return `${now.getTime() >= Date.UTC(y, 3, 6) ? y : y - 1}-04-06`;
}

r.get('/earnings', async (req, res, next) => {
  try {
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1));
    const rows = await prisma.booking.findMany({
      where: { staffId: req.auth!.userId, status: { in: ['COMPLETED', 'CONFIRMED'] }, eventDate: { gte: from } },
      select: { id: true, status: true, eventDate: true, eventName: true, role: true, venue: true, location: true, hoursWorked: true, hoursEstimated: true, staffPayRate: true },
      orderBy: { eventDate: 'desc' },
    });
    const startOfToday = new Date(now);
    startOfToday.setUTCHours(0, 0, 0, 0);
    const taxFrom = taxYearStart(now);
    const ops = await loadOpsSettings();
    const payDays = ops.payFrequency === 'monthly' && ops.payDayOfMonth ? payDaysAround(londonDateKey(now), ops.payDayOfMonth) : null;

    type Sum = { shifts: number; hours: number; payPence: number; basicPence: number; holidayPence: number };
    const empty = (): Sum => ({ shifts: 0, hours: 0, payPence: 0, basicPence: 0, holidayPence: 0 });
    const add = (s: Sum, p: ReturnType<typeof shiftPay>) => {
      s.shifts += 1; s.hours += p.hours; s.payPence += p.payPence; s.basicPence += p.basicPence; s.holidayPence += p.holidayPence;
    };

    const months = new Map<string, Sum>();
    const taxYear = empty();
    const upcoming = empty();
    const sinceLastPay = empty();
    let noRate = 0;
    const worked: Array<Record<string, unknown>> = [];

    for (const b of rows) {
      const rate = b.staffPayRate == null ? null : Number(b.staffPayRate);
      const hours = Number(b.hoursWorked ?? b.hoursEstimated ?? 0);
      const isPast = b.status === 'COMPLETED' || b.eventDate < startOfToday;
      if (rate == null || !hours) { if (isPast) noRate += 1; continue; }
      const pay = shiftPay(hours, rate);
      if (!isPast) { add(upcoming, pay); continue; }
      const month = b.eventDate.toISOString().slice(0, 7);
      if (!months.has(month)) months.set(month, empty());
      add(months.get(month)!, pay);
      if (b.eventDate.toISOString().slice(0, 10) >= taxFrom) add(taxYear, pay);
      if (payDays && b.eventDate.toISOString().slice(0, 10) > payDays.last) add(sinceLastPay, pay);
      if (worked.length < 60) worked.push({
        id: b.id, eventDate: b.eventDate.toISOString(), title: b.role || b.eventName || 'Shift',
        where: [b.venue, b.location].filter(Boolean).join(', '), hours: pay.hours, rate,
        payPence: pay.payPence, basicPence: pay.basicPence, holidayPence: pay.holidayPence,
        hoursAreActual: b.hoursWorked != null,
      });
    }

    res.json({
      ok: true,
      data: {
        payFrequency: ops.payFrequency,
        lastPayDay: payDays?.last ?? null,
        nextPayDay: payDays?.next ?? null,
        sinceLastPay: payDays ? sinceLastPay : null,
        holidayPercent: Math.round(ON_COSTS.holidayAccrualRate * 10000) / 100,
        minimumHours: PRICING.minimumChargeHours,
        taxYearFrom: taxFrom,
        taxYear,
        upcoming,
        shiftsWithoutRate: noRate,
        months: [...months.entries()].map(([month, s]) => ({ month, ...s })),
        shifts: worked,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * What needs the worker's attention, for the bell on the staff pages: offers
 * to answer, a shift today or tomorrow, hours to confirm, documents to agree.
 * Worked out fresh from their records each time, so nothing is stored and
 * nothing goes stale.
 */
export const TIMESHEET_DAYS = 14;

r.get('/attention', async (req, res, next) => {
  try {
    const userId = req.auth!.userId;
    const now = new Date();
    const startOfToday = new Date(now); startOfToday.setUTCHours(0, 0, 0, 0);
    const dayAfterTomorrow = new Date(startOfToday.getTime() + 2 * 86400000);
    const since = new Date(startOfToday.getTime() - TIMESHEET_DAYS * 86400000);

    const [offers, soon, toConfirm, docs] = await Promise.all([
      prisma.booking.count({ where: { staffId: userId, status: 'PENDING', eventDate: { gte: startOfToday } } }),
      prisma.booking.findMany({
        where: { staffId: userId, status: 'CONFIRMED', eventDate: { gte: startOfToday, lt: dayAfterTomorrow } },
        select: { id: true, eventDate: true, shiftStart: true, role: true, eventName: true, venue: true },
        orderBy: [{ eventDate: 'asc' }, { shiftStart: 'asc' }],
        take: 3,
      }),
      prisma.booking.count({
        where: {
          staffId: userId, timesheetConfirmedAt: null, timesheetQuery: null,
          eventDate: { gte: since, lt: startOfToday },
          OR: [{ status: 'COMPLETED' }, { status: 'CONFIRMED' }],
        },
      }),
      prisma.workerDocument.count({ where: { userId, status: 'ISSUED' } }),
    ]);

    const items: Array<{ kind: string; text: string; href: string }> = [];
    if (offers) items.push({ kind: 'offer', text: offers === 1 ? 'A shift offer is waiting for your answer' : `${offers} shift offers are waiting for your answer`, href: '/staff/shifts' });
    for (const s of soon) {
      const isToday = s.eventDate.getTime() < startOfToday.getTime() + 86400000;
      items.push({ kind: 'soon', text: `${isToday ? 'Today' : 'Tomorrow'}: ${s.role || s.eventName || 'your shift'}${s.shiftStart ? ` at ${s.shiftStart}` : ''}${s.venue ? `, ${s.venue}` : ''}`, href: '/staff/shifts' });
    }
    if (toConfirm) items.push({ kind: 'timesheet', text: toConfirm === 1 ? 'Check the hours for a shift you worked' : `Check the hours for ${toConfirm} shifts you worked`, href: '/staff/shifts#worked' });
    if (docs) items.push({ kind: 'document', text: docs === 1 ? 'A document is waiting for you to read and agree' : `${docs} documents are waiting for you to read and agree`, href: '/staff/documents' });

    res.json({ ok: true, data: { count: items.length, items } });
  } catch (error) {
    next(error);
  }
});

r.get('/:id', async (req, res, next) => {
  try {
    const booking = await prisma.booking.findFirst({
      where: { id: req.params.id, staffId: req.auth!.userId },
      include: detailInclude,
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
      select: { id: true, status: true, clientId: true, eventName: true, eventDate: true, opsBookingId: true },
    });
    if (!existing) return res.status(404).json({ ok: false, error: 'Shift not found' });
    if (existing.status !== 'PENDING') {
      return res.status(409).json({ ok: false, error: 'Only pending shifts can be confirmed' });
    }

    // An Ops shift waits for an agreement the worker has been sent and can
    // agree themselves, in My documents. With none issued it is the office's
    // call, made when they offered the shift.
    if (existing.opsBookingId) {
      const agreements = await prisma.workerDocument.findMany({
        where: { userId: req.auth!.userId, type: 'ZERO_HOURS_AGREEMENT', status: { in: ['ISSUED', 'ACCEPTED'] } },
        select: { status: true },
      });
      if (agreements.some((a) => a.status === 'ISSUED') && !agreements.some((a) => a.status === 'ACCEPTED')) {
        return res.status(409).json({
          ok: false,
          code: 'AGREEMENT_PENDING',
          error: 'Please read and agree your employment agreement first. It is in Profile > My documents.',
        });
      }
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

    await tellOps(existing, req.auth!.userId, 'CONFIRMED', null, workerChannel(req));

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
      select: { id: true, status: true, clientId: true, eventName: true, opsBookingId: true },
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

    await tellOps(existing, req.auth!.userId, 'REJECTED', reason, workerChannel(req));

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

// ── Calendar, running late, can't make it ─────────────────────────────

/** "18:30" to [18, 30], or null for anything else. shiftStart is free text. */
function clock(value: string | null | undefined): [number, number] | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? [h, min] : null;
}

function icsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** One shift as an .ics file, in London time. Times missing: an all-day entry. */
export function shiftCalendar(
  s: { id: string; eventDate: Date; shiftStart: string | null; shiftEnd: string | null; title: string; where: string; details: string },
  now = new Date()
): string {
  const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = ymd(s.eventDate);
  const start = clock(s.shiftStart);
  const end = clock(s.shiftEnd);
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//VERGO//Staff shifts//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:shift-${s.id}@vergoltd.com`,
    `DTSTAMP:${now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
  ];
  if (start) {
    lines.push(`DTSTART;TZID=Europe/London:${day}T${pad(start[0])}${pad(start[1])}00`);
    if (end) {
      const overnight = end[0] * 60 + end[1] <= start[0] * 60 + start[1];
      const endDay = ymd(new Date(s.eventDate.getTime() + (overnight ? 86400000 : 0)));
      lines.push(`DTEND;TZID=Europe/London:${endDay}T${pad(end[0])}${pad(end[1])}00`);
    }
  } else {
    lines.push(`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${ymd(new Date(s.eventDate.getTime() + 86400000))}`);
  }
  lines.push(`SUMMARY:${icsText(`VERGO: ${s.title}`)}`);
  if (s.where) lines.push(`LOCATION:${icsText(s.where)}`);
  if (s.details) lines.push(`DESCRIPTION:${icsText(s.details)}`);
  lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:VERGO shift', 'TRIGGER:-PT3H', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

r.get('/:id/calendar.ics', async (req, res, next) => {
  try {
    const b = await prisma.booking.findFirst({
      where: { id: req.params.id, staffId: req.auth!.userId, status: { in: ['CONFIRMED', 'PENDING'] } },
      include: bookingInclude,
    });
    if (!b) return res.status(404).json({ ok: false, error: 'Shift not found' });
    const s = shapeShift(b);
    const where = [s.venue, s.ops?.address || s.location].filter(Boolean).join(', ');
    const details = [
      s.ops?.dressCode ? `Dress code: ${s.ops.dressCode}` : '',
      s.ops?.onSiteContact ? `On the day: ${[s.ops.onSiteContact.name, s.ops.onSiteContact.phone].filter(Boolean).join(', ')}` : '',
      'Full briefing in your VERGO account, under My shifts.',
    ].filter(Boolean).join('\n');
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="vergo-shift-${s.eventDate.slice(0, 10)}.ics"`);
    res.send(shiftCalendar({ id: b.id, eventDate: b.eventDate, shiftStart: b.shiftStart, shiftEnd: b.shiftEnd, title: s.role || s.eventName || 'Shift', where, details }));
  } catch (error) {
    next(error);
  }
});

const lateSchema = z.object({
  minutes: z.number().int().min(5).max(240),
  note: z.string().trim().max(300).optional(),
});
const cantMakeSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

function escHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

const alertSelect = {
  id: true, status: true, eventDate: true, shiftStart: true, shiftEnd: true,
  venue: true, location: true, eventName: true, role: true, opsBookingId: true,
} as const;
type AlertShift = Prisma.BookingGetPayload<{ select: typeof alertSelect }>;

/** The office email for a shift alert: who, which shift, what happened. True if it went. */
async function alertOffice(userId: string, b: AlertShift, headline: string, detail: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true, phone: true, email: true } });
  const name = user ? `${user.firstName} ${user.lastName}`.trim() : 'A worker';
  const when = `${b.eventDate.toISOString().slice(0, 10)}${b.shiftStart ? ` ${b.shiftStart}${b.shiftEnd ? `–${b.shiftEnd}` : ''}` : ''}`;
  const where = [b.venue, b.location].filter(Boolean).join(', ');
  const sent = await sendStaffShiftAlertEmail({
    subject: `${headline}: ${name}, ${when}${where ? ` at ${where}` : ''}`,
    replyTo: user?.email,
    html: `<h2 style="margin-bottom:4px">${escHtml(headline)}</h2>
      <p><strong>${escHtml(name)}</strong>${user?.phone ? ` · <a href="tel:${escHtml(user.phone.replace(/\s+/g, ''))}">${escHtml(user.phone)}</a>` : ''}</p>
      <p>${escHtml(b.role || b.eventName || 'Shift')}, ${escHtml(when)}${where ? `, ${escHtml(where)}` : ''}</p>
      <p>${escHtml(detail)}</p>
      <p style="color:#666;font-size:12px">Sent from the staff pages. Shift ${escHtml(b.id)}.</p>`,
  });
  return Boolean(sent?.success);
}

r.post('/:id/running-late', async (req, res, next) => {
  try {
    const body = lateSchema.parse(req.body ?? {});
    const b = await prisma.booking.findFirst({ where: { id: req.params.id, staffId: req.auth!.userId }, select: alertSelect });
    if (!b) return res.status(404).json({ ok: false, error: 'Shift not found' });
    if (b.status !== 'CONFIRMED') return res.status(409).json({ ok: false, error: 'Only a confirmed shift can be marked as running late' });
    if (!isWithinCheckInWindow(b.eventDate, new Date())) {
      return res.status(409).json({ ok: false, error: 'You can only say you are running late on the day of the shift' });
    }
    const detail = `Running about ${body.minutes} minutes late.${body.note ? ` "${body.note}"` : ''}`;
    if (b.opsBookingId) {
      const actor = await workerAppActor(req.auth!.userId, workerChannel(req));
      await writeAuditBestEffort(actor, {
        action: 'ASSIGNMENT_CHANGED', entityType: 'OpsBooking', entityId: b.opsBookingId,
        newValue: { assignmentId: b.id, runningLateMinutes: body.minutes }, reason: detail,
      });
    }
    const emailed = await alertOffice(req.auth!.userId, b, 'Running late', detail);
    res.json({ ok: true, data: { emailed } });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ ok: false, error: 'Say roughly how many minutes late, between 5 and 240' });
    next(error);
  }
});

r.post('/:id/cant-make-it', async (req, res, next) => {
  try {
    const body = cantMakeSchema.parse(req.body ?? {});
    const b = await prisma.booking.findFirst({ where: { id: req.params.id, staffId: req.auth!.userId }, select: alertSelect });
    if (!b) return res.status(404).json({ ok: false, error: 'Shift not found' });
    if (b.status !== 'CONFIRMED') return res.status(409).json({ ok: false, error: 'Only a confirmed shift can be given up here' });
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    if (b.eventDate < startOfToday) return res.status(409).json({ ok: false, error: 'This shift has already happened' });

    await prisma.booking.update({
      where: { id: b.id },
      data: { status: 'CANCELLED', rejectionReason: `Worker can't make it: ${body.reason}`.slice(0, 500) },
    });
    if (b.opsBookingId) {
      const actor = await workerAppActor(req.auth!.userId, workerChannel(req));
      await writeAuditBestEffort(actor, {
        action: 'ASSIGNMENT_CHANGED', entityType: 'OpsBooking', entityId: b.opsBookingId,
        oldValue: { assignmentId: b.id, status: 'CONFIRMED' }, newValue: { assignmentId: b.id, status: 'CANCELLED' },
        reason: `The worker can't make it: ${body.reason}`,
      });
      await syncStaffingStatus(b.opsBookingId, actor);
    }
    const emailed = await alertOffice(req.auth!.userId, b, "Can't make the shift", `Reason: ${body.reason}. The shift needs cover.`);
    res.json({ ok: true, data: { emailed } });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ ok: false, error: 'Tell us briefly why, so we can find cover' });
    next(error);
  }
});

// ── Timesheet: the worker agrees the hours, or says what is wrong ──────
const timesheetSchema = z.union([
  z.object({ agree: z.literal(true) }),
  z.object({ agree: z.literal(false), note: z.string().trim().min(3).max(500) }),
]);

r.post('/:id/timesheet', async (req, res, next) => {
  try {
    const body = timesheetSchema.parse(req.body ?? {});
    const b = await prisma.booking.findFirst({
      where: { id: req.params.id, staffId: req.auth!.userId },
      select: { ...alertSelect, hoursWorked: true, hoursEstimated: true, checkedInAt: true, checkedOutAt: true, timesheetConfirmedAt: true, timesheetQuery: true },
    });
    if (!b) return res.status(404).json({ ok: false, error: 'Shift not found' });
    const startOfToday = new Date(); startOfToday.setUTCHours(0, 0, 0, 0);
    const worked = b.status === 'COMPLETED' || (b.status === 'CONFIRMED' && b.eventDate < startOfToday);
    if (!worked) return res.status(409).json({ ok: false, error: 'You can check the hours once the shift has happened' });
    if (b.timesheetConfirmedAt || b.timesheetQuery) return res.status(409).json({ ok: false, error: 'You have already answered for this shift' });

    const hours = b.hoursWorked ?? b.hoursEstimated;
    const recorded = `${hours != null ? `${Number(hours)} hours` : 'hours not recorded'}${b.checkedInAt && b.checkedOutAt ? ` (checked in ${b.checkedInAt.toISOString().slice(11, 16)}, out ${b.checkedOutAt.toISOString().slice(11, 16)} UTC)` : ''}`;

    if (body.agree) {
      await prisma.booking.update({ where: { id: b.id }, data: { timesheetConfirmedAt: new Date() } });
      return res.json({ ok: true, data: { agreed: true } });
    }

    await prisma.booking.update({ where: { id: b.id }, data: { timesheetQuery: body.note } });
    if (b.opsBookingId) {
      const actor = await workerAppActor(req.auth!.userId, workerChannel(req));
      await writeAuditBestEffort(actor, {
        action: 'ASSIGNMENT_CHANGED', entityType: 'OpsBooking', entityId: b.opsBookingId,
        newValue: { assignmentId: b.id, timesheetQuery: body.note }, reason: `The worker queried the hours (${recorded}): ${body.note}`,
      });
    }
    const emailed = await alertOffice(req.auth!.userId, b, 'Hours queried', `Recorded: ${recorded}. The worker says: "${body.note}"`);
    res.json({ ok: true, data: { agreed: false, emailed } });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ ok: false, error: 'Tell us what is wrong with the hours' });
    next(error);
  }
});

// ── Early pay and shift swaps: requests the office decides on ──────────
// Neither changes anything by itself: the office gets an email (and Ops an
// audit line) and does the rest. One early pay request every 3 days at most.
const EARLY_PAY_GAP_DAYS = 3;
const earlyPaySchema = z.object({ note: z.string().trim().max(500).optional() });
const swapSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  colleague: z.string().trim().max(120).optional(),
});

r.post('/early-pay', async (req, res, next) => {
  try {
    const body = earlyPaySchema.parse(req.body ?? {});
    const userId = req.auth!.userId;
    const recent = await prisma.auditLog.findFirst({
      where: { action: 'EARLY_PAY_REQUESTED', entityType: 'Worker', entityId: userId, at: { gte: new Date(Date.now() - EARLY_PAY_GAP_DAYS * 86400000) } },
      select: { id: true },
    });
    if (recent) return res.status(409).json({ ok: false, error: 'You asked recently. The office will come back to you; ring us if it is urgent.' });

    const now = new Date();
    const ops = await loadOpsSettings();
    const payDays = ops.payFrequency === 'monthly' && ops.payDayOfMonth ? payDaysAround(londonDateKey(now), ops.payDayOfMonth) : null;
    const startOfToday = new Date(now); startOfToday.setUTCHours(0, 0, 0, 0);
    const from = payDays ? new Date(`${payDays.last}T23:59:59Z`) : new Date(startOfToday.getTime() - 31 * 86400000);
    const rows = await prisma.booking.findMany({
      where: { staffId: userId, eventDate: { gt: from, lt: startOfToday }, OR: [{ status: 'COMPLETED' }, { status: 'CONFIRMED' }] },
      select: { eventDate: true, role: true, eventName: true, venue: true, hoursWorked: true, hoursEstimated: true, staffPayRate: true },
      orderBy: { eventDate: 'asc' },
    });
    let total = 0;
    const lines = rows.map((b) => {
      const hours = Number(b.hoursWorked ?? b.hoursEstimated ?? 0);
      const rate = b.staffPayRate == null ? null : Number(b.staffPayRate);
      const p = rate != null && hours ? shiftPay(hours, rate) : null;
      if (p) total += p.payPence;
      return `${b.eventDate.toISOString().slice(0, 10)} · ${b.role || b.eventName || 'Shift'}${b.venue ? `, ${b.venue}` : ''} · ${p ? `${p.hours}h, £${(p.payPence / 100).toFixed(2)}` : 'rate or hours missing'}`;
    });
    if (!rows.length) return res.status(409).json({ ok: false, error: 'There are no shifts worked since the last pay day to pay early.' });

    const actor = await workerAppActor(userId, workerChannel(req));
    await writeAuditBestEffort(actor, { action: 'EARLY_PAY_REQUESTED', entityType: 'Worker', entityId: userId, newValue: { shifts: rows.length, estimatePence: total }, reason: body.note || 'Early pay requested' });

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true, email: true, phone: true } });
    const name = user ? `${user.firstName} ${user.lastName}`.trim() : 'A worker';
    const emailed = await sendStaffShiftAlertEmail({
      subject: `Early pay request: ${name}, about £${(total / 100).toFixed(2)}`,
      replyTo: user?.email,
      html: `<h2 style="margin-bottom:4px">Early pay request</h2>
        <p><strong>${escHtml(name)}</strong>${user?.phone ? ` · ${escHtml(user.phone)}` : ''} asks to be paid early for shifts worked${payDays ? ` since the last pay day (${escHtml(payDays.last)})` : ''}.</p>
        <ul>${lines.map((l) => `<li>${escHtml(l)}</li>`).join('')}</ul>
        <p><strong>Estimated total: £${(total / 100).toFixed(2)}</strong> (all-in rates, holiday included, before tax and NI). Payroll decides the actual figure.</p>
        ${body.note ? `<p>They say: "${escHtml(body.note)}"</p>` : ''}
        <p style="color:#666;font-size:12px">Nothing has been paid or changed. Reply to them to agree or decline.</p>`,
    }).then((r) => Boolean(r?.success));
    res.json({ ok: true, data: { emailed, shifts: rows.length, estimatePence: total } });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ ok: false, error: 'That note is too long' });
    next(error);
  }
});

r.post('/:id/swap-request', async (req, res, next) => {
  try {
    const body = swapSchema.parse(req.body ?? {});
    const b = await prisma.booking.findFirst({ where: { id: req.params.id, staffId: req.auth!.userId }, select: alertSelect });
    if (!b) return res.status(404).json({ ok: false, error: 'Shift not found' });
    if (b.status !== 'CONFIRMED') return res.status(409).json({ ok: false, error: 'Only a confirmed shift can be swapped' });
    const startOfToday = new Date(); startOfToday.setUTCHours(0, 0, 0, 0);
    if (b.eventDate < startOfToday) return res.status(409).json({ ok: false, error: 'This shift has already happened' });
    const detail = `Asks to swap this shift. Reason: ${body.reason}.${body.colleague ? ` Suggests: ${body.colleague}.` : ' No one suggested.'} They stay booked until the office agrees a swap.`;
    if (b.opsBookingId) {
      const actor = await workerAppActor(req.auth!.userId, workerChannel(req));
      await writeAuditBestEffort(actor, {
        action: 'ASSIGNMENT_CHANGED', entityType: 'OpsBooking', entityId: b.opsBookingId,
        newValue: { assignmentId: b.id, swapRequested: true, suggested: body.colleague ?? null }, reason: detail,
      });
    }
    const emailed = await alertOffice(req.auth!.userId, b, 'Swap request', detail);
    res.json({ ok: true, data: { emailed } });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ ok: false, error: 'Tell us briefly why you want to swap' });
    next(error);
  }
});

export default r;
