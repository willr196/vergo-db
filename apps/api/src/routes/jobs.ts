import { Router, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../prisma";
import { adminAuth } from "../middleware/adminAuth";
import { optionalUser } from "../middleware/userAuth";
import {
  sendJobApprovalEmail,
  sendJobRejectionEmail,
  sendJobSubmissionNotification,
} from "../services/email";

const r = Router();

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many job submissions. Please try again later." },
});

// ============================================
// VALIDATION SCHEMAS
// ============================================
const createJobSchema = z.object({
  title: z.string().min(3).max(200).trim(),
  description: z.string().min(10).max(5000).trim(),
  requirements: z.string().max(2000).trim().nullable().optional(),
  type: z.enum(["INTERNAL", "EXTERNAL"]).default("INTERNAL"),
  tier: z.enum(["STANDARD", "SHORTLIST", "GOLD"]).default("STANDARD"),
  status: z.enum(["DRAFT", "OPEN", "FILLED", "CLOSED"]).default("DRAFT"),
  location: z.string().min(2).max(200).trim(),
  venue: z.string().max(200).trim().nullable().optional(),
  payRate: z.number().positive().max(1000).nullable().optional(),
  payType: z.enum(["HOURLY", "DAILY", "FIXED"]).default("HOURLY"),
  eventDate: z.string().nullable().optional(), // ISO date string
  eventEndDate: z.string().nullable().optional(),
  shiftStart: z.string().max(10).trim().nullable().optional(), // "18:00"
  shiftEnd: z.string().max(10).trim().nullable().optional(),
  staffNeeded: z.number().int().min(1).max(100).default(1),
  companyName: z.string().max(200).trim().nullable().optional(), // For external jobs
  externalUrl: z.string().url().max(500).trim().nullable().optional(),
  closingDate: z.string().nullable().optional(),
  roleId: z.string().min(1)
});

const updateJobSchema = createJobSchema.partial();

const optionalTrimmedString = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }, schema.optional());

const submitJobSchema = z.object({
  companyName: z.string().min(2).max(200).trim(),
  posterEmail: z.string().email().max(255).trim(),
  title: z.string().min(3).max(200).trim(),
  roleId: z.string().min(1),
  location: z.string().min(2).max(200).trim(),
  description: z.string().min(20).max(5000).trim(),
  payRateMin: z.number().positive().max(1000).optional(),
  payRateMax: z.number().positive().max(1000).optional(),
  payType: z.enum(["HOURLY", "DAILY", "FIXED"]).default("HOURLY"),
  applyEmail: optionalTrimmedString(z.string().email().max(255)),
  externalUrl: optionalTrimmedString(z.string().url().max(500)),
  website: z.preprocess((value) => value === "" ? undefined : value, z.string().max(200).optional()),
  confirm: z.literal(true, {
    errorMap: () => ({ message: "You must confirm the information is accurate" }),
  }),
}).superRefine((data, ctx) => {
  const hasApplyEmail = Boolean(data.applyEmail);
  const hasExternalUrl = Boolean(data.externalUrl);

  if (!hasApplyEmail && !hasExternalUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["applyEmail"],
      message: "Provide an application email or external URL",
    });
  }

  if (hasApplyEmail && hasExternalUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["externalUrl"],
      message: "Choose either an application email or an external URL",
    });
  }
});

