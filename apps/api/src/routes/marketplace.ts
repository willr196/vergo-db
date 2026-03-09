import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireClientJwt } from "../middleware/jwtAuth";
import {
  resolveMarketplaceAccess,
  resolveMarketplaceBookingLane,
} from "../utils/marketplaceAccess";

const r = Router();

const browseStaffSchema = z.object({
  tier: z.enum(["STANDARD", "ELITE"]).optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

function maskName(firstName: string, lastName: string) {
  const initial = lastName?.charAt(0) || "";
  return `${firstName} ${initial}.`;
}

function parseFeatures(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function getApprovedClient(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      status: true,
      subscriptionTier: true,
      subscriptionStatus: true,
    },
  });

  if (!client) return null;
  if (client.status !== "APPROVED") return { error: "Client account not approved", code: 403 as const };

  return client;
}

const marketplaceStaffSelect = {
  id: true,
  firstName: true,
  lastName: true,
  staffTier: true,
  staffBio: true,
  staffAvatar: true,
  staffRating: true,
  staffReviewCount: true,
  staffHighlights: true,
} as const;

// GET /api/v1/marketplace/staff - Public browse (no pricing shown)
r.get("/staff", async (req, res, next) => {
  try {
    const query = browseStaffSchema.parse(req.query);
    const skip = (query.page - 1) * query.limit;

    const where: any = {
      staffAvailable: true,
      staffTier: { not: null },
      userType: "JOB_SEEKER",
    };

    if (query.tier) where.staffTier = query.tier;

    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: "insensitive" } },
        { lastName: { contains: query.search, mode: "insensitive" } },
        { staffBio: { contains: query.search, mode: "insensitive" } },
        { staffHighlights: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const [staff, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: [{ staffTier: "desc" }, { staffRating: "desc" }],
        skip,
        take: query.limit,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          staffTier: true,
          staffBio: true,
          staffAvatar: true,
          staffRating: true,
          staffReviewCount: true,
          staffHighlights: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    const shaped = staff.map((s) => ({
      id: s.id,
      name: maskName(s.firstName, s.lastName),
      tier: s.staffTier,
      bookingLane: resolveMarketplaceBookingLane(s.staffTier),
      bio: s.staffBio,
      avatar: s.staffAvatar,
      rating: s.staffRating ? Number(s.staffRating) : null,
      reviewCount: s.staffReviewCount,
      highlights: s.staffHighlights,
    }));

    res.json({
      ok: true,
      data: {
        staff: shaped,
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

// GET /api/v1/marketplace/staff/pricing - Client browse with pricing by subscription tier
r.get("/staff/pricing", requireClientJwt, async (req, res, next) => {
  try {
    const query = browseStaffSchema.parse(req.query);
    const skip = (query.page - 1) * query.limit;

    const client = await getApprovedClient(req.auth!.userId);

    if (!client) {
      return res.status(404).json({ ok: false, error: "Client not found" });
    }
    if ("error" in client) {
      return res.status(client.code).json({ ok: false, error: client.error });
    }

    const access = resolveMarketplaceAccess(client);

    const pricing = await prisma.pricingTier.findMany({
      where: { clientTier: access.effectiveTier },
      select: { staffTier: true, hourlyRate: true, isBookable: true },
    });

    const pricingMap = new Map(
      pricing.map((p) => [
        p.staffTier,
        { hourlyRate: Number(p.hourlyRate), isBookable: p.isBookable },
      ])
    );

    const where: any = {
      staffAvailable: true,
      staffTier: { not: null },
      userType: "JOB_SEEKER",
    };

    if (query.tier) where.staffTier = query.tier;

    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: "insensitive" } },
        { lastName: { contains: query.search, mode: "insensitive" } },
        { staffBio: { contains: query.search, mode: "insensitive" } },
        { staffHighlights: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const [staff, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: [{ staffTier: "desc" }, { staffRating: "desc" }],
        skip,
        take: query.limit,
        select: marketplaceStaffSelect,
      }),
      prisma.user.count({ where }),
    ]);

    const shaped = staff.map((s) => {
      const tierPricing = s.staffTier ? pricingMap.get(s.staffTier) : null;
      return {
        id: s.id,
        name: maskName(s.firstName, s.lastName),
        tier: s.staffTier,
        bookingLane: resolveMarketplaceBookingLane(s.staffTier),
        bio: s.staffBio,
        avatar: s.staffAvatar,
        rating: s.staffRating ? Number(s.staffRating) : null,
        reviewCount: s.staffReviewCount,
        highlights: s.staffHighlights,
        hourlyRate: tierPricing?.hourlyRate ?? null,
        isBookable: tierPricing?.isBookable ?? false,
      };
    });

    res.json({
      ok: true,
      data: {
        clientTier: access.effectiveTier,
        marketplaceAccessLane: access.marketplaceAccessLane,
        subscriptionTier: access.subscriptionTier,
        subscriptionStatus: access.subscriptionStatus,
        premiumAccessActive: access.hasActivePremium,
        staff: shaped,
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

// GET /api/v1/marketplace/staff/:id/pricing - Client profile detail with pricing by entitlement
r.get("/staff/:id/pricing", requireClientJwt, async (req, res, next) => {
  try {
    const client = await getApprovedClient(req.auth!.userId);
    if (!client) {
      return res.status(404).json({ ok: false, error: "Client not found" });
    }
    if ("error" in client) {
      return res.status(client.code).json({ ok: false, error: client.error });
    }

    const access = resolveMarketplaceAccess(client);

    const staff = await prisma.user.findFirst({
      where: {
        id: req.params.id,
        staffAvailable: true,
        staffTier: { not: null },
        userType: "JOB_SEEKER",
      },
      select: marketplaceStaffSelect,
    });

    if (!staff || !staff.staffTier) {
      return res.status(404).json({ ok: false, error: "Staff member not found" });
    }

    const pricing = await prisma.pricingTier.findUnique({
      where: {
        clientTier_staffTier: {
          clientTier: access.effectiveTier,
          staffTier: staff.staffTier,
        },
      },
      select: {
        hourlyRate: true,
        isBookable: true,
      },
    });

    res.json({
      ok: true,
      data: {
        id: staff.id,
        name: maskName(staff.firstName, staff.lastName),
        tier: staff.staffTier,
        bookingLane: resolveMarketplaceBookingLane(staff.staffTier),
        bio: staff.staffBio,
        avatar: staff.staffAvatar,
        rating: staff.staffRating ? Number(staff.staffRating) : null,
        reviewCount: staff.staffReviewCount,
        highlights: staff.staffHighlights,
        hourlyRate: pricing ? Number(pricing.hourlyRate) : null,
        isBookable: pricing?.isBookable ?? false,
        clientTier: access.effectiveTier,
        marketplaceAccessLane: access.marketplaceAccessLane,
        subscriptionTier: access.subscriptionTier,
        subscriptionStatus: access.subscriptionStatus,
        premiumAccessActive: access.hasActivePremium,
      },
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/v1/marketplace/staff/:id - Public profile detail
r.get("/staff/:id", async (req, res, next) => {
  try {
    const staff = await prisma.user.findFirst({
      where: {
        id: req.params.id,
        staffAvailable: true,
        staffTier: { not: null },
        userType: "JOB_SEEKER",
      },
      select: marketplaceStaffSelect,
    });

    if (!staff) {
      return res.status(404).json({ ok: false, error: "Staff member not found" });
    }

    res.json({
      ok: true,
      data: {
        id: staff.id,
        name: maskName(staff.firstName, staff.lastName),
        tier: staff.staffTier,
        bookingLane: resolveMarketplaceBookingLane(staff.staffTier),
        bio: staff.staffBio,
        avatar: staff.staffAvatar,
        rating: staff.staffRating ? Number(staff.staffRating) : null,
        reviewCount: staff.staffReviewCount,
        highlights: staff.staffHighlights,
      },
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/v1/marketplace/pricing - Public pricing display
r.get("/pricing", async (_req, res, next) => {
  try {
    const [plans, tiers] = await Promise.all([
      prisma.subscriptionPlan.findMany({
        where: { isActive: true },
        orderBy: { weeklyPrice: "asc" },
      }),
      prisma.pricingTier.findMany({
        orderBy: [{ clientTier: "asc" }, { staffTier: "asc" }],
      }),
    ]);

    res.json({
      ok: true,
      data: {
        plans: plans.map((p) => ({
          tier: p.tier,
          marketplaceAccessLane: p.tier === "PREMIUM" ? "SELECT" : "FLEX",
          name: p.name,
          weeklyPrice: Number(p.weeklyPrice),
          monthlyPrice: p.monthlyPrice ? Number(p.monthlyPrice) : null,
          annualPrice: p.annualPrice ? Number(p.annualPrice) : null,
          features: parseFeatures(p.features),
        })),
        hourlyRates: tiers.map((t) => ({
          clientTier: t.clientTier,
          marketplaceAccessLane: t.clientTier === "PREMIUM" ? "SELECT" : "FLEX",
          staffTier: t.staffTier,
          bookingLane: resolveMarketplaceBookingLane(t.staffTier),
          hourlyRate: Number(t.hourlyRate),
          isBookable: t.isBookable,
        })),
      },
    });
  } catch (e) {
    next(e);
  }
});

export default r;
