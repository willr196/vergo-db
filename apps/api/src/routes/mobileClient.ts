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

export default r;
