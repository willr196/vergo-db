import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { sendStaffRequestEmail, sendGeneralEnquiryEmail } from '../services/email';
import { prisma } from '../prisma';

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

const staffRequestSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  email: z.string().email().max(255).toLowerCase(),
  phone: z.string().max(20).optional(),
  company: z.string().min(2).max(100).trim(),
  roles: z.array(z.string()).min(1).max(10),
  date: z.string().optional(), // Made optional - event date is no longer required
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
// POST /api/v1/contact/staff-request
// ============================================
r.post('/staff-request', contactLimiter, async (req, res, next) => {
  try {
    const data = staffRequestSchema.parse(req.body);
    
    // Check honeypot
    if (honeypotCheck(data)) {
      return res.status(200).json({
        ok: true,
        success: true,
        message: 'Staff request received.',
        data: { success: true, message: 'Staff request received.' }
      });
    }
    
    // Send email notification
    await sendStaffRequestEmail(data);

    await prisma.contact.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        company: data.company,
        type: 'STAFF_REQUEST',
        eventDate: data.date ? new Date(data.date) : null,
        staffCount: data.staffCount,
        roles: JSON.stringify(data.roles),
        message: data.message,
        status: 'NEW'
      }
    });
    
    console.log('[STAFF REQUEST]', {
      from: data.email.slice(0, 2) + '***',
      name: data.name,
      company: data.company,
      roles: data.roles,
      date: data.date,
      staffCount: data.staffCount
    });
    
    res.status(200).json({
      ok: true,
      success: true,
      message: 'Staff request received. We\'ll send you a quote within 24 hours!',
      data: { success: true, message: 'Staff request received. We\'ll send you a quote within 24 hours!' }
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
        ok: true,
        success: true,
        message: 'Message received.',
        data: { success: true, message: 'Message received.' }
      });
    }
    
    // Send email notification
    await sendGeneralEnquiryEmail(data);

    await prisma.contact.create({
      data: {
        name: data.name,
        email: data.email,
        type: 'GENERAL',
        subject: data.subject,
        message: data.message,
        status: 'NEW'
      }
    });
    
    console.log('[GENERAL ENQUIRY]', {
      from: data.email.slice(0, 2) + '***',
      name: data.name,
      subject: data.subject
    });
    
    res.status(200).json({
      ok: true,
      success: true,
      message: 'Message received. We\'ll get back to you soon!',
      data: { success: true, message: 'Message received. We\'ll get back to you soon!' }
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
