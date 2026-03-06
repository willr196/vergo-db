import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { adminAuth } from "../middleware/adminAuth";
import { sendClientApprovalEmail, sendClientRejectionEmail } from "../services/email";
import { authLogger } from "../services/logger";

const r = Router();

// All routes require admin authentication
r.use(adminAuth);

// ============================================
// GET /api/v1/admin/clients - List all clients
// ============================================
const listQuerySchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]).optional(),
  subscriptionTier: z.enum(["STANDARD", "PREMIUM"]).optional(),
  subscriptionStatus: z.enum(["ACTIVE", "PAUSED", "CANCELLED", "EXPIRED"]).optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

r.get("/", async (req, res, next) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid query parameters" });
    }
    const query = parsed.data;
    const skip = (query.page - 1) * query.limit;
    
    const where: any = {};
    
    if (query.status) {
      where.status = query.status;
    }

    if (query.subscriptionTier) {
      where.subscriptionTier = query.subscriptionTier;
    }

    if (query.subscriptionStatus) {
      where.subscriptionStatus = query.subscriptionStatus;
    }
    
    if (query.search) {
      where.OR = [
        { companyName: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
        { contactName: { contains: query.search, mode: "insensitive" } }
      ];
    }
    
    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: query.limit,
        select: {
          id: true,
          companyName: true,
          industry: true,
          website: true,
          companySize: true,
          contactName: true,
          email: true,
          phone: true,
          jobTitle: true,
          status: true,
          emailVerified: true,
          approvedAt: true,
          approvedBy: true,
          rejectionReason: true,
          subscriptionTier: true,
          subscriptionStatus: true,
          subscriptionStartedAt: true,
          subscriptionExpiresAt: true,
          createdAt: true,
          lastLoginAt: true,
          _count: {
            select: { quoteRequests: true }
          }
        }
      }),
      prisma.client.count({ where })
    ]);
    
    const payload = {
      clients,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit)
      }
    };

    res.json({ ok: true, data: payload });

  } catch (error) {
    next(error);
  }
});

// ============================================
// GET /api/v1/admin/clients/stats - Dashboard stats
// ============================================
r.get("/stats", async (_req, res, next) => {
  try {
    const [pending, approved, rejected, suspended, total] = await Promise.all([
      prisma.client.count({ where: { status: "PENDING" } }),
      prisma.client.count({ where: { status: "APPROVED" } }),
      prisma.client.count({ where: { status: "REJECTED" } }),
      prisma.client.count({ where: { status: "SUSPENDED" } }),
      prisma.client.count()
    ]);
    
    // Recent registrations (last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const recentRegistrations = await prisma.client.count({
      where: { createdAt: { gte: weekAgo } }
    });
    
    const payload = {
      pending,
      approved,
      rejected,
      suspended,
      total,
      recentRegistrations
    };

    res.json({ ok: true, data: payload });

  } catch (error) {
    next(error);
  }
});

// ============================================
// GET /api/v1/admin/clients/:id - Get single client
// ============================================
r.get("/:id", async (req, res, next) => {
  try {
    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
      include: {
        quoteRequests: {
          orderBy: { createdAt: "desc" },
          take: 10
        }
      }
    });
    
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }
    
    // Remove sensitive fields
    const { passwordHash, verifyToken, resetToken, ...safeClient } = client;
    
    res.json({ ok: true, data: safeClient });

  } catch (error) {
    next(error);
  }
});

// ============================================
// POST /api/v1/admin/clients/:id/approve
// ============================================
r.post("/:id/approve", async (req, res, next) => {
  try {
    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
      select: { 
        id: true, 
        status: true, 
        email: true, 
        contactName: true, 
        companyName: true,
        emailVerified: true
      }
    });
    
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }
    
    if (!client.emailVerified) {
      return res.status(400).json({ error: "Client has not verified their email yet" });
    }
    
    if (client.status === "APPROVED") {
      return res.status(400).json({ error: "Client is already approved" });
    }
    
    const adminUsername = (req.session as any)?.username || "admin";
    
    await prisma.client.update({
      where: { id: req.params.id },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        approvedBy: adminUsername,
        rejectionReason: null
      }
    });
    
    // Send approval email
    sendClientApprovalEmail({
      to: client.email,
      name: client.contactName,
      companyName: client.companyName
    }).catch(err => {
      console.error("[EMAIL] Failed to send client approval:", err);
    });

    authLogger.info({ action: 'client_approved', admin: adminUsername, clientId: req.params.id, company: client.companyName }, 'Admin approved client');
    
    res.json({ ok: true, data: { message: "Client approved successfully" } });

  } catch (error) {
    next(error);
  }
});

