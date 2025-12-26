import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { adminAuth } from "../middleware/adminAuth";

const r = Router();

// ============================================
// VALIDATION SCHEMAS
// ============================================
const createJobSchema = z.object({
  title: z.string().min(3).max(200).trim(),
  description: z.string().min(10).max(5000).trim(),
  requirements: z.string().max(2000).optional(),
  type: z.enum(["INTERNAL", "EXTERNAL"]).default("INTERNAL"),
  status: z.enum(["DRAFT", "OPEN", "FILLED", "CLOSED"]).default("DRAFT"),
  location: z.string().min(2).max(200).trim(),
  venue: z.string().max(200).optional(),
  payRate: z.number().positive().max(1000).optional(),
  payType: z.enum(["HOURLY", "DAILY", "FIXED"]).default("HOURLY"),
  eventDate: z.string().optional(),
  eventEndDate: z.string().optional(),
  shiftStart: z.string().max(10).optional(),
  shiftEnd: z.string().max(10).optional(),
  staffNeeded: z.number().int().min(1).max(100).default(1),
  companyName: z.string().max(200).optional(),
  externalUrl: z.string().url().max(500).optional(),
  closingDate: z.string().optional(),
  roleId: z.string().min(1)
});

const updateJobSchema = createJobSchema.partial();

const listJobsQuerySchema = z.object({
  status: z.enum(["PENDING", "DRAFT", "OPEN", "FILLED", "CLOSED"]).optional(),
  type: z.enum(["INTERNAL", "EXTERNAL"]).optional(),
  roleId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

// Public job submission schema
const submitJobSchema = z.object({
  title: z.string().min(3).max(200).trim(),
  description: z.string().min(10).max(5000).trim(),
  requirements: z.string().max(2000).optional(),
  location: z.string().min(2).max(200).trim(),
  venue: z.string().max(200).optional(),
  payRate: z.number().positive().max(1000).optional(),
  payType: z.enum(["HOURLY", "DAILY", "FIXED"]).default("HOURLY"),
  eventDate: z.string().optional(),
  eventEndDate: z.string().optional(),
  shiftStart: z.string().max(10).optional(),
  shiftEnd: z.string().max(10).optional(),
  staffNeeded: z.number().int().min(1).max(100).default(1),
  closingDate: z.string().optional(),
  roleId: z.string().min(1),
  // Poster details
  companyName: z.string().min(2).max(200).trim(),
  posterEmail: z.string().email().max(255).trim()
});

// ============================================
// PUBLIC: GET /api/v1/jobs - List open jobs
// ============================================
r.get("/", async (req, res, next) => {
  try {
    const query = listJobsQuerySchema.parse(req.query);
    const skip = (query.page - 1) * query.limit;
    
    // Public can only see OPEN jobs (not PENDING, DRAFT, etc.)
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
      location: job.location,
      venue: job.venue,
      payRate: job.payRate ? Number(job.payRate) : null,
      payType: job.payType,
      eventDate: job.eventDate,
      eventEndDate: job.eventEndDate,
      shiftStart: job.shiftStart,
      shiftEnd: job.shiftEnd,
      staffNeeded: job.staffNeeded,
      companyName: job.companyName,
      externalUrl: job.externalUrl,
      closingDate: job.closingDate,
      publishedAt: job.publishedAt,
      role: job.role,
      applicationCount: job._count.applications
    }));
    
    res.json({
      jobs: shaped,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit)
      }
    });
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid query parameters" });
    }
    next(error);
  }
});

// ============================================
// PUBLIC: GET /api/v1/jobs/meta/roles - Get available roles
// ============================================
r.get("/meta/roles", async (_req, res, next) => {
  try {
    const roles = await prisma.role.findMany({
      orderBy: { name: "asc" }
    });
    res.json(roles);
  } catch (error) {
    next(error);
  }
});

// ============================================
// PUBLIC: GET /api/v1/jobs/:id - Get single job
// ============================================
r.get("/:id", async (req, res, next) => {
  try {
    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
      include: {
        role: true
      }
    });
    
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    // Public can only see OPEN jobs
    if (job.status !== "OPEN") {
      return res.status(404).json({ error: "Job not found" });
    }
    
    res.json({
      ...job,
      payRate: job.payRate ? Number(job.payRate) : null
    });
    
  } catch (error) {
    next(error);
  }
});