const listJobsQuerySchema = z.object({
  status: z.enum(["PENDING", "DRAFT", "OPEN", "FILLED", "CLOSED"]).optional(),
  type: z.enum(["INTERNAL", "EXTERNAL"]).optional(),
  tier: z.enum(["STANDARD", "SHORTLIST", "GOLD"]).optional(),
  roleId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

function isPendingExternalSubmission(job: { status: string }) {
  return job.status === "PENDING";
}

// ============================================
// PUBLIC: GET /api/v1/jobs - List open jobs
// ============================================
r.get("/", optionalUser, async (req, res, next) => {
  try {
    const query = listJobsQuerySchema.parse(req.query);
    const skip = (query.page - 1) * query.limit;
    
    // Public can only see OPEN jobs
    const where: any = { status: "OPEN" };
    
    if (query.type) where.type = query.type;
    if (query.roleId) where.roleId = query.roleId;
    
    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: [
          { eventDate: "asc" },
          { createdAt: "desc" }
        ],
        skip,
        take: query.limit,
        include: {
          role: {
            select: { id: true, name: true }
          },
          _count: {
            select: { applications: true }
          }
        }
      }),
      prisma.job.count({ where })
    ]);
    
    // Shape response (hide sensitive fields)
    const shaped = jobs.map(job => ({
      id: job.id,
      title: job.title,
      description: job.description,
      requirements: job.requirements,
      type: job.type,
      tier: job.tier,
      location: job.location,
      venue: job.venue,
      payRate: job.payRate ? Number(job.payRate) : null,
      payType: job.payType,
      eventDate: job.eventDate,
      eventEndDate: job.eventEndDate,
      shiftStart: job.shiftStart,
      shiftEnd: job.shiftEnd,
      staffNeeded: job.staffNeeded,
      staffConfirmed: job.staffConfirmed,
      spotsLeft: job.staffNeeded - job.staffConfirmed,
      companyName: job.companyName,
      externalUrl: job.externalUrl,
      closingDate: job.closingDate,
      publishedAt: job.publishedAt,
      role: job.role,
      applicationCount: job._count.applications
    }));
    
    const payload = {
      jobs: shaped,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit)
      }
    };

    res.json({ ok: true, ...payload, data: payload });
    
  } catch (error) {
    next(error);
  }
});

// ============================================
// PUBLIC: GET /api/v1/jobs/roles - Get available roles
// ============================================
r.get("/meta/roles", optionalUser, async (req, res, next) => {
  try {
    const roles = await prisma.role.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true }
    });
    
    res.json({ ok: true, roles, data: roles });
  } catch (error) {
    next(error);
  }
});

// ============================================
// PUBLIC: GET /api/v1/jobs/:id - Get single job
// ============================================
r.get("/:id", optionalUser, async (req, res, next) => {
  try {
    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
      include: {
        role: {
          select: { id: true, name: true }
        },
        _count: {
          select: { applications: true }
        }
      }
    });
    
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    // Only show if OPEN (unless admin - handled by different route)
    if (job.status !== "OPEN") {
      return res.status(404).json({ error: "Job not found" });
    }
    
    const payload = {
      id: job.id,
      title: job.title,
      description: job.description,
      requirements: job.requirements,
      type: job.type,
      tier: job.tier,
      status: job.status,
      location: job.location,
      venue: job.venue,
      payRate: job.payRate ? Number(job.payRate) : null,
      payType: job.payType,
      eventDate: job.eventDate,
      eventEndDate: job.eventEndDate,
      shiftStart: job.shiftStart,
      shiftEnd: job.shiftEnd,
      staffNeeded: job.staffNeeded,
      staffConfirmed: job.staffConfirmed,
      spotsLeft: job.staffNeeded - job.staffConfirmed,
      companyName: job.companyName,
      externalUrl: job.externalUrl,
      closingDate: job.closingDate,
      publishedAt: job.publishedAt,
      role: job.role,
      applicationCount: job._count.applications
    };

    res.json({ ok: true, ...payload, data: payload });

  } catch (error) {
    next(error);
  }
});

// ============================================
// ADMIN: GET /api/v1/jobs/admin/all - List ALL jobs (including drafts)
// ============================================
async function listAdminJobs(req: Request, res: Response, next: NextFunction) {
  try {
    const query = listJobsQuerySchema.parse(req.query);
    const skip = (query.page - 1) * query.limit;
    
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.tier) where.tier = query.tier;
    if (query.roleId) where.roleId = query.roleId;
    
    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: query.limit,
        include: {
          role: {
            select: { id: true, name: true }
          },
          _count: {
            select: { applications: true }
          }
        }
      }),
      prisma.job.count({ where })
    ]);

    const shapedJobs = jobs.map((job) => ({ ...job }));
    
    const payload = {
      jobs: shapedJobs,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit)
      }
    };
    
    res.json({ ok: true, ...payload, data: payload });
    
  } catch (error) {
    next(error);
  }
}

