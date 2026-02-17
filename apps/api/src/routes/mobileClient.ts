import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireClientJwt } from '../middleware/jwtAuth';

const r = Router();

// All routes require client JWT authentication
r.use(requireClientJwt);

// ============================================
// VALIDATION SCHEMAS
// ============================================
const createQuoteSchema = z.object({
  eventType: z.string().min(2).max(100).trim(),
  eventDate: z.string().optional(),
  eventEndDate: z.string().optional(),
  location: z.string().min(2).max(200).trim(),
  venue: z.string().max(200).optional(),
  staffCount: z.number().int().min(1).max(500),
  roles: z.string().max(500), // Comma-separated
  shiftStart: z.string().max(10).optional(),
  shiftEnd: z.string().max(10).optional(),
  description: z.string().max(2000).optional(),
  budget: z.string().max(100).optional()
});

const listQuotesSchema = z.object({
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

// ---------- Job management schemas ----------
const createClientJobSchema = z.object({
  title: z.string().min(3).max(200).trim(),
  description: z.string().min(10).max(5000).trim(),
  requirements: z.string().max(2000).trim().nullable().optional(),
  status: z.enum(["DRAFT", "OPEN"]).default("DRAFT"),
  location: z.string().min(2).max(200).trim(),
  venue: z.string().max(200).trim().nullable().optional(),
  payRate: z.number().positive().max(1000).nullable().optional(),
  payType: z.enum(["HOURLY", "DAILY", "FIXED"]).default("HOURLY"),
  eventDate: z.string().nullable().optional(),
  eventEndDate: z.string().nullable().optional(),
  shiftStart: z.string().max(10).trim().nullable().optional(),
  shiftEnd: z.string().max(10).trim().nullable().optional(),
  staffNeeded: z.number().int().min(1).max(100).default(1),
  closingDate: z.string().nullable().optional(),
  roleId: z.string().min(1)
});

const updateClientJobSchema = createClientJobSchema.partial();

const listClientJobsSchema = z.object({
  status: z.enum(["DRAFT", "OPEN", "FILLED", "CLOSED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

const updateApplicationStatusSchema = z.object({
  status: z.enum(["PENDING", "REVIEWED", "SHORTLISTED", "CONFIRMED", "REJECTED"]),
  adminNotes: z.string().max(2000).optional()
});

// ============================================
// GET /api/v1/client/mobile/stats - Dashboard statistics
// ============================================
r.get('/stats', async (req, res) => {
  try {
    const clientId = req.auth!.userId;
    
    const [totalQuotes, newQuotes, quotedQuotes, acceptedQuotes, completedQuotes] = await Promise.all([
      prisma.quoteRequest.count({ where: { clientId } }),
      prisma.quoteRequest.count({ where: { clientId, status: 'NEW' } }),
      prisma.quoteRequest.count({ where: { clientId, status: 'QUOTED' } }),
      prisma.quoteRequest.count({ where: { clientId, status: 'ACCEPTED' } }),
      prisma.quoteRequest.count({ where: { clientId, status: 'COMPLETED' } })
    ]);
    
    const stats = {
      totalQuotes,
      pending: newQuotes,
      quoted: quotedQuotes,
      accepted: acceptedQuotes,
      completed: completedQuotes,
      // For backward compatibility if frontend expects these names
      total: totalQuotes,
      activeQuotes: newQuotes + quotedQuotes
    };
    
    res.json({ ok: true, stats, data: stats });
    
  } catch (error) {
    console.error('[ERROR] Get client stats failed:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch stats' });
  }
});

// ============================================
// GET /api/v1/client/mobile/quotes - List client's quotes
// ============================================
r.get('/quotes', async (req, res) => {
  try {
    const clientId = req.auth!.userId;
    const query = listQuotesSchema.parse(req.query);
    const skip = (query.page - 1) * query.limit;
    
    const where: any = { clientId };
    if (query.status) {
      where.status = query.status.toUpperCase();
    }
    
    const [quotes, total] = await Promise.all([
      prisma.quoteRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
        select: {
          id: true,
          eventType: true,
          eventDate: true,
          eventEndDate: true,
          location: true,
          venue: true,
          staffCount: true,
          roles: true,
          shiftStart: true,
          shiftEnd: true,
          description: true,
          budget: true,
          status: true,
          quotedAmount: true,
          quoteSentAt: true,
          adminNotes: false, // Don't expose admin notes to client
          createdAt: true,
          updatedAt: true
        }
      }),
      prisma.quoteRequest.count({ where })
    ]);
    
    // Shape response for mobile
    const shaped = quotes.map(q => ({
      id: q.id,
      eventType: q.eventType,
      eventDate: q.eventDate?.toISOString() || null,
      eventEndDate: q.eventEndDate?.toISOString() || null,
      location: q.location,
      venue: q.venue,
      staffCount: q.staffCount,
      roles: q.roles,
      shiftStart: q.shiftStart,
      shiftEnd: q.shiftEnd,
      description: q.description,
      budget: q.budget,
      status: q.status.toLowerCase(), // Frontend expects lowercase
      quotedAmount: q.quotedAmount ? Number(q.quotedAmount) : null,
      quoteSentAt: q.quoteSentAt?.toISOString() || null,
      createdAt: q.createdAt.toISOString(),
      updatedAt: q.updatedAt.toISOString()
    }));
    
    const totalPages = Math.ceil(total / query.limit);
    
    res.json({
      ok: true,
      quotes: shaped,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages,
        hasMore: query.page < totalPages
      },
      data: {
        quotes: shaped,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages,
          hasMore: query.page < totalPages
        }
      }
    });
    
  } catch (error) {
    console.error('[ERROR] Get client quotes failed:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch quotes' });
  }
});

