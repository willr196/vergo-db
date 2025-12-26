// ============================================
// ADD TO: apps/api/src/routes/jobs.ts
// Add these routes BEFORE the "r.get('/:id')" route
// ============================================

import rateLimit from 'express-rate-limit';

// Rate limiter for public submissions
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 submissions per hour per IP
  message: { error: 'Too many submissions. Please try again later.' }
});

// ============================================
// PUBLIC: POST /api/v1/jobs/submit - External company submits a job
// ============================================
const submitJobSchema = z.object({
  // Company info
  companyName: z.string().min(2).max(200).trim(),
  posterEmail: z.string().email().max(200),
  
  // Job info
  title: z.string().min(3).max(200).trim(),
  roleId: z.string().min(1),
  location: z.string().min(2).max(200).trim(),
  description: z.string().min(20).max(5000).trim(),
  
  // Pay
  payRateMin: z.number().positive().max(500).optional(),
  payRateMax: z.number().positive().max(500).optional(),
  payType: z.enum(["HOURLY", "DAILY", "FIXED"]).default("HOURLY"),
  
  // Application method (email OR external URL)
  applyEmail: z.string().email().max(200).optional(),
  externalUrl: z.string().url().max(500).optional(),
  
  // Honeypot
  website: z.string().max(0).optional(), // Must be empty
  
  // Confirmation
  confirm: z.literal(true, { 
    errorMap: () => ({ message: "You must confirm the information is accurate" })
  })
});

r.post("/submit", submitLimiter, async (req, res, next) => {
  try {
    const data = submitJobSchema.parse(req.body);
    
    // Honeypot check
    if (data.website) {
      // Bot detected - silently accept but don't save
      return res.status(201).json({ 
        success: true, 
        message: "Job submitted for review" 
      });
    }
    
    // Must have either applyEmail or externalUrl
    if (!data.applyEmail && !data.externalUrl) {
      return res.status(400).json({ 
        error: "Please provide either an application email or external URL" 
      });
    }
    
    // Verify role exists
    const role = await prisma.role.findUnique({ 
      where: { id: data.roleId } 
    });
    
    if (!role) {
      return res.status(400).json({ error: "Invalid role selected" });
    }
    
    // Use the higher pay rate if range provided, otherwise min
    const payRate = data.payRateMax || data.payRateMin || null;
    
    // Create job with PENDING status
    const job = await prisma.job.create({
      data: {
        title: data.title,
        description: data.description,
        type: "EXTERNAL",
        status: "PENDING", // Requires admin approval
        location: data.location,
        companyName: data.companyName,
        posterEmail: data.posterEmail,
        payRate: payRate,
        payType: data.payType,
        externalUrl: data.externalUrl || null,
        roleId: data.roleId,
        staffNeeded: 1
      }
    });
    
    console.log(`[JOB SUBMISSION] New | Company: ${data.companyName} | Email: ${data.posterEmail} | Title: ${data.title} | ID: ${job.id}`);
    
    // TODO: Send notification email to admin
    // sendJobSubmissionNotification({ ... })
    
    res.status(201).json({ 
      success: true, 
      message: "Job submitted successfully! We'll review and publish it within 24 hours.",
      id: job.id
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

// ============================================
// ADMIN: PATCH /api/v1/jobs/:id/approve - Approve pending job
// ============================================
r.patch("/:id/approve", adminAuth, async (req, res, next) => {
  try {
    const job = await prisma.job.findUnique({ 
      where: { id: req.params.id } 
    });
    
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    if (job.status !== "PENDING") {
      return res.status(400).json({ error: "Job is not pending approval" });
    }
    
    const updated = await prisma.job.update({
      where: { id: req.params.id },
      data: { 
        status: "OPEN",
        publishedAt: new Date()
      }
    });
    
    console.log(`[AUDIT] Job approved | ID: ${job.id} | Title: ${job.title} | Admin: ${req.session.username}`);
    
    // TODO: Send approval email to poster
    // if (job.posterEmail) sendJobApprovalEmail(job.posterEmail, job.title);
    
    res.json({ success: true, job: updated });
    
  } catch (error) {
    next(error);
  }
});

// ============================================
// ADMIN: PATCH /api/v1/jobs/:id/reject - Reject pending job
// ============================================
r.patch("/:id/reject", adminAuth, async (req, res, next) => {
  try {
    const { reason } = z.object({
      reason: z.string().max(500).optional()
    }).parse(req.body);
    
    const job = await prisma.job.findUnique({ 
      where: { id: req.params.id } 
    });
    
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    // Delete rejected job (or you could set status to CLOSED)
    await prisma.job.delete({ where: { id: req.params.id } });
    
    console.log(`[AUDIT] Job rejected | ID: ${job.id} | Title: ${job.title} | Admin: ${req.session.username} | Reason: ${reason || 'Not specified'}`);
    
    // TODO: Send rejection email to poster
    // if (job.posterEmail) sendJobRejectionEmail(job.posterEmail, job.title, reason);
    
    res.json({ success: true });
    
  } catch (error) {
    next(error);
  }
});


// ============================================
// ADD TO SCHEMA: apps/api/prisma/schema.prisma
// ============================================
// 
// Update the JobStatus enum:
// enum JobStatus {
//   PENDING     // Submitted by external company, awaiting approval
//   DRAFT       // Admin created, not published
//   OPEN        // Live and accepting applications
//   FILLED      // All positions filled
//   CLOSED      // Manually closed/cancelled
// }
//
// Add to Job model:
//   posterEmail   String?       // Email of person who submitted (for external jobs)
