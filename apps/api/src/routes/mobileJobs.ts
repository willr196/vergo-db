import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireUserJwt } from '../middleware/jwtAuth';

const r = Router();

const listJobsQuerySchema = z.object({
  role: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  search: z.string().max(100).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  minHourlyRate: z.coerce.number().min(0).optional(),
  maxHourlyRate: z.coerce.number().min(0).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

function shapeMobileJob(job: any) {
  return {
    id: job.id,
    title: job.title,
    description: job.description,
    requirements: job.requirements,
    type: job.type,
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
    companyName: job.companyName,
    externalUrl: job.externalUrl,
    closingDate: job.closingDate,
    publishedAt: job.publishedAt,
    role: job.role,
    tier: job.tier,
    shortlistReviewedAt: job.shortlistReviewedAt,
    applicationCount: job._count?.applications ?? 0,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };
}

// GET /api/v1/mobile/jobs
r.get('/', async (req, res, next) => {
  try {
    const query = listJobsQuerySchema.parse(req.query);
    const skip = (query.page - 1) * query.limit;

    const where: any = { status: 'OPEN' };

    if (query.role) {
      where.role = { name: { equals: query.role, mode: 'insensitive' } };
    }

    if (query.city) {
      where.location = { contains: query.city, mode: 'insensitive' };
    }

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } }
      ];
    }

    if (query.minHourlyRate !== undefined || query.maxHourlyRate !== undefined) {
      where.payRate = {};
      if (query.minHourlyRate !== undefined) {
        where.payRate.gte = query.minHourlyRate;
      }
      if (query.maxHourlyRate !== undefined) {
        where.payRate.lte = query.maxHourlyRate;
      }
    }

    if (query.dateFrom || query.dateTo) {
      where.eventDate = {};
      if (query.dateFrom) {
        const dateFrom = new Date(query.dateFrom);
        if (!Number.isNaN(dateFrom.getTime())) {
          where.eventDate.gte = dateFrom;
        }
      }
      if (query.dateTo) {
        const dateTo = new Date(query.dateTo);
        if (!Number.isNaN(dateTo.getTime())) {
          where.eventDate.lte = dateTo;
        }
      }
      if (Object.keys(where.eventDate).length === 0) {
        delete where.eventDate;
      }
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: [
          { eventDate: 'asc' },
          { createdAt: 'desc' }
        ],
        skip,
        take: query.limit,
        include: {
          role: { select: { id: true, name: true } },
          _count: { select: { applications: true } }
        }
      }),
      prisma.job.count({ where })
    ]);

    const shaped = jobs.map((job) => shapeMobileJob(job));

    const payload = {
      jobs: shaped,
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

// GET /api/v1/mobile/jobs/cities
r.get('/cities', async (_req, res, next) => {
  try {
    const rows = await prisma.job.findMany({
      where: { status: 'OPEN' },
      distinct: ['location'],
      orderBy: { location: 'asc' },
      select: { location: true }
    });

    const cities = rows.map((row) => row.location).filter(Boolean);
    res.json({ ok: true, cities, data: cities });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/mobile/jobs/recommended
r.get('/recommended', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 20);

    const jobs = await prisma.job.findMany({
      where: { status: 'OPEN' },
      orderBy: [
        { eventDate: 'asc' },
        { createdAt: 'desc' }
      ],
      take: limit,
      include: {
        role: { select: { id: true, name: true } },
        _count: { select: { applications: true } }
      }
    });

    const shaped = jobs.map((job) => shapeMobileJob(job));
    res.json({ ok: true, jobs: shaped, data: shaped });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/mobile/jobs/meta/roles
r.get('/meta/roles', async (_req, res, next) => {
  try {
    const roles = await prisma.role.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true }
    });

    res.json({ ok: true, roles, data: roles });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/mobile/jobs/saved
r.get('/saved', requireUserJwt, async (req, res, next) => {
  try {
    const rows = await prisma.savedJob.findMany({
      where: { userId: req.auth!.userId },
      orderBy: { createdAt: 'desc' },
      include: {
        job: {
          include: {
            role: { select: { id: true, name: true } },
            _count: { select: { applications: true } }
          }
        }
      }
    });

    const jobs = rows.map((row) => shapeMobileJob(row.job));
    res.json({ ok: true, jobs, data: jobs });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/mobile/jobs/:id/save
r.post('/:id/save', requireUserJwt, async (req, res, next) => {
  try {
    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
      select: { id: true }
    });

    if (!job) {
      return res.status(404).json({ ok: false, error: 'Job not found' });
    }

    await prisma.savedJob.upsert({
      where: { userId_jobId: { userId: req.auth!.userId, jobId: req.params.id } },
      update: {},
      create: { userId: req.auth!.userId, jobId: req.params.id }
    });

    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/v1/mobile/jobs/:id/save
r.delete('/:id/save', requireUserJwt, async (req, res, next) => {
  try {
    await prisma.savedJob.deleteMany({
      where: { userId: req.auth!.userId, jobId: req.params.id }
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/mobile/jobs/:id
r.get('/:id', async (req, res, next) => {
  try {
    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
      include: {
        role: { select: { id: true, name: true } },
        _count: { select: { applications: true } }
      }
    });

    if (!job || job.status !== 'OPEN') {
      return res.status(404).json({ ok: false, error: 'Job not found' });
    }

    const payload = {
      job: shapeMobileJob(job)
    };

    res.json({ ok: true, ...payload, data: payload });
  } catch (error) {
    next(error);
  }
});

export default r;
