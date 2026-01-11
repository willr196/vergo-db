import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { adminAuth } from "../middleware/adminAuth";
import { requireUser } from "../middleware/userAuth";
import { sendJobApplicationNotification, sendJobApplicationConfirmation } from "../services/email";

const r = Router();

const applySchema = z.object({
  jobId: z.string().min(1),
  coverNote: z.string().max(2000).optional()
});

const updateStatusSchema = z.object({
  status: z.enum(["PENDING", "REVIEWED", "SHORTLISTED", "CONFIRMED", "REJECTED", "WITHDRAWN"])
});

// USER: Apply to job
r.post("/", requireUser, async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const data = applySchema.parse(req.body);
    
    const job = await prisma.job.findUnique({
      where: { id: data.jobId },
      include: { role: true }
    });
    
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (job.status !== "OPEN") return res.status(400).json({ error: "Job no longer accepting applications" });
    
    const existing = await prisma.jobApplication.findUnique({
      where: { userId_jobId: { userId, jobId: data.jobId } }
    });
    if (existing) return res.status(400).json({ error: "Already applied" });
    
    if (job.staffConfirmed >= job.staffNeeded) {
      return res.status(400).json({ error: "Job has been filled" });
    }
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, email: true }
    });
    if (!user) return res.status(401).json({ error: "User not found" });
    
    const application = await prisma.jobApplication.create({
      data: { userId, jobId: data.jobId, coverNote: data.coverNote || null, status: "PENDING" },
      include: { job: { select: { id: true, title: true, eventDate: true, location: true } } }
    });
    
    console.log(`[JOB APPLICATION] New | User: ${user.email} | Job: ${job.title} | ID: ${application.id}`);
    
    sendJobApplicationNotification({
      jobTitle: job.title,
      applicantName: `${user.firstName} ${user.lastName}`,
      applicantEmail: user.email,
      applicationId: application.id
    }).catch(err => console.error("[EMAIL]", err));
    
    sendJobApplicationConfirmation({
      to: user.email,
      name: user.firstName,
      jobTitle: job.title,
      eventDate: job.eventDate,
      location: job.location
    }).catch(err => console.error("[EMAIL]", err));
    
    const payload = { id: application.id, status: application.status, job: application.job, createdAt: application.createdAt };
    res.status(201).json({ ok: true, ...payload, data: payload });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid input" });
    next(error);
  }
});

// USER: My applications
r.get("/mine", requireUser, async (req, res, next) => {
  try {
    const applications = await prisma.jobApplication.findMany({
      where: { userId: req.session.userId! },
      orderBy: { createdAt: "desc" },
      include: {
        job: {
          select: {
            id: true, title: true, type: true, status: true, location: true, venue: true,
            eventDate: true, shiftStart: true, shiftEnd: true, payRate: true, payType: true,
            companyName: true, role: { select: { name: true } }
          }
        }
      }
    });
    
    const payload = applications.map(app => ({
      ...app,
      job: { ...app.job, payRate: app.job.payRate ? Number(app.job.payRate) : null }
    }));
    
    res.json({ ok: true, applications: payload, data: payload });
  } catch (error) { next(error); }
});

// USER: Check if applied
r.get("/check/:jobId", requireUser, async (req, res, next) => {
  try {
    const application = await prisma.jobApplication.findUnique({
      where: { userId_jobId: { userId: req.session.userId!, jobId: req.params.jobId } },
      select: { id: true, status: true, createdAt: true }
    });
    res.json({ ok: true, applied: !!application, application, data: { applied: !!application, application } });
  } catch (error) { next(error); }
});

// USER: Withdraw
r.post("/:id/withdraw", requireUser, async (req, res, next) => {
  try {
    const application = await prisma.jobApplication.findUnique({
      where: { id: req.params.id },
      select: { id: true, userId: true, status: true, job: { select: { title: true } } }
    });
    
    if (!application) return res.status(404).json({ error: "Not found" });
    if (application.userId !== req.session.userId) return res.status(403).json({ error: "Not yours" });
    if (application.status === "CONFIRMED") return res.status(400).json({ error: "Cannot withdraw confirmed application" });
    if (application.status === "WITHDRAWN") return res.status(400).json({ error: "Already withdrawn" });
    
    await prisma.jobApplication.update({ where: { id: req.params.id }, data: { status: "WITHDRAWN" } });
    
    console.log(`[JOB APPLICATION] Withdrawn | ID: ${req.params.id} | User: ${req.session.userEmail} | Job: ${application.job.title}`);
    
    res.json({ ok: true, status: "WITHDRAWN", data: { status: "WITHDRAWN" } });
  } catch (error) { next(error); }
});

