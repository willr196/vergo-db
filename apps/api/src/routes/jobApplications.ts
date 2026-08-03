import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { adminAuth } from "../middleware/adminAuth";
import { requireUser } from "../middleware/userAuth";
import {
  sendJobApplicationNotification,
  sendJobApplicationConfirmation,
  sendShiftConfirmedEmail,
  sendShiftNotSelectedEmail
} from "../services/email";
import { sendPushToUser } from "../services/notifications";
import { summariseChecks } from "../services/rightToWork";

const r = Router();

const applySchema = z.object({
  jobId: z.string().min(1),
  coverNote: z.string().max(2000).optional()
});

const updateStatusSchema = z.object({
  status: z.enum(["PENDING", "REVIEWED", "SHORTLISTED", "CONFIRMED", "REJECTED", "WITHDRAWN"])
});

type StatusChangeContext = {
  jobId: string;
  user: { id: string; email: string; firstName: string };
  job: {
    title: string;
    location: string;
    venue: string | null;
    eventDate: Date | null;
    shiftStart: string | null;
    shiftEnd: string | null;
    payRate: unknown;
    payType: string;
    role: { name: string };
  };
};

/**
 * Notify a worker when an admin changes their application outcome.
 *
 * Only CONFIRMED and REJECTED are surfaced — the intermediate states (REVIEWED,
 * SHORTLISTED) are internal admin bookkeeping and would be noise to the worker.
 * WITHDRAWN is worker-initiated, so they already know.
 */