// ============================================
// PUBLIC: POST /api/v1/jobs/submit - Submit job for review
// ============================================
r.post("/submit", async (req, res, next) => {
  try {
    const data = submitJobSchema.parse(req.body);
    
    // Verify role exists
    const role = await prisma.role.findUnique({ 
      where: { id: data.roleId } 
    });
    
    if (!role) {
      return res.status(400).json({ error: "Invalid role selected" });
    }
    
    // Create job with PENDING status
    const job = await prisma.job.create({
      data: {
        title: data.title,
        description: data.description,
        requirements: data.requirements || null,
        type: "EXTERNAL", // External submissions are always EXTERNAL type
        status: "PENDING", // Needs admin approval
        location: data.location,
        venue: data.venue || null,
        payRate: data.payRate || null,
        payType: data.payType,
        eventDate: data.eventDate ? new Date(data.eventDate) : null,
        eventEndDate: data.eventEndDate ? new Date(data.eventEndDate) : null,
        shiftStart: data.shiftStart || null,
        shiftEnd: data.shiftEnd || null,
        staffNeeded: data.staffNeeded,
        companyName: data.companyName,
        posterEmail: data.posterEmail, // Store submitter's email
        closingDate: data.closingDate ? new Date(data.closingDate) : null,
        roleId: data.roleId
      },
      include: {
        role: true
      }
    });
    
    console.log(`[AUDIT] Job submitted for review | ID: ${job.id} | Title: ${job.title} | Company: ${data.companyName} | Email: ${data.posterEmail}`);
    
    res.status(201).json({ 
      ok: true,
      message: "Job submitted successfully. It will be reviewed by our team.",
      jobId: job.id
    });
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Invalid input", 
        details: error.issues.map(i => i.message)
      });
    }
    next(error);
  }
});

// ============================================
// ADMIN: GET /api/v1/jobs/admin/list - List all jobs (including PENDING)
// ============================================
r.get("/admin/list", adminAuth, async (req, res, next) => {
  try {
    const query = listJobsQuerySchema.parse(req.query);
    const skip = (query.page - 1) * query.limit;
    
    const where: any = {};
    
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.roleId) where.roleId = query.roleId;
    
    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: query.limit,
        include: {
          role: true,
          _count: {
            select: { applications: true }
          }
        }
      }),
      prisma.job.count({ where })
    ]);
    
    res.json({
      jobs: jobs.map(j => ({
        ...j,
        payRate: j.payRate ? Number(j.payRate) : null
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit)
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// ============================================
// ADMIN: GET /api/v1/jobs/admin/:id - Get job with applications
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
    
    res.json({
      ...job,
      payRate: job.payRate ? Number(job.payRate) : null
    });
    
  } catch (error) {
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
    
    console.log(`[AUDIT] Job created | ID: ${job.id} | Title: ${job.title} | Admin: ${req.session.username} | Type: ${data.type} | Status: ${data.status}`);
    
    res.status(201).json(job);
    
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
    
    console.log(`[AUDIT] Job updated | ID: ${job.id} | Admin: ${req.session.username} | Fields: ${Object.keys(data).join(', ')}`);
    
    res.json(job);
    
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
      status: z.enum(["PENDING", "DRAFT", "OPEN", "FILLED", "CLOSED"])
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
      },
      include: { role: true }
    });
    
    console.log(`[AUDIT] Job status changed | ID: ${job.id} | From: ${existing.status} | To: ${status} | Admin: ${req.session.username}`);
    
    res.json(job);
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid status" });
    }
    next(error);
  }
});

// ============================================
// ADMIN: POST /api/v1/jobs/:id/approve - Approve pending job
// ============================================
r.post("/:id/approve", adminAuth, async (req, res, next) => {
  try {
    const existing = await prisma.job.findUnique({ 
      where: { id: req.params.id } 
    });
    
    if (!existing) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    if (existing.status !== "PENDING") {
      return res.status(400).json({ error: "Job is not pending approval" });
    }
    
    const job = await prisma.job.update({
      where: { id: req.params.id },
      data: { 
        status: "OPEN",
        publishedAt: new Date()
      },
      include: { role: true }
    });
    
    console.log(`[AUDIT] Job approved | ID: ${job.id} | Title: ${job.title} | Company: ${job.companyName} | Admin: ${req.session.username}`);
    
    // TODO: Send approval email to posterEmail
    
    res.json({ ok: true, job });
    
  } catch (error) {
    next(error);
  }
});

// ============================================
// ADMIN: POST /api/v1/jobs/:id/reject - Reject pending job
// ============================================
r.post("/:id/reject", adminAuth, async (req, res, next) => {
  try {
    const { reason } = z.object({
      reason: z.string().max(500).optional()
    }).parse(req.body);
    
    const existing = await prisma.job.findUnique({ 
      where: { id: req.params.id } 
    });
    
    if (!existing) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    if (existing.status !== "PENDING") {
      return res.status(400).json({ error: "Job is not pending approval" });
    }
    
    // Delete the job (or you could set status to CLOSED/REJECTED)
    await prisma.job.delete({ where: { id: req.params.id } });
    
    console.log(`[AUDIT] Job rejected | ID: ${req.params.id} | Title: ${existing.title} | Company: ${existing.companyName} | Reason: ${reason || 'None provided'} | Admin: ${req.session.username}`);
    
    // TODO: Send rejection email to posterEmail with reason
    
    res.json({ ok: true });
    
  } catch (error) {
    next(error);
  }
});

export default r;
