import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { TO_EMAIL, sendQuoteNotificationEmail, sendQuoteConfirmationEmail } from "../services/email";
import { emailSendingSuppressed } from "../services/email/suppression";
import { logger, maskEmail } from "../services/logger";
import { SITE_TERMS } from "../config/pricing";

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

// Sending is optional - graceful degradation if Resend is not configured, and
// never attempted at all under NODE_ENV=test.
const emailEnabled = !emailSendingSuppressed() && Boolean(process.env.RESEND_API_KEY);

// ============================================
// VALIDATION SCHEMAS
// ============================================
// Two intents share this endpoint. A booking is someone saying "yes, book this",
// so it has to carry everything we need to actually staff the job. An enquiry is
// someone asking a question off the back of the on-page estimate — the only thing
// we insist on there is a way of replying to them.
const baseQuoteShape = {
  // Contact details
  name: z.string().min(2).max(100).trim().optional(),
  email: z.string().email().max(255).trim().optional(),
  phone: z.string().max(20).optional(),
  company: z.string().max(200).optional(),
  
  // Event details
  eventType: z.string().min(2).max(100).trim().optional(),
  eventDate: z.string().optional(), // ISO date string
  duration: z.number().int().min(1).max(30).optional(), // Days
  location: z.string().max(200).optional(),
  venue: z.string().max(200).optional(),
  shiftStart: z.string().max(10).optional(),
  shiftEnd: z.string().max(10).optional(),
  // An overnight finish. Without it a 22:00-03:00 shift reads as either five
  // hours or a typo, and the roster needs to know which.
  shiftEndsNextDay: z.boolean().optional(),
  guestCount: z.number().int().min(1).max(100000).optional(),
  // What the team should turn up in: "all blacks", "black tie", the client's
  // own branded kit. Free text, optional on both intents.
  dressCode: z.string().max(200).trim().optional(),
  requestedLane: z.enum(["FLEX", "SELECT", "MANAGED"]).optional(),
  // Standard or Premium, chosen for the whole booking on the quote form.
  serviceLevel: z.enum(["STANDARD", "PREMIUM"]).optional(),
  
  // Staff requirements. staffNeeded is the headcount across every role;
  // staffByRole carries the mix behind it, which is what the quote form collects.
  staffNeeded: z.number().int().min(1).max(500).optional(),
  roles: z.array(z.string()).optional(), // Role names/IDs
  staffByRole: z
    .array(
      z.object({
        role: z.string().min(1).max(120).trim(),
        count: z.number().int().min(1).max(500),
      })
    )
    .max(20)
    .optional(),
  
  // Additional info
  // The composed body from buildMessage(), not the raw textarea: the typed
  // message is capped at 2,000 there and the appended brief lines at 500 each,
  // so this bound sits above their sum rather than at the textarea's limit.
  message: z.string().max(3200).optional(),
  
  // Calculated estimate (from frontend calculator)
  estimatedTotal: z.number().positive().optional(),
  
  // For spam prevention
  honeypot: z.string().max(0).optional(), // Should be empty
};

const bookingSchema = z.object({
  ...baseQuoteShape,
  intent: z.literal("BOOKING"),
  name: z.string().min(2).max(100).trim(),
  email: z.string().email().max(255).trim(),
  eventType: z.string().min(2).max(100).trim(),
  staffNeeded: z.number().int().min(1).max(500),
});

const enquirySchema = z.object({
  ...baseQuoteShape,
  intent: z.literal("ENQUIRY"),
});

// The one thing an enquiry can't leave out is a way of replying to it. Checked on
// the union rather than inside enquirySchema so both branches stay plain objects,
// which is what z.discriminatedUnion accepts.
const quoteRequestSchema = z
  .discriminatedUnion("intent", [bookingSchema, enquirySchema])
  .superRefine((data, ctx) => {
    if (data.intent === "ENQUIRY" && !data.email && !data.phone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["email"],
        message: "Give us an email address or a phone number so we can reply",
      });
    }
  });

const ROLE_LABELS: Record<string, string> = {
  event_chef: "Event chefs",
  bar_staff: "Bar staff",
  foh: "Front of house",
  catering_assistant: "Catering assistants",
  barista: "Baristas",
  runner: "Runners",
  kitchen_porter: "Kitchen porters",
  waiter: "Waiters",
  supervisor: "Supervisors",
};

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

/** Anything that isn't an explicit enquiry is treated as a booking, which keeps
 *  older payloads (and any integration that predates the two-button form) on the
 *  strict schema they were written against. */