function notifyWorkerOfStatusChange(
  application: StatusChangeContext,
  previousStatus: string,
  newStatus: string
) {
  if (newStatus === previousStatus) return;

  const { user, job } = application;

  if (newStatus === "CONFIRMED") {
    sendShiftConfirmedEmail({
      to: user.email,
      name: user.firstName,
      jobTitle: job.title,
      roleName: job.role?.name,
      eventDate: job.eventDate,
      location: job.location,
      venue: job.venue,
      shiftStart: job.shiftStart,
      shiftEnd: job.shiftEnd,
      payRate: job.payRate != null ? Number(job.payRate) : null,
      payType: job.payType,
    }).catch((err) => console.error("[EMAIL] shift confirmed:", err));

    sendPushToUser(
      user.id,
      "You're confirmed for a shift",
      `${job.title}${job.eventDate ? ` — ${new Date(job.eventDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}`,
      { type: "SHIFT_CONFIRMED", jobId: application.jobId }
    ).catch((err) => console.error("[PUSH] shift confirmed:", err));
    return;
  }

  if (newStatus === "REJECTED") {
    sendShiftNotSelectedEmail({
      to: user.email,
      name: user.firstName,
      jobTitle: job.title,
    }).catch((err) => console.error("[EMAIL] shift not selected:", err));
  }
}

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
    
    console.log(`[JOB APPLICATION] New | userId=${userId} jobId=${job.id} applicationId=${application.id}`);
    
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
      select: { id: true, userId: true, jobId: true, status: true, job: { select: { title: true } } }
    });
    
    if (!application) return res.status(404).json({ error: "Not found" });
    if (application.userId !== req.session.userId) return res.status(403).json({ error: "Not yours" });
    if (application.status === "CONFIRMED") return res.status(400).json({ error: "Cannot withdraw confirmed application" });
    if (application.status === "WITHDRAWN") return res.status(400).json({ error: "Already withdrawn" });
    
    await prisma.jobApplication.update({ where: { id: req.params.id }, data: { status: "WITHDRAWN" } });
    
    console.log(`[JOB APPLICATION] Withdrawn | applicationId=${req.params.id} userId=${req.session.userId} jobId=${application.jobId}`);
    
    res.json({ ok: true, status: "WITHDRAWN", data: { status: "WITHDRAWN" } });
  } catch (error) { next(error); }
});

// ADMIN: List all
r.get("/", adminAuth, async (req, res, next) => {
  try {
    const { status, jobId } = req.query;
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
    const limit = Math.min(100, Math.max(1, Math.floor(Number(req.query.limit) || 50)));
    const where: any = {};
    if (status && typeof status === 'string') where.status = status;
    if (jobId && typeof jobId === 'string') where.jobId = jobId;

    const [applications, total] = await Promise.all([
      prisma.jobApplication.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, applicantId: true } },
          job: { select: { id: true, title: true, type: true, eventDate: true, location: true, role: { select: { name: true } } } }
        }
      }),
      prisma.jobApplication.count({ where })
    ]);
    
    const payload = { applications, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
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
      include: {
        job: { include: { role: { select: { name: true } } } },
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            applicant: {
              select: {
                id: true,
                applications: { select: { status: true } },
                rightToWorkChecks: {
                  select: { outcome: true, expiresAt: true, checkedAt: true, checkedBy: true }
                }
              }
            }
          }
        }
      }
    });
    if (!application) return res.status(404).json({ error: "Not found" });

    const previousStatus = application.status;
    
    if (status === "CONFIRMED" && application.status !== "CONFIRMED") {
      // Vetting gate: a worker may only be placed on a paid shift once their CV
      // application has actually been reviewed and marked HIRED. Registering an
      // account only proves they submitted a CV, not that anyone approved it.
      const isVetted = (application.user.applicant?.applications ?? [])
        .some((cvApplication) => cvApplication.status === "HIRED");

      if (!isVetted) {
        console.log(`[AUDIT] Confirmation blocked, worker not vetted | applicationId=${req.params.id} userId=${application.user.id} admin=${req.session.username}`);
        return res.status(409).json({
          error: "This worker has not completed vetting. Mark their CV application as HIRED before confirming them for a shift.",
          code: "WORKER_NOT_VETTED"
        });
      }

      // Right-to-work gate: the check must be recorded and in date before the
      // worker starts. Blocking at confirmation is the last point at which we
      // can stop an unverified worker being placed on a shift.
      const rtw = summariseChecks(application.user.applicant?.rightToWorkChecks ?? []);
      if (!rtw.clearedToWork) {
        console.log(`[AUDIT] Confirmation blocked, right to work not verified | applicationId=${req.params.id} userId=${application.user.id} rtwStatus=${rtw.status} admin=${req.session.username}`);
        return res.status(409).json({
          error: `Right to work is not verified for this worker (${rtw.label}). Record a passed check before confirming them for a shift.`,
          code: "RIGHT_TO_WORK_NOT_VERIFIED",
          rightToWork: rtw
        });
      }

      try {
        await prisma.$transaction(async (tx) => {
          const job = await tx.job.findUnique({
            where: { id: application.jobId },
            select: { staffConfirmed: true, staffNeeded: true, status: true }
          });
          if (!job) {
            throw new Error("JOB_NOT_FOUND");
          }
          if (job.staffConfirmed >= job.staffNeeded) {
            throw new Error("JOB_FILLED");
          }

          await tx.jobApplication.update({
            where: { id: req.params.id },
            data: { status }
          });

          await tx.job.update({
            where: { id: application.jobId },
            data: { staffConfirmed: { increment: 1 } }
          });

          if (job.staffConfirmed + 1 >= job.staffNeeded) {
            await tx.job.update({
              where: { id: application.jobId },
              data: { status: "FILLED" }
            });
          }
        });
      } catch (err) {
        if (err instanceof Error && err.message === "JOB_FILLED") {
          return res.status(400).json({ error: "Job has been filled" });
        }
        if (err instanceof Error && err.message === "JOB_NOT_FOUND") {
          return res.status(404).json({ error: "Job not found" });
        }
        throw err;
      }
    } else if (application.status === "CONFIRMED" && status !== "CONFIRMED") {
      try {
        await prisma.$transaction(async (tx) => {
          const job = await tx.job.findUnique({
            where: { id: application.jobId },
            select: { staffConfirmed: true, staffNeeded: true, status: true }
          });
          if (!job) {
            throw new Error("JOB_NOT_FOUND");
          }
          if (job.staffConfirmed <= 0) {
            throw new Error("JOB_STAFF_COUNT_INVALID");
          }

          await tx.jobApplication.update({
            where: { id: req.params.id },
            data: { status }
          });

          await tx.job.update({
            where: { id: application.jobId },
            data: { staffConfirmed: { decrement: 1 } }
          });

          if (job.status === "FILLED") {
            await tx.job.update({
              where: { id: application.jobId },
              data: { status: "OPEN" }
            });
          }
        });
      } catch (err) {
        if (err instanceof Error && err.message === "JOB_NOT_FOUND") {
          return res.status(404).json({ error: "Job not found" });
        }
        if (err instanceof Error && err.message === "JOB_STAFF_COUNT_INVALID") {
          return res.status(409).json({ error: "Job staff count out of sync" });
        }
        throw err;
      }
    } else {
      await prisma.jobApplication.update({ where: { id: req.params.id }, data: { status } });
    }
    
    // AUDIT LOG
    console.log(`[AUDIT] Application status changed | applicationId=${req.params.id} userId=${application.user.id} jobId=${application.jobId} from=${previousStatus} to=${status} admin=${req.session.username}`);

    // Tell the worker the outcome. Fire-and-forget: a failed notification must not
    // roll back a status change the admin has already been told succeeded.
    notifyWorkerOfStatusChange(application, previousStatus, status);

    res.json({ ok: true, id: req.params.id, status, data: { id: req.params.id, status } });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid status" });
    next(error);
  }
});

// ADMIN: Update notes
r.patch("/:id/notes", adminAuth, async (req, res, next) => {
  try {
    const { notes } = z.object({ notes: z.string().max(2000).transform(v => v.replace(/<[^>]*>/g, '')) }).parse(req.body);
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
