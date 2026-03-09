import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireClientJwt } from "../middleware/jwtAuth";
import {
  premiumAccessErrorMessage,
  resolveMarketplaceAccess,
  resolveMarketplaceBookingLane,
} from "../utils/marketplaceAccess";

const r = Router();
r.use(requireClientJwt);

const createBookingSchema = z.object({
  staffId: z.string().min(1),
  eventName: z.string().max(200).optional(),
  eventDate: z.string().datetime(),
  eventEndDate: z.string().datetime().optional(),
  location: z.string().min(1).max(200),
  venue: z.string().max(200).optional(),
  shiftStart: z.string().regex(/^\d{2}:\d{2}$/),
  shiftEnd: z.string().regex(/^\d{2}:\d{2}$/),
  hoursEstimated: z.number().positive().max(24).optional(),
  clientNotes: z.string().max(2000).optional(),
});

const listBookingsSchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "REJECTED", "CANCELLED", "COMPLETED", "NO_SHOW"]).optional(),
  bookingLane: z.enum(["FLEX", "SELECT", "MANAGED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const TIME_24H_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function maskedName(firstName: string, lastName: string) {
  return `${firstName} ${lastName.charAt(0)}.`;
}

function parseDateString(value: string, fieldName: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} must be a valid date`);
  }
  return parsed;
}

function computeHoursFromShift(shiftStart: string, shiftEnd: string) {
  const start = shiftStart.match(TIME_24H_REGEX);
  const end = shiftEnd.match(TIME_24H_REGEX);

  if (!start || !end) {
    throw new Error("Shift times must use HH:mm format");
  }

  const startMinutes = Number(start[1]) * 60 + Number(start[2]);
  const endMinutes = Number(end[1]) * 60 + Number(end[2]);

  if (startMinutes === endMinutes) {
    throw new Error("shiftEnd must be different from shiftStart");
  }

  let diff = endMinutes - startMinutes;
  if (diff < 0) diff += 24 * 60;

  return Number((diff / 60).toFixed(2));
}

// POST /api/v1/bookings - Create booking request
r.post("/", async (req, res, next) => {
  try {
    const data = createBookingSchema.parse(req.body);
    const clientId = req.auth!.userId;

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        status: true,
      },
    });

    if (!client || client.status !== "APPROVED") {
      return res.status(403).json({ ok: false, error: "Client account not approved" });
    }

    const access = resolveMarketplaceAccess(client);
    const eventDate = parseDateString(data.eventDate, "eventDate");
    const eventEndDate = data.eventEndDate
      ? parseDateString(data.eventEndDate, "eventEndDate")
      : null;

    if (eventEndDate && eventEndDate < eventDate) {
      return res.status(400).json({ ok: false, error: "eventEndDate cannot be before eventDate" });
    }

    const staff = await prisma.user.findFirst({
      where: {
        id: data.staffId,
        staffAvailable: true,
        staffTier: { not: null },
        userType: "JOB_SEEKER",
      },
      select: {
        id: true,
        staffTier: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!staff || !staff.staffTier) {
      return res.status(404).json({ ok: false, error: "Staff member not found or unavailable" });
    }

    if (staff.staffTier === "ELITE" && access.premiumInactive) {
      return res.status(403).json({
        ok: false,
        error: premiumAccessErrorMessage(),
        code: "SUBSCRIPTION_NOT_ACTIVE",
      });
    }

    const pricing = await prisma.pricingTier.findUnique({
      where: {
        clientTier_staffTier: {
          clientTier: access.effectiveTier,
          staffTier: staff.staffTier,
        },
      },
    });

    if (!pricing || !pricing.isBookable) {
      const code =
        staff.staffTier === "ELITE" && access.premiumInactive
          ? "SUBSCRIPTION_NOT_ACTIVE"
          : "TIER_RESTRICTED";
      return res.status(403).json({
        ok: false,
        error:
          code === "SUBSCRIPTION_NOT_ACTIVE"
            ? premiumAccessErrorMessage()
            : "Your current marketplace access cannot book this staff level. Upgrade to Select access to unlock the Select pool.",
        code,
      });
    }

    const computedHours =
      data.hoursEstimated != null ? data.hoursEstimated : computeHoursFromShift(data.shiftStart, data.shiftEnd);
    const hoursEstimated = new Prisma.Decimal(computedHours);
    const totalEstimated =
      new Prisma.Decimal((Number(pricing.hourlyRate) * computedHours).toFixed(2));
    const bookingLane = resolveMarketplaceBookingLane(staff.staffTier);

    if (!bookingLane) {
      return res.status(400).json({ ok: false, error: "Staff member is not assigned to a marketplace lane" });
    }

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
        clientNotes: data.clientNotes,
        bookingLane,
        clientTierAtBooking: access.effectiveTier,
        staffTierAtBooking: staff.staffTier,
        hourlyRateCharged: pricing.hourlyRate,
        staffPayRate: pricing.staffPayRate,
        totalEstimated,
      },
      include: {
        staff: {
          select: { id: true, firstName: true, lastName: true, staffTier: true },
        },
      },
    });

    console.log(
      `[BOOKING] New request: ${booking.id} | Client: ${clientId} | Staff: ${staff.firstName} ${staff.lastName} (${staff.staffTier}) | Rate: £${pricing.hourlyRate}/hr`
    );

    res.status(201).json({
      ok: true,
      data: {
        id: booking.id,
        status: booking.status,
        bookingLane: booking.bookingLane,
        eventDate: booking.eventDate,
        location: booking.location,
        hourlyRate: Number(booking.hourlyRateCharged),
        totalEstimated: booking.totalEstimated ? Number(booking.totalEstimated) : null,
        marketplaceAccessLane: access.marketplaceAccessLane,
        staff: {
          id: staff.id,
          name: maskedName(staff.firstName, staff.lastName),
          tier: staff.staffTier,
        },
      },
    });
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message.includes("valid date") ||
        e.message.includes("Shift times") ||
        e.message.includes("shiftEnd"))
    ) {
      return res.status(400).json({ ok: false, error: e.message });
    }
    next(e);
  }
});

// GET /api/v1/bookings - List client's bookings
r.get("/", async (req, res, next) => {
  try {
    const query = listBookingsSchema.parse(req.query);
    const clientId = req.auth!.userId;
    const skip = (query.page - 1) * query.limit;

    const where: any = { clientId };
    if (query.status) where.status = query.status;
    if (query.bookingLane) where.bookingLane = query.bookingLane;

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: query.limit,
        include: {
          staff: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              staffTier: true,
              staffAvatar: true,
              staffRating: true,
            },
          },
        },
      }),
      prisma.booking.count({ where }),
    ]);

    const shaped = bookings.map((b) => ({
      id: b.id,
      status: b.status,
      bookingLane: b.bookingLane,
      eventName: b.eventName,
      eventDate: b.eventDate,
      location: b.location,
      venue: b.venue,
      shiftStart: b.shiftStart,
      shiftEnd: b.shiftEnd,
      hourlyRate: Number(b.hourlyRateCharged),
      totalEstimated: b.totalEstimated ? Number(b.totalEstimated) : null,
      createdAt: b.createdAt,
      confirmedAt: b.confirmedAt,
      staff: {
        id: b.staff.id,
        name: maskedName(b.staff.firstName, b.staff.lastName),
        tier: b.staff.staffTier,
        avatar: b.staff.staffAvatar,
        rating: b.staff.staffRating ? Number(b.staff.staffRating) : null,
      },
    }));

    res.json({
      ok: true,
      data: {
        bookings: shaped,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      },
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/v1/bookings/:id - Get booking detail
r.get("/:id", async (req, res, next) => {
  try {
    const booking = await prisma.booking.findFirst({
      where: { id: req.params.id, clientId: req.auth!.userId },
      include: {
        staff: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            staffTier: true,
            staffAvatar: true,
            staffRating: true,
            staffBio: true,
            staffHighlights: true,
          },
        },
      },
    });

    if (!booking) {
      return res.status(404).json({ ok: false, error: "Booking not found" });
    }

    res.json({
      ok: true,
      data: {
        id: booking.id,
        status: booking.status,
        bookingLane: booking.bookingLane,
        eventName: booking.eventName,
        eventDate: booking.eventDate,
        eventEndDate: booking.eventEndDate,
        location: booking.location,
        venue: booking.venue,
        shiftStart: booking.shiftStart,
        shiftEnd: booking.shiftEnd,
        hoursEstimated: booking.hoursEstimated ? Number(booking.hoursEstimated) : null,
        hourlyRate: Number(booking.hourlyRateCharged),
        totalEstimated: booking.totalEstimated ? Number(booking.totalEstimated) : null,
        clientNotes: booking.clientNotes,
        rejectionReason: booking.rejectionReason,
        createdAt: booking.createdAt,
        confirmedAt: booking.confirmedAt,
        completedAt: booking.completedAt,
        staff: {
          id: booking.staff.id,
          name: maskedName(booking.staff.firstName, booking.staff.lastName),
          tier: booking.staff.staffTier,
          avatar: booking.staff.staffAvatar,
          rating: booking.staff.staffRating ? Number(booking.staff.staffRating) : null,
          bio: booking.staff.staffBio,
          highlights: booking.staff.staffHighlights,
        },
      },
    });
  } catch (e) {
    next(e);
  }
});

// POST /api/v1/bookings/:id/cancel - Client cancels a booking
r.post("/:id/cancel", async (req, res, next) => {
  try {
    const booking = await prisma.booking.findFirst({
      where: { id: req.params.id, clientId: req.auth!.userId },
    });

    if (!booking) {
      return res.status(404).json({ ok: false, error: "Booking not found" });
    }

    if (!["PENDING", "CONFIRMED"].includes(booking.status)) {
      return res.status(400).json({ ok: false, error: "This booking cannot be cancelled" });
    }

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: { status: "CANCELLED" },
    });

    console.log(`[BOOKING] Cancelled by client: ${booking.id}`);

    res.json({ ok: true, data: { id: updated.id, status: updated.status } });
  } catch (e) {
    next(e);
  }
});

export default r;