function normaliseIntent(value: unknown): "BOOKING" | "ENQUIRY" {
  const raw = String(value ?? "").trim().toUpperCase();
  if (raw === "ENQUIRY" || raw === "MESSAGE" || raw === "QUESTION") return "ENQUIRY";
  return "BOOKING";
}

function parseNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/** Accepts [{ role, count }] from the quote form, tolerating string counts and
 *  the snake_case shape older integrations post. Role names run through the same
 *  label lookup as a plain roles array so both spellings land the same way. */
function normaliseStaffByRole(input: unknown): { role: string; count: number }[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const entries = input
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      const name = String(raw.role ?? raw.name ?? "").trim();
      const count = parseNumber(raw.count ?? raw.quantity ?? raw.staffNeeded);
      if (!name || count == null || !Number.isInteger(count) || count < 1 || count > 500) return null;
      return { role: ROLE_LABELS[name] || name, count };
    })
    .filter((entry): entry is { role: string; count: number } => entry !== null);
  return entries.length ? entries.slice(0, 20) : undefined;
}

function normaliseRoles(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const roles = input
    .map((value) => {
      const raw = String(value || "").trim();
      if (!raw) return null;
      return ROLE_LABELS[raw] || raw.replace(/[_-]+/g, " ");
    })
    .filter((value): value is string => Boolean(value));
  return roles.length ? roles : undefined;
}

function computeShiftEnd(start: string | undefined, hoursValue: unknown) {
  if (!start) return undefined;
  const hours = parseNumber(hoursValue);
  if (hours == null || hours <= 0 || hours > 24) return undefined;

  const [hourPart, minutePart] = start.split(":");
  const hoursInt = Number(hourPart);
  const minutesInt = Number(minutePart);
  if (!Number.isInteger(hoursInt) || !Number.isInteger(minutesInt)) return undefined;

  const totalMinutes = hoursInt * 60 + minutesInt + Math.round(hours * 60);
  const endHours = Math.floor((totalMinutes / 60) % 24);
  const endMinutes = totalMinutes % 60;
  return `${String(endHours).padStart(2, "0")}:${String(endMinutes).padStart(2, "0")}`;
}

/** The form fields with nowhere structured to sit are folded into the message
 *  body. Each piece is bounded here because the composed result is what the
 *  schema's message cap is checked against: the Halloween brief always appends
 *  a "Special requirements" line, so a message typed up to the textarea's own
 *  2,000-character limit would otherwise push the total over the cap and the
 *  whole enquiry would come back as a 400. */
const MESSAGE_LIMIT = 2000;
const EXTRA_LIMIT = 500;

const clamp = (value: string, limit: number) =>
  value.length > limit ? `${value.slice(0, limit - 1).trimEnd()}…` : value;

function buildMessage(body: Record<string, unknown>) {
  const parts: string[] = [];

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const specialRequirements =
    typeof body.special_requirements === "string" ? body.special_requirements.trim() : "";
  const estimatedHours = parseNumber(body.event_hours);
  const source = typeof body.how_found === "string" ? body.how_found.trim() : "";

  if (message) parts.push(clamp(message, MESSAGE_LIMIT));
  if (specialRequirements) parts.push(`Special requirements: ${clamp(specialRequirements, EXTRA_LIMIT)}`);
  if (estimatedHours != null) parts.push(`Estimated hours: ${estimatedHours}`);
  if (source) parts.push(`Lead source: ${clamp(source, EXTRA_LIMIT)}`);

  return parts.length ? parts.join("\n\n") : undefined;
}