// ============================================
// POST /api/v1/admin/clients/:id/reject
// ============================================
const rejectSchema = z.object({
  reason: z.string().max(500).optional()
});

r.post("/:id/reject", async (req, res, next) => {
  try {
    const parsed = rejectSchema.safeParse(req.body);
    const reason = parsed.success ? parsed.data.reason : undefined;
    
    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
      select: { 
        id: true, 
        status: true, 
        email: true, 
        contactName: true, 
        companyName: true 
      }
    });
    
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }
    
    await prisma.client.update({
      where: { id: req.params.id },
      data: {
        status: "REJECTED",
        rejectionReason: reason || null,
        approvedAt: null,
        approvedBy: null
      }
    });
    
    // Send rejection email
    sendClientRejectionEmail({
      to: client.email,
      name: client.contactName,
      companyName: client.companyName,
      reason
    }).catch(err => {
      console.error("[EMAIL] Failed to send client rejection:", err);
    });

    const adminUsername = (req.session as any)?.username || "admin";
    authLogger.info({ action: 'client_rejected', admin: adminUsername, clientId: req.params.id, company: client.companyName, reason }, 'Admin rejected client');
    
    res.json({ ok: true, data: { message: "Client rejected" } });

  } catch (error) {
    next(error);
  }
});

// ============================================
// POST /api/v1/admin/clients/:id/suspend
// ============================================
r.post("/:id/suspend", async (req, res, next) => {
  try {
    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true, companyName: true }
    });
    
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }
    
    await prisma.client.update({
      where: { id: req.params.id },
      data: { status: "SUSPENDED" }
    });
    
    const adminUsername = (req.session as any)?.username || "admin";
    authLogger.info({ action: 'client_suspended', admin: adminUsername, clientId: req.params.id, company: client.companyName }, 'Admin suspended client');
    
    res.json({ ok: true, data: { message: "Client suspended" } });

  } catch (error) {
    next(error);
  }
});

// ============================================
// POST /api/v1/admin/clients/:id/reinstate
// ============================================
r.post("/:id/reinstate", async (req, res, next) => {
  try {
    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true, companyName: true }
    });
    
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }
    
    if (client.status !== "SUSPENDED" && client.status !== "REJECTED") {
      return res.status(400).json({ error: "Client is not suspended or rejected" });
    }
    
    await prisma.client.update({
      where: { id: req.params.id },
      data: { 
        status: "APPROVED",
        rejectionReason: null
      }
    });
    
    const adminUsername = (req.session as any)?.username || "admin";
    authLogger.info({ action: 'client_reinstated', admin: adminUsername, clientId: req.params.id, company: client.companyName }, 'Admin reinstated client');
    
    res.json({ ok: true, data: { message: "Client reinstated" } });

  } catch (error) {
    next(error);
  }
});

// ============================================
// PUT /api/v1/admin/clients/:id/notes
// ============================================
const stripHtml = (str: string) => str.replace(/<[^>]*>/g, '');

const notesSchema = z.object({
  notes: z.string().max(2000).transform(stripHtml).optional()
});

r.put("/:id/notes", async (req, res, next) => {
  try {
    const parsed = notesSchema.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input" });
    }
    
    await prisma.client.update({
      where: { id: req.params.id },
      data: { adminNotes: parsed.data.notes || null }
    });
    
    res.json({ ok: true, data: { ok: true } });

  } catch (error) {
    next(error);
  }
});

// ============================================
// DELETE /api/v1/admin/clients/:id
// ============================================
r.delete("/:id", async (req, res, next) => {
  try {
    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
      select: { id: true, companyName: true }
    });
    
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }
    
    await prisma.client.delete({
      where: { id: req.params.id }
    });
    
    const adminUsername = (req.session as any)?.username || "admin";
    authLogger.info({ action: 'client_deleted', admin: adminUsername, clientId: req.params.id, company: client.companyName }, 'Admin deleted client');
    
    res.json({ ok: true, data: { message: "Client deleted" } });

  } catch (error) {
    next(error);
  }
});

export default r;