r.get("/admin/all", adminAuth, listAdminJobs);

// Legacy alias used by older admin UI.
r.get("/admin/list", adminAuth, listAdminJobs);

// ============================================
// ADMIN: GET /api/v1/jobs/admin/:id - Get any job (including drafts)
// ============================================
r.get("/admin/:id", adminAuth, async (req, res, next) => {
  try {
    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
      include: {
        role: true,
        applications: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true
              }
            }
          },
          orderBy: { createdAt: "desc" }
        }
      }
    });
    
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    res.json({ ok: true, job, data: job });
    
  } catch (error) {
    next(error);
  }
});

// ============================================
// PUBLIC: POST /api/v1/jobs/submit - Submit external job for review
// ============================================
r.post("/submit", submitLimiter, async (req, res, next) => {
  try {
    const data = submitJobSchema.parse(req.body);

    if (data.website) {
      return res.status(201).json({
        ok: true,
        success: true,
        message: "Job submitted for review",
      });
    }

    const role = await prisma.role.findUnique({
      where: { id: data.roleId },
      select: { id: true, name: true },
    });

    if (!role) {
      return res.status(400).json({ error: "Invalid role selected" });
    }

    const payRate = data.payRateMax || data.payRateMin || null;
    const externalUrl = data.applyEmail ? `mailto:${data.applyEmail}` : data.externalUrl;

    const job = await prisma.job.create({
      data: {
        title: data.title,
        description: data.description,
        type: "EXTERNAL",
        status: "PENDING",
        location: data.location,
        companyName: data.companyName,
        posterEmail: data.posterEmail,
        payRate,
        payType: data.payType,
        externalUrl,
        roleId: role.id,
        staffNeeded: 1,
      },
      include: {
        role: {
          select: { id: true, name: true },
        },
      },
    });

    console.log(`[JOB SUBMISSION] New | Company: ${data.companyName} | Email: ${data.posterEmail} | Title: ${data.title} | ID: ${job.id}`);

    sendJobSubmissionNotification({
      companyName: data.companyName,
      posterEmail: data.posterEmail,
      jobTitle: data.title,
      roleName: role.name,
      location: data.location,
      payRate: payRate ? Number(payRate) : null,
      externalUrl,
    }).catch((err) => {
      console.error("[EMAIL] Failed to send job submission notification:", err);
    });

    res.status(201).json({
      ok: true,
      success: true,
      message: "Job submitted successfully! We'll review and publish it within 24 hours.",
      id: job.id,
      data: {
        id: job.id,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Invalid input",
        details: error.issues.map((issue) => issue.message),
      });
    }
    next(error);
  }
});

// ============================================
// ADMIN: POST /api/v1/jobs - Create job
// ============================================
r.post("/", adminAuth, async (req, res, next) => {
  try {
    const data = createJobSchema.parse(req.body);
    
    // Verify role exists
    const role = await prisma.role.findUnique({ 
      where: { id: data.roleId } 
    });
    
    if (!role) {
      return res.status(400).json({ error: "Invalid role" });
    }
    
    const job = await prisma.job.create({
      data: {
        title: data.title,
        description: data.description,
        requirements: data.requirements || null,
        type: data.type,
        tier: data.tier,
        status: data.status,
        location: data.location,
        venue: data.venue || null,
        payRate: data.payRate || null,
        payType: data.payType,
        eventDate: data.eventDate ? new Date(data.eventDate) : null,
        eventEndDate: data.eventEndDate ? new Date(data.eventEndDate) : null,
        shiftStart: data.shiftStart || null,
        shiftEnd: data.shiftEnd || null,
        staffNeeded: data.staffNeeded,
        companyName: data.companyName || null,
        externalUrl: data.externalUrl || null,
        closingDate: data.closingDate ? new Date(data.closingDate) : null,
        publishedAt: data.status === "OPEN" ? new Date() : null,
        roleId: data.roleId
      },
      include: {
        role: true
      }
    });
    
    // AUDIT LOG
    console.log(`[AUDIT] Job created | ID: ${job.id} | Title: ${job.title} | Admin: ${req.session.username} | Type: ${data.type} | Status: ${data.status}`);
    
    res.status(201).json({ ok: true, job, data: job });
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Invalid input", 
        details: error.issues 
      });
    }
    next(error);
  }
});