// ============================================
// GET /api/v1/client/mobile/quotes/:id - Single quote detail
// ============================================
r.get('/quotes/:id', async (req, res) => {
  try {
    const clientId = req.auth!.userId;
    
    const quote = await prisma.quoteRequest.findFirst({
      where: {
        id: req.params.id,
        clientId // Ensure client owns this quote
      },
      select: {
        id: true,
        eventType: true,
        eventDate: true,
        eventEndDate: true,
        location: true,
        venue: true,
        staffCount: true,
        roles: true,
        shiftStart: true,
        shiftEnd: true,
        description: true,
        budget: true,
        status: true,
        quotedAmount: true,
        quoteSentAt: true,
        createdAt: true,
        updatedAt: true
      }
    });
    
    if (!quote) {
      return res.status(404).json({ ok: false, error: 'Quote not found' });
    }
    
    const shaped = {
      id: quote.id,
      eventType: quote.eventType,
      eventDate: quote.eventDate?.toISOString() || null,
      eventEndDate: quote.eventEndDate?.toISOString() || null,
      location: quote.location,
      venue: quote.venue,
      staffCount: quote.staffCount,
      roles: quote.roles,
      shiftStart: quote.shiftStart,
      shiftEnd: quote.shiftEnd,
      description: quote.description,
      budget: quote.budget,
      status: quote.status.toLowerCase(),
      quotedAmount: quote.quotedAmount ? Number(quote.quotedAmount) : null,
      quoteSentAt: quote.quoteSentAt?.toISOString() || null,
      createdAt: quote.createdAt.toISOString(),
      updatedAt: quote.updatedAt.toISOString()
    };
    
    res.json({ ok: true, quote: shaped, data: shaped });
    
  } catch (error) {
    console.error('[ERROR] Get quote detail failed:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch quote' });
  }
});