function normaliseQuotePayload(body: unknown) {
  const raw = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const shiftStart =
    typeof raw.shiftStart === "string"
      ? raw.shiftStart
      : typeof raw.event_time === "string"
        ? raw.event_time
        : undefined;

  const staffByRole = normaliseStaffByRole(raw.staffByRole) || normaliseStaffByRole(raw.staff_by_role);
  const roles =
    normaliseRoles(raw.roles) ||
    normaliseRoles(raw.staff_types) ||
    (staffByRole ? staffByRole.map((entry) => entry.role) : undefined);
  const message = buildMessage(raw);
  const intent = normaliseIntent(raw.intent);

  return {
    intent,
    name: firstString(raw.name, raw.contact_name),
    email: firstString(raw.email, raw.contact_email),
    phone: firstString(raw.phone, raw.contact_phone),
    company: firstString(raw.company, raw.company_name),
    // A booking with no event type still needs one to make sense on the roster;
    // an enquiry is allowed to arrive with nothing but a question.
    eventType:
      firstString(raw.eventType, raw.event_type) ||
      (intent === "BOOKING" ? "Hospitality staffing request" : undefined),
    eventDate:
      typeof raw.eventDate === "string"
        ? raw.eventDate
        : typeof raw.event_date === "string"
          ? raw.event_date
          : undefined,
    duration: parseNumber(raw.duration),
    location:
      typeof raw.location === "string"
        ? raw.location
        : typeof raw.event_location === "string"
          ? raw.event_location
          : undefined,
    venue: typeof raw.venue === "string" ? raw.venue : undefined,
    shiftStart,
    shiftEnd:
      typeof raw.shiftEnd === "string"
        ? raw.shiftEnd
        : computeShiftEnd(shiftStart, raw.event_hours),
    shiftEndsNextDay:
      raw.shiftEndsNextDay === true || raw.shift_ends_next_day === true ? true : undefined,
    guestCount: parseNumber(raw.guestCount),
    dressCode: firstString(raw.dressCode, raw.dress_code),
    requestedLane:
      raw.requestedLane === "FLEX" || raw.requestedLane === "SELECT" || raw.requestedLane === "MANAGED"
        ? raw.requestedLane
        : raw.requested_lane === "FLEX" || raw.requested_lane === "SELECT" || raw.requested_lane === "MANAGED"
          ? raw.requested_lane
          : raw.lane_preference === "FLEX" ||
              raw.lane_preference === "SELECT" ||
              raw.lane_preference === "MANAGED"
            ? raw.lane_preference
            : undefined,
    // A per-role brief already says how many people are wanted, so a payload
    // carrying only the breakdown still satisfies the booking schema.
    staffNeeded:
      parseNumber(raw.staffNeeded ?? raw.staff_quantity) ??
      (staffByRole ? staffByRole.reduce((total, entry) => total + entry.count, 0) : undefined),
    roles,
    staffByRole,
    serviceLevel: raw.serviceLevel === "PREMIUM" || raw.serviceLevel === "STANDARD" ? raw.serviceLevel : undefined,
    message,
    estimatedTotal: parseNumber(raw.estimatedTotal),
    honeypot: typeof raw.honeypot === "string" ? raw.honeypot : undefined,
  };
}

