import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma";
import { adminAuth } from "../middleware/adminAuth";

const r = Router();
r.use(adminAuth);

const updateStaffTierSchema = z.object({
  staffTier: z.enum(["STANDARD", "ELITE"]).nullable(),
  staffAvailable: z.boolean().optional(),
  staffBio: z.string().max(1000).optional(),
  staffHighlights: z.string().max(500).optional(),
});

const listStaffSchema = z.object({
  tier: z.enum(["STANDARD", "ELITE", "UNASSIGNED"]).optional(),
  available: z.enum(["true", "false"]).optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const updatePricingSchema = z.object({
  hourlyRate: z.number().positive().max(1000),
  staffPayRate: z.number().positive().max(1000).optional(),
  isBookable: z.boolean().optional(),
});

const updatePlanSchema = z.object({
  weeklyPrice: z.number().min(0).max(10000).optional(),
  monthlyPrice: z.number().min(0).max(50000).optional(),
  annualPrice: z.number().min(0).max(500000).optional(),
  features: z.string().max(2000).optional(),
  isActive: z.boolean().optional(),
});

const updateClientSubSchema = z.object({
  subscriptionTier: z.enum(["STANDARD", "PREMIUM"]),
  subscriptionStatus: z.enum(["ACTIVE", "PAUSED", "CANCELLED", "EXPIRED"]).optional(),
  subscriptionExpiresAt: z.string().datetime().optional(),
});

// PUT /api/v1/admin/marketplace/staff/:id/tier - Set staff tier + marketplace visibility
r.put("/staff/:id/tier", async (req, res, next) => {
  try {
    const data = updateStaffTierSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, userType: true, firstName: true, lastName: true },
    });

    if (!user) return res.status(404).json({ ok: false, error: "User not found" });
    if (user.userType !== "JOB_SEEKER") {
      return res.status(400).json({ ok: false, error: "Only job seekers can be assigned staff tiers" });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        staffTier: data.staffTier,
        staffAvailable: data.staffAvailable,
        staffBio: data.staffBio,
        staffHighlights: data.staffHighlights,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        staffTier: true,
        staffAvailable: true,
        staffBio: true,
        staffHighlights: true,
        staffRating: true,
        staffReviewCount: true,
      },
    });

    console.log(
      `[ADMIN] Staff tier updated: ${user.firstName} ${user.lastName} -> ${data.staffTier} | By: ${req.session.username}`
    );
    res.json({ ok: true, data: updated });
  } catch (e) {
    next(e);
  }
});