// ============================================
// POST /api/v1/client/mobile/quotes - Create new quote request
// ============================================
r.post('/quotes', async (req, res) => {
  try {
    const clientId = req.auth!.userId;
    
    const parsed = createQuoteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid input',
        details: parsed.error.issues.map(i => i.message)
      });
    }
    
    const data = parsed.data;
    
    const quote = await prisma.quoteRequest.create({
      data: {
        eventType: data.eventType,
        eventDate: data.eventDate ? new Date(data.eventDate) : null,
        eventEndDate: data.eventEndDate ? new Date(data.eventEndDate) : null,
        location: data.location,
        venue: data.venue || null,
        staffCount: data.staffCount,
        roles: data.roles,
        shiftStart: data.shiftStart || null,
        shiftEnd: data.shiftEnd || null,
        description: data.description || null,
        budget: data.budget || null,
        status: 'NEW',
        clientId
      }
    });
    
    console.log(`[QUOTE] Created quote ${quote.id} for client ${clientId}`);
    
    const shaped = {
      id: quote.id,
      eventType: quote.eventType,
      eventDate: quote.eventDate?.toISOString() || null,
      eventEndDate: quote.eventEndDate?.toISOString() || null,
      location: quote.location,
      venue: quote.venue,
      staffCount: quote.staffCount,
      roles: quote.roles,
      shiftStart: quote.shiftStart,
      shiftEnd: quote.shiftEnd,
      description: quote.description,
      budget: quote.budget,
      status: quote.status.toLowerCase(),
      createdAt: quote.createdAt.toISOString(),
      updatedAt: quote.updatedAt.toISOString()
    };
    
    res.status(201).json({ ok: true, quote: shaped, data: shaped });
    
  } catch (error) {
    console.error('[ERROR] Create quote failed:', error);
    res.status(500).json({ ok: false, error: 'Failed to create quote' });
  }
});

// ============================================
// DELETE /api/v1/client/mobile/quotes/:id - Cancel quote request
// (Only allowed if status is NEW)
// ============================================
r.delete('/quotes/:id', async (req, res) => {
  try {
    const clientId = req.auth!.userId;
    
    const quote = await prisma.quoteRequest.findFirst({
      where: {
        id: req.params.id,
        clientId
      },
      select: { id: true, status: true }
    });
    
    if (!quote) {
      return res.status(404).json({ ok: false, error: 'Quote not found' });
    }
    
    if (quote.status !== 'NEW') {
      return res.status(400).json({
        ok: false,
        error: 'Can only cancel quotes that have not been processed yet'
      });
    }
    
    await prisma.quoteRequest.delete({
      where: { id: req.params.id }
    });
    
    console.log(`[QUOTE] Cancelled quote ${req.params.id} by client ${clientId}`);
    
    res.json({ ok: true, message: 'Quote cancelled' });
    
  } catch (error) {
    console.error('[ERROR] Cancel quote failed:', error);
    res.status(500).json({ ok: false, error: 'Failed to cancel quote' });
  }
});

// ============================================
// HELPER: look up the authenticated client's companyName
// ============================================
async function getClientCompanyName(clientId: string): Promise<string | null> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { companyName: true }
  });
  return client?.companyName ?? null;
}

// Helper to shape a job record for mobile response
function shapeJob(job: any) {
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
    closingDate: job.closingDate,
    publishedAt: job.publishedAt,
    role: job.role,
    applicationCount: job._count?.applications ?? 0,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };
}

// ============================================
// GET /api/v1/client/mobile/jobs - List client's own jobs
// ============================================
r.get('/jobs', async (req, res) => {
  try {
    const clientId = req.auth!.userId;
    const companyName = await getClientCompanyName(clientId);

    if (!companyName) {
      return res.status(400).json({ ok: false, error: 'Client company not found' });
    }

    const query = listClientJobsSchema.parse(req.query);
    const skip = (query.page - 1) * query.limit;

    const where: any = { companyName };
    if (query.status) where.status = query.status;

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
        include: {
          role: { select: { id: true, name: true } },
          _count: { select: { applications: true } }
        }
      }),
      prisma.job.count({ where })
    ]);

    const shaped = jobs.map(shapeJob);
    const totalPages = Math.ceil(total / query.limit);

    res.json({
      ok: true,
      jobs: shaped,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages,
        hasMore: query.page < totalPages
      }
    });
  } catch (error) {
    console.error('[ERROR] Get client jobs failed:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch jobs' });
  }
});

// ============================================
// GET /api/v1/client/mobile/jobs/:id - Get single job (must belong to client)
// ============================================
r.get('/jobs/:id', async (req, res) => {
  try {
    const clientId = req.auth!.userId;
    const companyName = await getClientCompanyName(clientId);

    if (!companyName) {
      return res.status(400).json({ ok: false, error: 'Client company not found' });
    }

    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
      include: {
        role: { select: { id: true, name: true } },
        _count: { select: { applications: true } }
      }
    });

    if (!job || job.companyName !== companyName) {
      return res.status(404).json({ ok: false, error: 'Job not found' });
    }

    const shaped = shapeJob(job);
    res.json({ ok: true, job: shaped, data: shaped });
  } catch (error) {
    console.error('[ERROR] Get client job detail failed:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch job' });
  }
});

