import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';

const r = Router();

// Rate limiter for contact forms (prevent spam)
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 submissions per 15 min per IP
  message: { error: 'Too many submissions. Please try again in 15 minutes.' }
});

// ============================================
// VALIDATION SCHEMAS
// ============================================

const eventEnquirySchema = z.object({
  name: z.string().min(2).max(100).trim(),
  email: z.string().email().max(255).toLowerCase(),
  phone: z.string().max(20).optional(),
  eventType: z.enum(['corporate', 'wedding', 'private', 'music', 'charity', 'festival', 'other']),
  date: z.string().optional(),
  guests: z.number().min(1).optional(),
  message: z.string().min(10).max(2000).trim()
});

const staffRequestSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  email: z.string().email().max(255).toLowerCase(),
  phone: z.string().max(20).optional(),
  company: z.string().min(2).max(100).trim(),
  roles: z.array(z.string()).min(1).max(10),
  date: z.string().min(1),
  staffCount: z.number().min(1).max(100),
  message: z.string().min(10).max(2000).trim()
});

const generalEnquirySchema = z.object({
  name: z.string().min(2).max(100).trim(),
  email: z.string().email().max(255).toLowerCase(),
  subject: z.string().min(3).max(200).trim(),
  message: z.string().min(10).max(2000).trim()
});

// ============================================
// POST /api/v1/contact/event-enquiry
// ============================================
r.post('/event-enquiry', contactLimiter, async (req, res, next) => {
  try {
    const data = eventEnquirySchema.parse(req.body);
    
    // TODO: Send email notification to wrobb@vergoltd.com
    // TODO: Optionally save to database for tracking
    
    console.log('[EVENT ENQUIRY]', {
      from: data.email,
      name: data.name,
      eventType: data.eventType,
      date: data.date,
      guests: data.guests
    });
    
    // For now, just log and return success
    // You can add email service later (Resend, SendGrid, etc.)
    
    res.status(200).json({ 
      success: true, 
      message: 'Event enquiry received. We\'ll be in touch within 24 hours!' 
    });
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid form data', 
        details: error.errors 
      });
    }
    next(error);
  }
});

// ============================================
// POST /api/v1/contact/staff-request
// ============================================
r.post('/staff-request', contactLimiter, async (req, res, next) => {
  try {
    const data = staffRequestSchema.parse(req.body);
    
    console.log('[STAFF REQUEST]', {
      from: data.email,
      name: data.name,
      company: data.company,
      roles: data.roles,
      date: data.date,
      staffCount: data.staffCount
    });
    
    res.status(200).json({ 
      success: true, 
      message: 'Staff request received. We\'ll send you a quote within 24 hours!' 
    });
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid form data', 
        details: error.errors 
      });
    }
    next(error);
  }
});

// ============================================
// POST /api/v1/contact/general
// ============================================
r.post('/general', contactLimiter, async (req, res, next) => {
  try {
    const data = generalEnquirySchema.parse(req.body);
    
    console.log('[GENERAL ENQUIRY]', {
      from: data.email,
      name: data.name,
      subject: data.subject
    });
    
    res.status(200).json({ 
      success: true, 
      message: 'Message received. We\'ll get back to you soon!' 
    });
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid form data', 
        details: error.errors 
      });
    }
    next(error);
  }
});

export default r;