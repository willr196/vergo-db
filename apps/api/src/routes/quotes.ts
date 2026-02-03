import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { prisma } from "../prisma";
import { Resend } from "resend";
import { FROM_EMAIL, TO_EMAIL } from "../services/email";

const r = Router();

const quoteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: "Too many quote submissions. Please try again later." }
});

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const safe = (value: string | number | null | undefined) =>
  escapeHtml(String(value ?? ''));

// Initialize Resend (optional - graceful degradation if not configured)
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// ============================================
// VALIDATION SCHEMA
// ============================================
const quoteRequestSchema = z.object({
  // Contact details
  name: z.string().min(2).max(100).trim(),
  email: z.string().email().max(255).trim(),
  phone: z.string().max(20).optional(),
  company: z.string().max(200).optional(),
  
  // Event details
  eventType: z.string().min(2).max(100).trim(),
  eventDate: z.string().optional(), // ISO date string
  duration: z.number().int().min(1).max(30).optional(), // Days
  location: z.string().max(200).optional(),
  guestCount: z.number().int().min(1).max(100000).optional(),
  
  // Staff requirements
  staffNeeded: z.number().int().min(1).max(500),
  roles: z.array(z.string()).optional(), // Role names/IDs
  
  // Additional info
  message: z.string().max(2000).optional(),
  
  // Calculated estimate (from frontend calculator)
  estimatedTotal: z.number().positive().optional(),
  
  // For spam prevention
  honeypot: z.string().max(0).optional(), // Should be empty
  
  // Optional: Link to existing client (for authenticated requests)
  clientId: z.string().optional()
});

