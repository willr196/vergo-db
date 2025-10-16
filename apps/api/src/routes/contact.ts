import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { sendEventEnquiryEmail, sendStaffRequestEmail, sendGeneralEnquiryEmail } from '../services/email';

const r = Router();

// Rate limiter for contact forms (prevent spam)
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 submissions per 15 min per IP
  message: { error: 'Too many submissions. Please try again in 15 minutes.' }
});

// ============================================
// SPAM PROTECTION - Honeypot field
// ============================================
// All schemas include optional honeypot field
// If this field is filled, it's likely a bot

const honeypotCheck = (data: any) => {
  // Check for honeypot field (should be empty)
  if (data.website || data.url || data.phone_number) {
    console.warn('[SPAM] Honeypot triggered:', { 
      ip: 'unknown', 
      fields: Object.keys(data).filter(k => ['website', 'url', 'phone_number'].includes(k))
    });
    return true;
  }
  return false;
};

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
  message: z.string().min(10).max(2000).trim(),
  // Honeypot fields (should remain empty)
  website: z.string().optional(),
  url: z.string().optional()
});

const staffRequestSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  email: z.string().email().max(255).toLowerCase(),
  phone: z.string().max(20).optional(),
  company: z.string().min(2).max(100).trim(),
  roles: z.array(z.string()).min(1).max(10),
  date: z.string().min(1),
  staffCount: z.number().min(1).max(100),
  message: z.string().min(10).max(2000).trim(),
  // Honeypot fields
  website: z.string().optional(),
  url: z.string().optional()
});

const generalEnquirySchema = z.object({
  name: z.string().min(2).max(100).trim(),
  email: z.string().email().max(255).toLowerCase(),
  subject: z.string().min(3).max(200).trim(),
  message: z.string().min(10).max(2000).trim(),
  // Honeypot fields
  website: z.string().optional(),
  url: z.string().optional()
});

// ============================================
// POST /api/v1/contact/event-enquiry
// ============================================
r.post('/event-enquiry', contactLimiter, async (req, res, next) => {
  try {
    const data = eventEnquirySchema.parse(req.body);
    
    // Check honeypot
    if (honeypotCheck(data)) {
      // Return success to bot but don't send email
      return res.status(200).json({ 
        success: true, 
        message: 'Event enquiry received.' 
      });
    }
    
    // Send email notification
    await sendEventEnquiryEmail(data);
    
    console.log('[EVENT ENQUIRY]', {
      from: data.email,
      name: data.name,
      eventType: data.eventType,
      date: data.date,
      guests: data.guests
    });
    
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
    
    console.error('[ERROR] Event enquiry failed:', error);
    
    // Don't expose internal errors to client
    res.status(500).json({ 
      error: 'Unable to process your enquiry. Please try again or email us directly at wrobb@vergoltd.com' 
    });
  }
});

// ============================================
// POST /api/v1/contact/staff-request
// ============================================
r.post('/staff-request', contactLimiter, async (req, res, next) => {
  try {
    const data = staffRequestSchema.parse(req.body);
    
    // Check honeypot
    if (honeypotCheck(data)) {
      return res.status(200).json({ 
        success: true, 
        message: 'Staff request received.' 
      });
    }
    
    // Send email notification
    await sendStaffRequestEmail(data);
    
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
    
    console.error('[ERROR] Staff request failed:', error);
    
    res.status(500).json({ 
      error: 'Unable to process your request. Please try again or email us directly at wrobb@vergoltd.com' 
    });
  }
});

// ============================================
// POST /api/v1/contact/general
// ============================================
r.post('/general', contactLimiter, async (req, res, next) => {
  try {
    const data = generalEnquirySchema.parse(req.body);
    
    // Check honeypot
    if (honeypotCheck(data)) {
      return res.status(200).json({ 
        success: true, 
        message: 'Message received.' 
      });
    }
    
    // Send email notification
    await sendGeneralEnquiryEmail(data);
    
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
    
    console.error('[ERROR] General enquiry failed:', error);
    
    res.status(500).json({ 
      error: 'Unable to send your message. Please try again or email us directly at wrobb@vergoltd.com' 
    });
  }
});

export default r;