import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireUserJwt } from '../middleware/jwtAuth';
import { sendJobApplicationNotification, sendJobApplicationConfirmation } from '../services/email';

const r = Router();

const applySchema = z.object({
  jobId: z.string().min(1),
  coverNote: z.string().max(2000).optional()
});

const listQuerySchema = z.object({
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

r.use(requireUserJwt);

// POST /api/v1/mobile/job-applications
r.post('/', async (req, res, next) => {
  try {
    const data = applySchema.parse(req.body);
    const userId = req.auth!.userId;

    const job = await prisma.job.findUnique({
      where: { id: data.jobId },
      include: { role: true }
    });

    if (!job) {
      return res.status(404).json({ ok: false, error: 'Job not found' });
    }

    if (job.status !== 'OPEN') {
      return res.status(400).json({ ok: false, error: 'Job no longer accepting applications' });
    }

    const existing = await prisma.jobApplication.findUnique({
      where: { userId_jobId: { userId, jobId: data.jobId } }
    });
    if (existing) {
      return res.status(400).json({ ok: false, error: 'Already applied' });
    }

    if (job.staffConfirmed >= job.staffNeeded) {
      return res.status(400).json({ ok: false, error: 'Job has been filled' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, email: true }
    });
    if (!user) {
      return res.status(401).json({ ok: false, error: 'User not found' });
    }

    const application = await prisma.jobApplication.create({
      data: {
        userId,
        jobId: data.jobId,
        coverNote: data.coverNote || null,
        status: 'PENDING'
      },
      include: { job: { select: { id: true, title: true, eventDate: true, location: true, role: { select: { name: true } } } } }
    });

    sendJobApplicationNotification({
      jobTitle: job.title,
      applicantName: `${user.firstName} ${user.lastName}`,
      applicantEmail: user.email,
      applicationId: application.id
    }).catch(err => console.error('[EMAIL]', err));

    sendJobApplicationConfirmation({
      to: user.email,
      name: user.firstName,
      jobTitle: job.title,
      eventDate: job.eventDate,
      location: job.location
    }).catch(err => console.error('[EMAIL]', err));

    res.status(201).json({ ok: true, application, data: application });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'Invalid input' });
    }
    next(error);
  }
});

// GET /api/v1/mobile/job-applications/mine
r.get('/mine', async (req, res, next) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const skip = (query.page - 1) * query.limit;

    const where: any = { userId: req.auth!.userId };
    if (query.status) {
      where.status = query.status;
    }

    const [applications, total] = await Promise.all([
      prisma.jobApplication.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
        include: {
          job: {
            select: {
              id: true,
              title: true,
              type: true,
              status: true,
              location: true,
              venue: true,
              eventDate: true,
              shiftStart: true,
              shiftEnd: true,
              payRate: true,
              payType: true,
              companyName: true,
              staffNeeded: true,
              staffConfirmed: true,
              role: { select: { name: true } }
            }
          }
        }
      }),
      prisma.jobApplication.count({ where })
    ]);

    const shaped = applications.map(app => ({
      ...app,
      job: app.job
        ? { ...app.job, payRate: app.job.payRate ? Number(app.job.payRate) : null }
        : app.job
    }));

    const payload = {
      applications: shaped,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
        hasMore: query.page * query.limit < total
      }
    };

    res.json({ ok: true, ...payload, data: payload });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/mobile/job-applications/check/:jobId
r.get('/check/:jobId', async (req, res, next) => {
  try {
    const application = await prisma.jobApplication.findUnique({
      where: { userId_jobId: { userId: req.auth!.userId, jobId: req.params.jobId } },
      select: { id: true, status: true, createdAt: true }
    });
    res.json({ ok: true, applied: !!application, application, data: { applied: !!application, application } });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/mobile/job-applications/:id
r.get('/:id', async (req, res, next) => {
  try {
    const application = await prisma.jobApplication.findUnique({
      where: { id: req.params.id },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            type: true,
            status: true,
            location: true,
            venue: true,
            eventDate: true,
            shiftStart: true,
            shiftEnd: true,
            payRate: true,
            payType: true,
            companyName: true,
            staffNeeded: true,
            staffConfirmed: true,
            role: { select: { name: true } }
          }
        }
      }
    });

    if (!application || application.userId !== req.auth!.userId) {
      return res.status(404).json({ ok: false, error: 'Not found' });
    }

    const shaped = {
      ...application,
      job: application.job
        ? { ...application.job, payRate: application.job.payRate ? Number(application.job.payRate) : null }
        : application.job
    };

    res.json({ ok: true, application: shaped, data: shaped });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/mobile/job-applications/:id/withdraw
r.post('/:id/withdraw', async (req, res, next) => {
  try {
    const application = await prisma.jobApplication.findUnique({
      where: { id: req.params.id },
      select: { id: true, userId: true, status: true, job: { select: { title: true } } }
    });

    if (!application) {
      return res.status(404).json({ ok: false, error: 'Not found' });
    }

    if (application.userId !== req.auth!.userId) {
      return res.status(403).json({ ok: false, error: 'Not yours' });
    }

    if (application.status === 'CONFIRMED') {
      return res.status(400).json({ ok: false, error: 'Cannot withdraw confirmed application' });
    }

    if (application.status === 'WITHDRAWN') {
      return res.status(400).json({ ok: false, error: 'Already withdrawn' });
    }

    const updated = await prisma.jobApplication.update({
      where: { id: req.params.id },
      data: { status: 'WITHDRAWN' }
    });

    res.json({ ok: true, application: updated, data: updated });
  } catch (error) {
    next(error);
  }
});

export default r;