// GET /api/v1/admin/marketplace/staff - List all marketplace staff (for admin)
r.get("/staff", async (req, res, next) => {
  try {
    const query = listStaffSchema.parse(req.query);
    const skip = (query.page - 1) * query.limit;

    const where: any = { userType: "JOB_SEEKER" };
    if (query.tier === "UNASSIGNED") where.staffTier = null;
    else if (query.tier) where.staffTier = query.tier;
    if (query.available === "true") where.staffAvailable = true;
    if (query.available === "false") where.staffAvailable = false;

    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: "insensitive" } },
        { lastName: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const [staff, total, totalMarketplace, standardCount, eliteCount, unassignedCount] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: query.limit,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          staffTier: true,
          staffAvailable: true,
          staffBio: true,
          staffHighlights: true,
          staffRating: true,
          staffReviewCount: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
      prisma.user.count({ where: { userType: "JOB_SEEKER", staffTier: { not: null } } }),
      prisma.user.count({ where: { userType: "JOB_SEEKER", staffTier: "STANDARD" } }),
      prisma.user.count({ where: { userType: "JOB_SEEKER", staffTier: "ELITE" } }),
      prisma.user.count({ where: { userType: "JOB_SEEKER", staffTier: null } }),
    ]);

    res.json({
      ok: true,
      data: {
        staff,
        stats: {
          totalMarketplace,
          standardCount,
          eliteCount,
          unassignedCount,
        },
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

// GET /api/v1/admin/marketplace/pricing - Get full pricing matrix
r.get("/pricing", async (_req, res, next) => {
  try {
    const [tiers, plans] = await Promise.all([
      prisma.pricingTier.findMany({ orderBy: [{ clientTier: "asc" }, { staffTier: "asc" }] }),
      prisma.subscriptionPlan.findMany({ orderBy: { weeklyPrice: "asc" } }),
    ]);

    res.json({
      ok: true,
      data: {
        pricingTiers: tiers.map((t) => ({
          id: t.id,
          clientTier: t.clientTier,
          staffTier: t.staffTier,
          hourlyRate: Number(t.hourlyRate),
          staffPayRate: t.staffPayRate ? Number(t.staffPayRate) : null,
          isBookable: t.isBookable,
        })),
        subscriptionPlans: plans.map((p) => ({
          id: p.id,
          tier: p.tier,
          name: p.name,
          weeklyPrice: Number(p.weeklyPrice),
          monthlyPrice: p.monthlyPrice ? Number(p.monthlyPrice) : null,
          annualPrice: p.annualPrice ? Number(p.annualPrice) : null,
          features: p.features,
          isActive: p.isActive,
        })),
      },
    });
  } catch (e) {
    next(e);
  }
});

// PUT /api/v1/admin/marketplace/pricing/:id - Update a pricing tier row
r.put("/pricing/:id", async (req, res, next) => {
  try {
    const data = updatePricingSchema.parse(req.body);

    const updated = await prisma.pricingTier.update({
      where: { id: req.params.id },
      data: {
        hourlyRate: new Prisma.Decimal(data.hourlyRate),
        staffPayRate: data.staffPayRate != null ? new Prisma.Decimal(data.staffPayRate) : undefined,
        isBookable: data.isBookable,
      },
    });

    console.log(
      `[ADMIN] Pricing updated: ${updated.clientTier}x${updated.staffTier} -> £${data.hourlyRate}/hr | By: ${req.session.username}`
    );
    res.json({
      ok: true,
      data: {
        ...updated,
        hourlyRate: Number(updated.hourlyRate),
        staffPayRate: updated.staffPayRate ? Number(updated.staffPayRate) : null,
      },
    });
  } catch (e) {
    next(e);
  }
});

// PUT /api/v1/admin/marketplace/plans/:id - Update subscription plan pricing
r.put("/plans/:id", async (req, res, next) => {
  try {
    const data = updatePlanSchema.parse(req.body);

    const updated = await prisma.subscriptionPlan.update({
      where: { id: req.params.id },
      data: {
        weeklyPrice: data.weeklyPrice != null ? new Prisma.Decimal(data.weeklyPrice) : undefined,
        monthlyPrice: data.monthlyPrice != null ? new Prisma.Decimal(data.monthlyPrice) : undefined,
        annualPrice: data.annualPrice != null ? new Prisma.Decimal(data.annualPrice) : undefined,
        features: data.features,
        isActive: data.isActive,
      },
    });

    console.log(`[ADMIN] Plan updated: ${updated.name} | By: ${req.session.username}`);
    res.json({
      ok: true,
      data: {
        ...updated,
        weeklyPrice: Number(updated.weeklyPrice),
        monthlyPrice: updated.monthlyPrice ? Number(updated.monthlyPrice) : null,
        annualPrice: updated.annualPrice ? Number(updated.annualPrice) : null,
      },
    });
  } catch (e) {
    next(e);
  }
});

// PUT /api/v1/admin/marketplace/clients/:id/subscription - Update client's subscription tier
r.put("/clients/:id/subscription", async (req, res, next) => {
  try {
    const data = updateClientSubSchema.parse(req.body);

    const client = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!client) return res.status(404).json({ ok: false, error: "Client not found" });

    const updateData: any = {
      subscriptionTier: data.subscriptionTier,
      subscriptionStatus: data.subscriptionStatus,
    };

    if (data.subscriptionTier === "PREMIUM" && client.subscriptionTier === "STANDARD") {
      updateData.subscriptionStartedAt = new Date();
    }

    if (data.subscriptionExpiresAt) {
      updateData.subscriptionExpiresAt = new Date(data.subscriptionExpiresAt);
    }

    const updated = await prisma.client.update({
      where: { id: client.id },
      data: updateData,
      select: {
        id: true,
        companyName: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        subscriptionStartedAt: true,
        subscriptionExpiresAt: true,
      },
    });

    console.log(
      `[ADMIN] Client subscription updated: ${client.companyName} -> ${data.subscriptionTier} | By: ${req.session.username}`
    );
    res.json({ ok: true, data: updated });
  } catch (e) {
    next(e);
  }
});

export default r;