// ============================================
// POST /api/v1/client/mobile/jobs - Create a new job
// ============================================
r.post('/jobs', async (req, res) => {
  try {
    const clientId = req.auth!.userId;
    const companyName = await getClientCompanyName(clientId);

    if (!companyName) {
      return res.status(400).json({ ok: false, error: 'Client company not found' });
    }

    const parsed = createClientJobSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid input',
        details: parsed.error.issues.map(i => i.message)
      });
    }

    const data = parsed.data;

    // Verify role exists
    const role = await prisma.role.findUnique({ where: { id: data.roleId } });
    if (!role) {
      return res.status(400).json({ ok: false, error: 'Invalid role' });
    }

    const job = await prisma.job.create({
      data: {
        title: data.title,
        description: data.description,
        requirements: data.requirements || null,
        type: 'EXTERNAL', // Client-created jobs are external
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
        companyName,
        closingDate: data.closingDate ? new Date(data.closingDate) : null,
        publishedAt: data.status === 'OPEN' ? new Date() : null,
        roleId: data.roleId
      },
      include: {
        role: { select: { id: true, name: true } },
        _count: { select: { applications: true } }
      }
    });

    console.log(`[JOB] Client ${clientId} created job ${job.id}: ${job.title}`);

    const shaped = shapeJob(job);
    res.status(201).json({ ok: true, job: shaped, data: shaped });
  } catch (error) {
    console.error('[ERROR] Create client job failed:', error);
    res.status(500).json({ ok: false, error: 'Failed to create job' });
  }
});

// ============================================
// PUT /api/v1/client/mobile/jobs/:id - Update a job
// ============================================
r.put('/jobs/:id', async (req, res) => {
  try {
    const clientId = req.auth!.userId;
    const companyName = await getClientCompanyName(clientId);

    if (!companyName) {
      return res.status(400).json({ ok: false, error: 'Client company not found' });
    }

    const existing = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.companyName !== companyName) {
      return res.status(404).json({ ok: false, error: 'Job not found' });
    }

    const parsed = updateClientJobSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid input',
        details: parsed.error.issues.map(i => i.message)
      });
    }

    const data = parsed.data;

    // If role is being changed, verify it exists
    if (data.roleId) {
      const role = await prisma.role.findUnique({ where: { id: data.roleId } });
      if (!role) {
        return res.status(400).json({ ok: false, error: 'Invalid role' });
      }
    }

    // Set publishedAt when status changes to OPEN
    let publishedAt = existing.publishedAt;
    if (data.status === 'OPEN' && existing.status !== 'OPEN') {
      publishedAt = new Date();
    }

    const job = await prisma.job.update({
      where: { id: req.params.id },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.description && { description: data.description }),
        ...(data.requirements !== undefined && { requirements: data.requirements || null }),
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
        ...(data.closingDate !== undefined && { closingDate: data.closingDate ? new Date(data.closingDate) : null }),
        ...(data.roleId && { roleId: data.roleId }),
        publishedAt
      },
      include: {
        role: { select: { id: true, name: true } },
        _count: { select: { applications: true } }
      }
    });

    console.log(`[JOB] Client ${clientId} updated job ${job.id}`);

    const shaped = shapeJob(job);
    res.json({ ok: true, job: shaped, data: shaped });
  } catch (error) {
    console.error('[ERROR] Update client job failed:', error);
    res.status(500).json({ ok: false, error: 'Failed to update job' });
  }
});

// ============================================
// POST /api/v1/client/mobile/jobs/:id/close - Close a job
// ============================================
r.post('/jobs/:id/close', async (req, res) => {
  try {
    const clientId = req.auth!.userId;
    const companyName = await getClientCompanyName(clientId);

    if (!companyName) {
      return res.status(400).json({ ok: false, error: 'Client company not found' });
    }

    const existing = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.companyName !== companyName) {
      return res.status(404).json({ ok: false, error: 'Job not found' });
    }

    if (existing.status === 'CLOSED') {
      return res.status(400).json({ ok: false, error: 'Job is already closed' });
    }

    const job = await prisma.job.update({
      where: { id: req.params.id },
      data: { status: 'CLOSED' },
      include: {
        role: { select: { id: true, name: true } },
        _count: { select: { applications: true } }
      }
    });

    console.log(`[JOB] Client ${clientId} closed job ${job.id}`);

    const shaped = shapeJob(job);
    res.json({ ok: true, job: shaped, data: shaped });
  } catch (error) {
    console.error('[ERROR] Close client job failed:', error);
    res.status(500).json({ ok: false, error: 'Failed to close job' });
  }
});