// ADMIN: List all
r.get("/", adminAuth, async (req, res, next) => {
  try {
    const { status, jobId, page = "1", limit = "50" } = req.query;
    const where: any = {};
    if (status) where.status = status;
    if (jobId) where.jobId = jobId;
    
    const [applications, total] = await Promise.all([
      prisma.jobApplication.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, applicantId: true } },
          job: { select: { id: true, title: true, eventDate: true, location: true, role: { select: { name: true } } } }
        }
      }),
      prisma.jobApplication.count({ where })
    ]);
    
    const payload = { applications, pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) } };
    res.json({ ok: true, ...payload, data: payload });
  } catch (error) { next(error); }
});

// ADMIN: Get one
r.get("/:id", adminAuth, async (req, res, next) => {
  try {
    const application = await prisma.jobApplication.findUnique({
      where: { id: req.params.id },
      include: {
        user: {
          select: {
            id: true, firstName: true, lastName: true, email: true, phone: true, applicantId: true,
            applicant: { select: { id: true, applications: { select: { cvKey: true, cvOriginalName: true }, take: 1, orderBy: { createdAt: "desc" } } } }
          }
        },
        job: { include: { role: true } }
      }
    });
    if (!application) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, application, data: application });
  } catch (error) { next(error); }
});

// ADMIN: Update status
r.patch("/:id/status", adminAuth, async (req, res, next) => {
  try {
    const { status } = updateStatusSchema.parse(req.body);
    
    const application = await prisma.jobApplication.findUnique({
      where: { id: req.params.id },
      include: { job: true, user: { select: { email: true } } }
    });
    if (!application) return res.status(404).json({ error: "Not found" });
    
    const previousStatus = application.status;
    
    if (status === "CONFIRMED" && application.status !== "CONFIRMED") {
      await prisma.$transaction([
        prisma.jobApplication.update({ where: { id: req.params.id }, data: { status } }),
        prisma.job.update({ where: { id: application.jobId }, data: { staffConfirmed: { increment: 1 } } })
      ]);
      
      const updatedJob = await prisma.job.findUnique({ where: { id: application.jobId } });
      if (updatedJob && updatedJob.staffConfirmed >= updatedJob.staffNeeded) {
        await prisma.job.update({ where: { id: application.jobId }, data: { status: "FILLED" } });
      }
    } else if (application.status === "CONFIRMED" && status !== "CONFIRMED") {
      await prisma.$transaction([
        prisma.jobApplication.update({ where: { id: req.params.id }, data: { status } }),
        prisma.job.update({ where: { id: application.jobId }, data: { staffConfirmed: { decrement: 1 } } })
      ]);
      if (application.job.status === "FILLED") {
        await prisma.job.update({ where: { id: application.jobId }, data: { status: "OPEN" } });
      }
    } else {
      await prisma.jobApplication.update({ where: { id: req.params.id }, data: { status } });
    }
    
    // AUDIT LOG
    console.log(`[AUDIT] Application status changed | ID: ${req.params.id} | User: ${application.user.email} | Job: ${application.job.title} | From: ${previousStatus} | To: ${status} | Admin: ${req.session.username}`);
    
    res.json({ ok: true, id: req.params.id, status, data: { id: req.params.id, status } });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid status" });
    next(error);
  }
});

// ADMIN: Update notes
r.patch("/:id/notes", adminAuth, async (req, res, next) => {
  try {
    const { notes } = z.object({ notes: z.string().max(2000) }).parse(req.body);
    const application = await prisma.jobApplication.update({
      where: { id: req.params.id },
      data: { adminNotes: notes || null }
    });
    
    // AUDIT LOG
    console.log(`[AUDIT] Application notes updated | ID: ${req.params.id} | Admin: ${req.session.username}`);
    
    res.json({ ok: true, id: application.id, adminNotes: application.adminNotes, data: { id: application.id, adminNotes: application.adminNotes } });
  } catch (error) { next(error); }
});

export default r;