// ============================================
// POST /api/v1/quotes - Submit quote request (PUBLIC)
// ============================================
r.post("/", quoteLimiter, async (req, res, next) => {
  try {
    const data = quoteRequestSchema.parse(normaliseQuotePayload(req.body));
    
    // Check honeypot (spam prevention)
    if (data.honeypot && data.honeypot.length > 0) {
      // Silently reject spam
      logger.warn({ event: 'quote_honeypot', ip: req.ip }, 'Quote request honeypot triggered');
      return res.status(201).json({ ok: true, message: "Quote request received" });
    }
    
    const savedQuoteId: string | null = null;
    const isBooking = data.intent === "BOOKING";
    logger.info(
      { email: data.email ? maskEmail(data.email) : null, intent: data.intent },
      'Public quote request received without client linkage'
    );
    
    // Build the quote details for logging/email
    const quoteDetails = {
      id: savedQuoteId || 'N/A (email only)',
      intent: isBooking ? "BOOKING REQUEST" : "Message / question",
      name: data.name || "Not provided",
      email: data.email || "Not provided",
      phone: data.phone || "Not provided",
      company: data.company || "Not provided",
      eventType: data.eventType,
      eventDate: data.eventDate || "Flexible",
      duration: data.duration ? `${data.duration} day(s)` : "Not specified",
      location: data.location || "TBC",
      venue: data.venue || "Not provided",
      shiftStart: data.shiftStart || "Not provided",
      shiftEnd: data.shiftEnd
        ? `${data.shiftEnd}${data.shiftEndsNextDay ? " (next day)" : ""}`
        : "Not provided",
      requestedLane: data.requestedLane || "Not specified",
      guestCount: data.guestCount || "Not specified",
      dressCode: data.dressCode || "Not specified",
      staffNeeded: data.staffNeeded,
      serviceLevel: data.serviceLevel === "PREMIUM" ? "Premium" : data.serviceLevel === "STANDARD" ? "Standard" : "Not specified",
      roles: data.roles?.join(", ") || "General staff",
      staffByRole: data.staffByRole?.map((entry) => `${entry.role} × ${entry.count}`).join(", ") || null,
      message: data.message || "None",
      estimatedTotal: data.estimatedTotal ? `£${data.estimatedTotal.toLocaleString()}` : "Not calculated",
      staffNeededLabel: data.staffNeeded ?? "Not specified",
      submittedAt: new Date().toISOString(),
      savedToDb: !!savedQuoteId
    };
    
    logger.info(
      {
        quoteId: savedQuoteId,
        intent: data.intent,
        eventType: data.eventType,
        requestedLane: data.requestedLane || null,
        staffNeeded: data.staffNeeded,
        hasLinkedClient: false,
      },
      'Quote request received'
    );
    
    // Send notification email to VERGO team
    if (emailEnabled) {
      try {
        const sent = await sendQuoteNotificationEmail({
          subject: isBooking
            ? `BOOKING REQUEST: ${data.eventType} — ${data.staffNeeded} staff${data.eventDate ? ` on ${data.eventDate}` : ""}`
            // The occasion is appended when the form supplied one, so a Halloween
            // brief is identifiable in the inbox without opening it. Enquiries from
            // the plain quote page carry no event type and read as before.
            : `Message from ${data.name || data.email || "the quote page"}${data.eventType ? ` — ${data.eventType}` : ""}`,
          html: `
            <h2 style="margin-bottom: 4px;">${isBooking ? "Booking request" : "Message from the quote page"}</h2>
            <p style="margin-top: 0; padding: 10px 14px; border-radius: 6px; font-weight: bold; background: ${isBooking ? "#e6f6ea" : "#f2f0ea"}; color: #1a1410;">
              ${isBooking
                ? "They asked to book. Confirm availability and come back with a confirmation."
                : "This is a question, not a booking. Nothing has been committed."}
            </p>
            ${savedQuoteId ? `<p style="color: green;"><strong>✅ Saved to database:</strong> ${safe(savedQuoteId)}</p>` : '<p style="color: orange;"><strong>⚠️ Email only</strong> (no linked client account)</p>'}
            <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Name</td><td style="padding: 8px; border: 1px solid #ddd;">${safe(quoteDetails.name)}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Email</td><td style="padding: 8px; border: 1px solid #ddd;"><a href="mailto:${safe(data.email)}">${safe(data.email)}</a></td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Phone</td><td style="padding: 8px; border: 1px solid #ddd;">${safe(quoteDetails.phone)}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Company</td><td style="padding: 8px; border: 1px solid #ddd;">${safe(quoteDetails.company)}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Occasion Type</td><td style="padding: 8px; border: 1px solid #ddd;">${safe(quoteDetails.eventType)}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Requested Lane</td><td style="padding: 8px; border: 1px solid #ddd;">${safe(quoteDetails.requestedLane)}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Event Date</td><td style="padding: 8px; border: 1px solid #ddd;">${safe(quoteDetails.eventDate)}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Venue</td><td style="padding: 8px; border: 1px solid #ddd;">${safe(quoteDetails.venue)}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Shift</td><td style="padding: 8px; border: 1px solid #ddd;">${safe(`${quoteDetails.shiftStart} - ${quoteDetails.shiftEnd}`)}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Duration</td><td style="padding: 8px; border: 1px solid #ddd;">${safe(quoteDetails.duration)}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Location</td><td style="padding: 8px; border: 1px solid #ddd;">${safe(quoteDetails.location)}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Guest Count</td><td style="padding: 8px; border: 1px solid #ddd;">${safe(quoteDetails.guestCount)}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Staff Needed</td><td style="padding: 8px; border: 1px solid #ddd;">${safe(quoteDetails.staffNeededLabel)}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Service level</td><td style="padding: 8px; border: 1px solid #ddd;">${safe(quoteDetails.serviceLevel)}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Roles</td><td style="padding: 8px; border: 1px solid #ddd;">${safe(quoteDetails.staffByRole || quoteDetails.roles)}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Dress Code</td><td style="padding: 8px; border: 1px solid #ddd;">${safe(quoteDetails.dressCode)}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Estimate shown on page</td><td style="padding: 8px; border: 1px solid #ddd;">${safe(quoteDetails.estimatedTotal)}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Message</td><td style="padding: 8px; border: 1px solid #ddd;">${safe(quoteDetails.message)}</td></tr>
            </table>
            <p style="margin-top: 20px; color: #666; font-size: 12px;">Submitted: ${safe(quoteDetails.submittedAt)}</p>
          `
        });
        // The Resend SDK never throws: a rate limit, an HTTP error and a network
        // failure all come back as { data: null, error }. Awaiting the send and
        // logging "sent" reported every one of those as a success, and a public
        // quote is email-only — a lost notification is a lost lead.
        if (!sent?.success) {
          logger.error(
            { event: 'quote_notification_failed', to: TO_EMAIL, emailError: sent?.error },
            'Quote notification was not sent'
          );
        } else {
          console.log(`[EMAIL] Quote notification sent to ${TO_EMAIL} (${sent.id})`);
        }
      } catch (emailErr) {
        console.error(`[EMAIL] Failed to send quote notification:`, emailErr);
        // Don't fail the request if email fails
      }
    }
    
    // Send confirmation email to requester — only if they left us an email address
    // (an enquiry can arrive with a phone number and nothing else).
    if (emailEnabled && data.email) {
      try {
        const sent = await sendQuoteConfirmationEmail({
          to: data.email,
          subject: isBooking ? "Booking request received - VERGO" : "We've got your message - VERGO",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #D4AF37; padding: 20px; text-align: center;">
                <h1 style="color: white; margin: 0;">VERGO</h1>
              </div>
              
              <div style="padding: 30px; background: #f9f9f9;">
                <h2 style="color: #2c3e2f; margin-top: 0;">${isBooking ? "We've got your booking request" : "We've got your message"}</h2>
                <p>Hi ${safe(data.name || 'there')},</p>
                ${isBooking
                  ? `<p>You've asked us to book staff${data.eventType ? ` for your <strong>${safe(data.eventType)}</strong>` : ''}. Nothing is confirmed until we come back to you with names. ${safe(SITE_TERMS.confirmationPromise)}</p>`
                  : `<p>Thanks for getting in touch. This was sent as a question rather than a booking, so nothing has been booked or charged. We'll reply as soon as we can, usually the same day.</p>`}
                
                ${isBooking ? `<div style="background: #fff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #D4AF37;">
                  <h3 style="margin-top: 0; color: #2c3e2f;">What you asked for</h3>
                  <p><strong>Occasion Type:</strong> ${safe(data.eventType)}</p>
                  <p><strong>Staff Needed:</strong> ${safe(quoteDetails.staffByRole || data.staffNeeded)}</p>
                  ${data.eventDate ? `<p><strong>Date:</strong> ${safe(data.eventDate)}</p>` : ''}
                  ${data.location ? `<p><strong>Location:</strong> ${safe(data.location)}</p>` : ''}
                  ${data.dressCode ? `<p><strong>Dress code:</strong> ${safe(data.dressCode)}</p>` : ''}
                  ${data.shiftStart && data.shiftEnd ? `<p><strong>Times:</strong> ${safe(data.shiftStart)} - ${safe(data.shiftEnd)}${data.shiftEndsNextDay ? ' (next day)' : ''}</p>` : ''}
                  ${data.estimatedTotal ? `<p><strong>Estimate shown on the page:</strong> £${safe(data.estimatedTotal.toLocaleString())}</p><p style="color: #666; font-size: 12px; margin: 4px 0 0;">An estimate, not a final invoice. We confirm the figure before anything is charged.</p>` : ''}
                  ${savedQuoteId ? `<p style="color: #666; font-size: 12px;"><strong>Reference:</strong> ${safe(savedQuoteId)}</p>` : ''}
                </div>` : ''}
                
                <p>If anything is urgent, please call us directly or reply to this email.</p>
                
                <p>Best regards,<br>The VERGO Team</p>
              </div>
              
              <div style="padding: 20px; text-align: center; color: #666; font-size: 12px; background: #f0f0f0;">
                <p style="margin: 0;">VERGO Ltd | London, United Kingdom</p>
              </div>
            </div>
          `
        });
        if (!sent?.success) {
          logger.error(
            { event: 'quote_confirmation_failed', to: maskEmail(data.email), emailError: sent?.error },
            'Quote confirmation was not sent'
          );
        } else {
          console.log(`[EMAIL] Quote confirmation sent to ${maskEmail(data.email)} (${sent.id})`);
        }
      } catch (emailErr) {
        console.error(`[EMAIL] Failed to send quote confirmation:`, emailErr);
      }
    }
    
    res.status(201).json({
      ok: true,
      intent: data.intent,
      message: isBooking
        ? "Booking request received. Nothing is confirmed until we come back to you."
        : "Message received. Nothing has been booked — we'll reply shortly.",
      quoteId: savedQuoteId
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