// ============================================
// GET /api/v1/client/mobile/jobs/:id/applications - List applicants for a job
// ============================================
r.get('/jobs/:id/applications', async (req, res) => {
  try {
    const clientId = req.auth!.userId;
    const companyName = await getClientCompanyName(clientId);

    if (!companyName) {
      return res.status(400).json({ ok: false, error: 'Client company not found' });
    }

    // Verify job belongs to client
    const job = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!job || job.companyName !== companyName) {
      return res.status(404).json({ ok: false, error: 'Job not found' });
    }

    const query = z.object({
      status: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(20)
    }).parse(req.query);

    const skip = (query.page - 1) * query.limit;
    const where: any = { jobId: req.params.id };
    if (query.status) where.status = query.status.toUpperCase();

    const [applications, total] = await Promise.all([
      prisma.jobApplication.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true
            }
          },
          job: {
            select: { id: true, title: true }
          }
        }
      }),
      prisma.jobApplication.count({ where })
    ]);

    const shaped = applications.map(app => ({
      id: app.id,
      jobId: app.jobId,
      userId: app.userId,
      status: app.status,
      coverNote: app.coverNote,
      user: app.user,
      jobSeeker: app.user,
      job: app.job,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt
    }));

    const totalPages = Math.ceil(total / query.limit);

    res.json({
      ok: true,
      applications: shaped,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages,
        hasMore: query.page < totalPages
      }
    });
  } catch (error) {
    console.error('[ERROR] Get job applications failed:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch applications' });
  }
});

// ============================================
// PUT /api/v1/client/mobile/jobs/:jobId/applications/:appId/status - Update application status
// ============================================
r.put('/jobs/:jobId/applications/:appId/status', async (req, res) => {
  try {
    const clientId = req.auth!.userId;
    const companyName = await getClientCompanyName(clientId);

    if (!companyName) {
      return res.status(400).json({ ok: false, error: 'Client company not found' });
    }

    // Verify job belongs to client
    const job = await prisma.job.findUnique({ where: { id: req.params.jobId } });
    if (!job || job.companyName !== companyName) {
      return res.status(404).json({ ok: false, error: 'Job not found' });
    }

    const parsed = updateApplicationStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid input',
        details: parsed.error.issues.map(i => i.message)
      });
    }

    const existing = await prisma.jobApplication.findFirst({
      where: { id: req.params.appId, jobId: req.params.jobId }
    });

    if (!existing) {
      return res.status(404).json({ ok: false, error: 'Application not found' });
    }

    const application = await prisma.jobApplication.update({
      where: { id: req.params.appId },
      data: {
        status: parsed.data.status,
        ...(parsed.data.adminNotes && { adminNotes: parsed.data.adminNotes })
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true
          }
        },
        job: {
          select: { id: true, title: true }
        }
      }
    });

    // If hired/confirmed, increment staffConfirmed
    if (parsed.data.status === 'CONFIRMED' && existing.status !== 'CONFIRMED') {
      await prisma.job.update({
        where: { id: req.params.jobId },
        data: { staffConfirmed: { increment: 1 } }
      });
    }

    console.log(`[JOB] Client ${clientId} updated application ${application.id} to ${parsed.data.status}`);

    const shaped = {
      id: application.id,
      jobId: application.jobId,
      userId: application.userId,
      status: application.status,
      coverNote: application.coverNote,
      user: application.user,
      jobSeeker: application.user,
      job: application.job,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt
    };

    res.json({ ok: true, application: shaped, data: shaped });
  } catch (error) {
    console.error('[ERROR] Update application status failed:', error);
    res.status(500).json({ ok: false, error: 'Failed to update application' });
  }
});

export default r;