// ============================================
// POST /api/v1/quotes - Submit quote request (PUBLIC)
// ============================================
r.post("/", quoteLimiter, async (req, res, next) => {
  try {
    const data = quoteRequestSchema.parse(req.body);
    
    // Check honeypot (spam prevention)
    if (data.honeypot && data.honeypot.length > 0) {
      // Silently reject spam
      console.log(`[SPAM] Quote request honeypot triggered | Email: ${data.email}`);
      return res.status(201).json({ ok: true, message: "Quote request received" });
    }
    
    // ============================================
    // FIX: Actually save to database!
    // ============================================
    let savedQuote: { id: string } | null = null;
    
    // Try to find existing client by email (for linking)
    let clientId = data.clientId || null;
    if (!clientId) {
      const existingClient = await prisma.client.findUnique({
        where: { email: data.email },
        select: { id: true, status: true }
      });
      if (existingClient && existingClient.status === 'APPROVED') {
        clientId = existingClient.id;
      }
    }
    
    // Only save to DB if we have a client to link to
    // (QuoteRequest requires clientId - it's not optional in schema)
    if (clientId) {
      savedQuote = await prisma.quoteRequest.create({
        data: {
          eventType: data.eventType,
          eventDate: data.eventDate ? new Date(data.eventDate) : null,
          eventEndDate: data.duration && data.eventDate 
            ? new Date(new Date(data.eventDate).getTime() + (data.duration - 1) * 24 * 60 * 60 * 1000)
            : null,
          location: data.location || 'TBC',
          staffCount: data.staffNeeded,
          roles: data.roles?.join(', ') || 'General staff',
          description: data.message || null,
          budget: data.estimatedTotal ? `£${data.estimatedTotal.toLocaleString()}` : null,
          status: 'NEW',
          clientId: clientId
        }
      });
      console.log(`[QUOTE] Saved to database: ${savedQuote.id} for client ${clientId}`);
    } else {
      console.log(`[QUOTE] Not saved to DB (no linked client) - email only for: ${data.email}`);
    }
    
    // Build the quote details for logging/email
    const quoteDetails = {
      id: savedQuote?.id || 'N/A (email only)',
      name: data.name,
      email: data.email,
      phone: data.phone || "Not provided",
      company: data.company || "Not provided",
      eventType: data.eventType,
      eventDate: data.eventDate || "Flexible",
      duration: data.duration ? `${data.duration} day(s)` : "Not specified",
      location: data.location || "TBC",
      guestCount: data.guestCount || "Not specified",
      staffNeeded: data.staffNeeded,
      roles: data.roles?.join(", ") || "General staff",
      message: data.message || "None",
      estimatedTotal: data.estimatedTotal ? `£${data.estimatedTotal.toLocaleString()}` : "Not calculated",
      submittedAt: new Date().toISOString(),
      savedToDb: !!savedQuote
    };
    
    console.log(`[AUDIT] Quote request received:`, JSON.stringify(quoteDetails, null, 2));
    
    // Send notification email to VERGO team
    if (resend) {
      try {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: TO_EMAIL,
          subject: `New Quote Request: ${data.eventType} - ${data.staffNeeded} staff`,
          html: `
            <h2>New Quote Request</h2>
            ${savedQuote ? `<p style="color: green;"><strong>✅ Saved to database:</strong> ${safe(savedQuote.id)}</p>` : '<p style="color: orange;"><strong>⚠️ Email only</strong> (no linked client account)</p>'}
            <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Name</td><td style="padding: 8px; border: 1px solid #ddd;">${safe(quoteDetails.name)}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Email</td><td style="padding: 8px; border: 1px solid #ddd;"><a href="mailto:${safe(data.email)}">${safe(data.email)}</a></td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Phone</td><td style="padding: 8px; border: 1px solid #ddd;">${safe(quoteDetails.phone)}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Company</td><td style="padding: 8px; border: 1px solid #ddd;">${safe(quoteDetails.company)}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Occasion Type</td><td style="padding: 8px; border: 1px solid #ddd;">${safe(quoteDetails.eventType)}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Event Date</td><td style="padding: 8px; border: 1px solid #ddd;">${safe(quoteDetails.eventDate)}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Duration</td><td style="padding: 8px; border: 1px solid #ddd;">${safe(quoteDetails.duration)}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Location</td><td style="padding: 8px; border: 1px solid #ddd;">${safe(quoteDetails.location)}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Guest Count</td><td style="padding: 8px; border: 1px solid #ddd;">${safe(quoteDetails.guestCount)}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Staff Needed</td><td style="padding: 8px; border: 1px solid #ddd;">${safe(quoteDetails.staffNeeded)}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Roles</td><td style="padding: 8px; border: 1px solid #ddd;">${safe(quoteDetails.roles)}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Estimated Total</td><td style="padding: 8px; border: 1px solid #ddd;">${safe(quoteDetails.estimatedTotal)}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Message</td><td style="padding: 8px; border: 1px solid #ddd;">${safe(quoteDetails.message)}</td></tr>
            </table>
            <p style="margin-top: 20px; color: #666; font-size: 12px;">Submitted: ${safe(quoteDetails.submittedAt)}</p>
          `
        });
        console.log(`[EMAIL] Quote notification sent to ${TO_EMAIL}`);
      } catch (emailErr) {
        console.error(`[EMAIL] Failed to send quote notification:`, emailErr);
        // Don't fail the request if email fails
      }
    }
    
    // Send confirmation email to requester
    if (resend) {
      try {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: data.email,
          subject: "Quote Request Received - VERGO",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #D4AF37; padding: 20px; text-align: center;">
                <h1 style="color: white; margin: 0;">VERGO</h1>
              </div>
              
              <div style="padding: 30px; background: #f9f9f9;">
                <h2 style="color: #2c3e2f; margin-top: 0;">Thank You for Your Quote Request</h2>
                <p>Hi ${safe(data.name)},</p>
                <p>We've received your quote request for <strong>${safe(data.eventType)}</strong> and our team will be in touch within 24 hours.</p>
                
                <div style="background: #fff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #D4AF37;">
                  <h3 style="margin-top: 0; color: #2c3e2f;">Your Request Summary</h3>
                  <p><strong>Occasion Type:</strong> ${safe(data.eventType)}</p>
                  <p><strong>Staff Needed:</strong> ${safe(data.staffNeeded)}</p>
                  ${data.eventDate ? `<p><strong>Date:</strong> ${safe(data.eventDate)}</p>` : ''}
                  ${data.location ? `<p><strong>Location:</strong> ${safe(data.location)}</p>` : ''}
                  ${data.estimatedTotal ? `<p><strong>Estimated Budget:</strong> £${safe(data.estimatedTotal.toLocaleString())}</p>` : ''}
                  ${savedQuote ? `<p style="color: #666; font-size: 12px;"><strong>Reference:</strong> ${safe(savedQuote.id)}</p>` : ''}
                </div>
                
                <p>If you have any urgent questions, please call us directly or reply to this email.</p>
                
                <p>Best regards,<br>The VERGO Team</p>
              </div>
              
              <div style="padding: 20px; text-align: center; color: #666; font-size: 12px; background: #f0f0f0;">
                <p style="margin: 0;">VERGO Ltd | London, United Kingdom</p>
              </div>
            </div>
          `
        });
        console.log(`[EMAIL] Quote confirmation sent to ${data.email}`);
      } catch (emailErr) {
        console.error(`[EMAIL] Failed to send quote confirmation:`, emailErr);
      }
    }
    
    res.status(201).json({ 
      ok: true, 
      message: "Quote request received. We'll be in touch within 24 hours.",
      quoteId: savedQuote?.id || null
    });
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Invalid input", 
        details: error.issues.map(i => i.message)
      });
    }
    next(error);
  }
});

export default r;
