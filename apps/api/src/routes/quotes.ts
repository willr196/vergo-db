import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { Resend } from "resend";

const r = Router();

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
  honeypot: z.string().max(0).optional() // Should be empty
});

// ============================================
// POST /api/v1/quotes - Submit quote request
// ============================================
r.post("/", async (req, res, next) => {
  try {
    const data = quoteRequestSchema.parse(req.body);
    
    // Check honeypot (spam prevention)
    if (data.honeypot && data.honeypot.length > 0) {
      // Silently reject spam
      console.log(`[SPAM] Quote request honeypot triggered | Email: ${data.email}`);
      return res.status(201).json({ ok: true, message: "Quote request received" });
    }
    
    // Store in database (using Contact model or create a new Quote model)
    // For now, we'll use the existing Contact mechanism or create a simple log
    
    // Build the quote details for logging/email
    const quoteDetails = {
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
      submittedAt: new Date().toISOString()
    };
    
    console.log(`[AUDIT] Quote request received:`, JSON.stringify(quoteDetails, null, 2));
    
    // Send notification email to VERGO team
    if (resend && process.env.VERGO_NOTIFY_EMAIL) {
      try {
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || "noreply@vergoevents.com",
          to: process.env.VERGO_NOTIFY_EMAIL,
          subject: `New Quote Request: ${data.eventType} - ${data.staffNeeded} staff`,
          html: `
            <h2>New Quote Request</h2>
            <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Name</td><td style="padding: 8px; border: 1px solid #ddd;">${quoteDetails.name}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Email</td><td style="padding: 8px; border: 1px solid #ddd;"><a href="mailto:${data.email}">${data.email}</a></td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Phone</td><td style="padding: 8px; border: 1px solid #ddd;">${quoteDetails.phone}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Company</td><td style="padding: 8px; border: 1px solid #ddd;">${quoteDetails.company}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Event Type</td><td style="padding: 8px; border: 1px solid #ddd;">${quoteDetails.eventType}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Event Date</td><td style="padding: 8px; border: 1px solid #ddd;">${quoteDetails.eventDate}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Duration</td><td style="padding: 8px; border: 1px solid #ddd;">${quoteDetails.duration}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Location</td><td style="padding: 8px; border: 1px solid #ddd;">${quoteDetails.location}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Guest Count</td><td style="padding: 8px; border: 1px solid #ddd;">${quoteDetails.guestCount}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Staff Needed</td><td style="padding: 8px; border: 1px solid #ddd;">${quoteDetails.staffNeeded}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Roles</td><td style="padding: 8px; border: 1px solid #ddd;">${quoteDetails.roles}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Estimated Total</td><td style="padding: 8px; border: 1px solid #ddd;">${quoteDetails.estimatedTotal}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Message</td><td style="padding: 8px; border: 1px solid #ddd;">${quoteDetails.message}</td></tr>
            </table>
            <p style="margin-top: 20px; color: #666; font-size: 12px;">Submitted: ${quoteDetails.submittedAt}</p>
          `
        });
        console.log(`[EMAIL] Quote notification sent to ${process.env.VERGO_NOTIFY_EMAIL}`);
      } catch (emailErr) {
        console.error(`[EMAIL] Failed to send quote notification:`, emailErr);
        // Don't fail the request if email fails
      }
    }
    
    // Send confirmation email to requester
    if (resend) {
      try {
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || "noreply@vergoevents.com",
          to: data.email,
          subject: "Quote Request Received - VERGO Events",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #D4AF37;">Thank You for Your Quote Request</h2>
              <p>Hi ${data.name},</p>
              <p>We've received your quote request for <strong>${data.eventType}</strong> and our team will be in touch within 24 hours.</p>
              
              <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin-top: 0;">Your Request Summary</h3>
                <p><strong>Event Type:</strong> ${data.eventType}</p>
                <p><strong>Staff Needed:</strong> ${data.staffNeeded}</p>
                ${data.eventDate ? `<p><strong>Date:</strong> ${data.eventDate}</p>` : ''}
                ${data.location ? `<p><strong>Location:</strong> ${data.location}</p>` : ''}
                ${data.estimatedTotal ? `<p><strong>Estimated Budget:</strong> £${data.estimatedTotal.toLocaleString()}</p>` : ''}
              </div>
              
              <p>If you have any urgent questions, please call us directly or reply to this email.</p>
              
              <p>Best regards,<br>The VERGO Events Team</p>
              
              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
              <p style="color: #999; font-size: 12px;">VERGO Events | Premium Event Staffing</p>
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
      message: "Quote request received. We'll be in touch within 24 hours."
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