// ============================================
// ADMIN: PATCH /api/v1/jobs/:id - Update job
// ============================================
r.patch("/:id", adminAuth, async (req, res, next) => {
  try {
    const data = updateJobSchema.parse(req.body);
    
    const existing = await prisma.job.findUnique({ 
      where: { id: req.params.id } 
    });
    
    if (!existing) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    // If role is being changed, verify it exists
    if (data.roleId) {
      const role = await prisma.role.findUnique({ 
        where: { id: data.roleId } 
      });
      if (!role) {
        return res.status(400).json({ error: "Invalid role" });
      }
    }
    
    // Set publishedAt when status changes to OPEN
    let publishedAt = existing.publishedAt;
    if (data.status === "OPEN" && existing.status !== "OPEN") {
      publishedAt = new Date();
    }
    
    const job = await prisma.job.update({
      where: { id: req.params.id },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.description && { description: data.description }),
        ...(data.requirements !== undefined && { requirements: data.requirements || null }),
        ...(data.type && { type: data.type }),
        ...(data.tier && { tier: data.tier }),
        ...(data.status && { status: data.status }),
        ...(data.location && { location: data.location }),
        ...(data.venue !== undefined && { venue: data.venue || null }),
        ...(data.payRate !== undefined && { payRate: data.payRate || null }),
        ...(data.payType && { payType: data.payType }),
        ...(data.eventDate !== undefined && { eventDate: data.eventDate ? new Date(data.eventDate) : null }),
        ...(data.eventEndDate !== undefined && { eventEndDate: data.eventEndDate ? new Date(data.eventEndDate) : null }),
        ...(data.shiftStart !== undefined && { shiftStart: data.shiftStart || null }),
        ...(data.shiftEnd !== undefined && { shiftEnd: data.shiftEnd || null }),
        ...(data.staffNeeded && { staffNeeded: data.staffNeeded }),
        ...(data.companyName !== undefined && { companyName: data.companyName || null }),
        ...(data.externalUrl !== undefined && { externalUrl: data.externalUrl || null }),
        ...(data.closingDate !== undefined && { closingDate: data.closingDate ? new Date(data.closingDate) : null }),
        ...(data.roleId && { roleId: data.roleId }),
        publishedAt
      },
      include: {
        role: true
      }
    });
    
    // AUDIT LOG
    console.log(`[AUDIT] Job updated | ID: ${job.id} | Admin: ${req.session.username} | Fields: ${Object.keys(data).join(', ')}`);
    
    res.json({ ok: true, job, data: job });
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Invalid input", 
        details: error.issues 
      });
    }
    next(error);
  }
});

// ============================================
// ADMIN: POST /api/v1/jobs/:id/shortlist-review
// Mark a Shortlist-tier job as reviewed (shortlist sent to client)
// ============================================
r.post("/:id/shortlist-review", adminAuth, async (req, res, next) => {
  try {
    const existing = await prisma.job.findUnique({
      where: { id: req.params.id },
      select: { id: true, title: true, tier: true, status: true }
    });

    if (!existing) {
      return res.status(404).json({ error: "Job not found" });
    }

    if (existing.tier !== "SHORTLIST") {
      return res.status(400).json({ error: "Only Shortlist-tier jobs can be marked as reviewed" });
    }

    const job = await prisma.job.update({
      where: { id: req.params.id },
      data: { shortlistReviewedAt: new Date() }
    });

    console.log(`[AUDIT] Shortlist reviewed | ID: ${job.id} | Title: ${existing.title} | Admin: ${req.session.username}`);

    res.json({ ok: true, id: job.id, shortlistReviewedAt: job.shortlistReviewedAt, data: { id: job.id, shortlistReviewedAt: job.shortlistReviewedAt } });

  } catch (error) {
    next(error);
  }
});

