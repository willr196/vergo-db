import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { adminAuth } from "../middleware/adminAuth";

const r = Router();
r.use(adminAuth);

const listQuerySchema = z.object({
  status: z.string().optional(),
  search: z.string().max(100).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

// GET /api/v1/admin/quotes/stats — must be before /:id
r.get("/stats", async (_req, res, next) => {
  try {
    const [counts, revenue] = await Promise.all([
      prisma.quoteRequest.groupBy({ by: ["status"], _count: { id: true } }),
      prisma.quoteRequest.aggregate({
        where: { quotedAmount: { not: null } },
        _sum: { quotedAmount: true },
      }),
    ]);

    const countMap: Record<string, number> = {};
    counts.forEach((row) => { countMap[row.status] = row._count.id; });

    res.json({
      ok: true,
      data: {
        total: Object.values(countMap).reduce((a, b) => a + b, 0),
        new: countMap["NEW"] || 0,
        quoted: countMap["QUOTED"] || 0,
        accepted: countMap["ACCEPTED"] || 0,
        completed: countMap["COMPLETED"] || 0,
        declined: countMap["DECLINED"] || 0,
        totalQuotedValue: Number(revenue._sum.quotedAmount || 0),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/quotes
r.get("/", async (req, res, next) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const skip = (query.page - 1) * query.limit;

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
    }
    if (query.search) {
      where.OR = [
        { eventType: { contains: query.search, mode: "insensitive" } },
        { location: { contains: query.search, mode: "insensitive" } },
        { client: { companyName: { contains: query.search, mode: "insensitive" } } },
      ];
    }

    const [quotes, total] = await Promise.all([
      prisma.quoteRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: query.limit,
        include: {
          client: {
            select: { companyName: true, contactName: true, email: true },
          },
        },
      }),
      prisma.quoteRequest.count({ where }),
    ]);

    res.json({
      ok: true,
      data: {
        quotes,
        pagination: {
          total,
          page: query.page,
          limit: query.limit,
          pages: Math.ceil(total / query.limit),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/quotes/:id
r.get("/:id", async (req, res, next) => {
  try {
    const quote = await prisma.quoteRequest.findUnique({
      where: { id: req.params.id },
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
            contactName: true,
            email: true,
            phone: true,
            status: true,
          },
        },
      },
    });
    if (!quote) return res.status(404).json({ error: "Quote not found" });
    res.json({ ok: true, data: quote });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/admin/quotes/:id/status
const statusSchema = z.object({
  status: z.enum(["NEW", "QUOTED", "ACCEPTED", "DECLINED", "COMPLETED"]),
  adminNotes: z.string().max(2000).optional(),
});

r.patch("/:id/status", async (req, res, next) => {
  try {
    const { status, adminNotes } = statusSchema.parse(req.body);
    const extra: any = {};
    if (status === "QUOTED") extra.quoteSentAt = new Date();

    const updated = await prisma.quoteRequest.update({
      where: { id: req.params.id },
      data: { status, adminNotes: adminNotes ?? undefined, ...extra },
    });
    res.json({ ok: true, data: updated });
  } catch (err: any) {
    if (err?.code === "P2025") return res.status(404).json({ error: "Quote not found" });
    next(err);
  }
});

// PATCH /api/v1/admin/quotes/:id/quoted-amount
const amountSchema = z.object({
  quotedAmount: z.number().nonnegative().nullable(),
});

r.patch("/:id/quoted-amount", async (req, res, next) => {
  try {
    const { quotedAmount } = amountSchema.parse(req.body);
    const updated = await prisma.quoteRequest.update({
      where: { id: req.params.id },
      data: { quotedAmount: quotedAmount ?? null },
    });
    res.json({ ok: true, data: updated });
  } catch (err: any) {
    if (err?.code === "P2025") return res.status(404).json({ error: "Quote not found" });
    next(err);
  }
});

// PUT /api/v1/admin/quotes/:id/notes
const notesSchema = z.object({
  adminNotes: z.string().max(2000),
});

r.put("/:id/notes", async (req, res, next) => {
  try {
    const { adminNotes } = notesSchema.parse(req.body);
    const updated = await prisma.quoteRequest.update({
      where: { id: req.params.id },
      data: { adminNotes },
    });
    res.json({ ok: true, data: updated });
  } catch (err: any) {
    if (err?.code === "P2025") return res.status(404).json({ error: "Quote not found" });
    next(err);
  }
});

export default r;
