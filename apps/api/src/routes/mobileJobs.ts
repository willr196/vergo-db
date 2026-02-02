import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';

const r = Router();

const listJobsQuerySchema = z.object({
  role: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

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

    const shaped = jobs.map(job => ({
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
      applicationCount: job._count.applications,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    }));

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

// GET /api/v1/mobile/jobs/meta/roles
r.get('/meta/roles', async (req, res, next) => {
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
      job: {
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
        applicationCount: job._count.applications,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt
      }
    };

    res.json({ ok: true, ...payload, data: payload });
  } catch (error) {
    next(error);
  }
});

export default r;