// ============================================
// ADMIN: POST /api/v1/jobs/:id/approve - Approve pending external job
// ============================================
r.post("/:id/approve", adminAuth, async (req, res, next) => {
  try {
    const existing = await prisma.job.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        title: true,
        status: true,
        type: true,
        posterEmail: true,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: "Job not found" });
    }

    if (!isPendingExternalSubmission(existing)) {
      return res.status(400).json({ error: "Job is not pending approval" });
    }

    const job = await prisma.job.update({
      where: { id: req.params.id },
      data: {
        status: "OPEN",
        publishedAt: new Date(),
      },
    });

    console.log(`[AUDIT] Job approved | ID: ${job.id} | Title: ${existing.title} | Admin: ${req.session.username}`);

    if (existing.posterEmail) {
      sendJobApprovalEmail({
        to: existing.posterEmail,
        jobTitle: existing.title,
        jobId: job.id,
      }).catch((err) => {
        console.error("[EMAIL] Failed to send job approval:", err);
      });
    }

    res.json({ ok: true, job, data: job });
  } catch (error) {
    next(error);
  }
});

// ============================================
// ADMIN: POST /api/v1/jobs/:id/reject - Reject pending external job
// ============================================
r.post("/:id/reject", adminAuth, async (req, res, next) => {
  try {
    const { reason } = z.object({
      reason: z.string().max(500).optional(),
    }).parse(req.body);

    const existing = await prisma.job.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        title: true,
        status: true,
        type: true,
        posterEmail: true,
        companyName: true,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: "Job not found" });
    }

    if (!isPendingExternalSubmission(existing)) {
      return res.status(400).json({ error: "Job is not pending approval" });
    }

    await prisma.job.delete({ where: { id: req.params.id } });

    console.log(`[AUDIT] Job rejected | ID: ${existing.id} | Title: ${existing.title} | Company: ${existing.companyName || "-"} | Reason: ${reason || "None provided"} | Admin: ${req.session.username}`);

    if (existing.posterEmail) {
      sendJobRejectionEmail({
        to: existing.posterEmail,
        jobTitle: existing.title,
        reason,
      }).catch((err) => {
        console.error("[EMAIL] Failed to send job rejection:", err);
      });
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// ============================================
// ADMIN: DELETE /api/v1/jobs/:id - Delete job
// ============================================
r.delete("/:id", adminAuth, async (req, res, next) => {
  try {
    const existing = await prisma.job.findUnique({ 
      where: { id: req.params.id },
      include: { _count: { select: { applications: true } } }
    });
    
    if (!existing) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    await prisma.job.delete({ where: { id: req.params.id } });
    
    // AUDIT LOG
    console.log(`[AUDIT] Job deleted | ID: ${req.params.id} | Title: ${existing.title} | Admin: ${req.session.username} | Had ${existing._count.applications} applications`);
    
    res.json({ ok: true });
    
  } catch (error) {
    next(error);
  }
});

// ============================================
// ADMIN: PATCH /api/v1/jobs/:id/status - Quick status update
// ============================================
r.patch("/:id/status", adminAuth, async (req, res, next) => {
  try {
    const { status } = z.object({
      status: z.enum(["DRAFT", "OPEN", "FILLED", "CLOSED"])
    }).parse(req.body);
    
    const existing = await prisma.job.findUnique({ 
      where: { id: req.params.id } 
    });
    
    if (!existing) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    const job = await prisma.job.update({
      where: { id: req.params.id },
      data: { 
        status,
        publishedAt: status === "OPEN" && !existing.publishedAt ? new Date() : existing.publishedAt
      }
    });
    
    // AUDIT LOG
    console.log(`[AUDIT] Job status changed | ID: ${job.id} | From: ${existing.status} | To: ${status} | Admin: ${req.session.username}`);
    
    res.json({ ok: true, id: job.id, status: job.status, data: { id: job.id, status: job.status } });
    
  } catch (error) {
    next(error);
  }
});

export default r;
