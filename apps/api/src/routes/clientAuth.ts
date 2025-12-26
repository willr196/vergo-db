import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../prisma";
// NOTE: Add these functions to your existing email.ts file
// import { sendClientVerificationEmail, sendClientApprovalEmail, sendClientRejectionEmail } from "../services/email";

const r = Router();

// ============================================
// VALIDATION SCHEMAS
// ============================================
const registerSchema = z.object({
  companyName: z.string().min(2).max(200).trim(),
  industry: z.string().max(100).optional(),
  website: z.string().url().max(200).optional().or(z.literal("")),
  companySize: z.string().max(50).optional(),
  contactName: z.string().min(2).max(100).trim(),
  email: z.string().email().max(100).toLowerCase().trim(),
  password: z.string().min(8).max(72),
  phone: z.string().max(20).optional(),
  jobTitle: z.string().max(100).optional()
});

const loginSchema = z.object({
  email: z.string().email().max(100).toLowerCase().trim(),
  password: z.string().min(1).max(72)
});

const forgotPasswordSchema = z.object({
  email: z.string().email().max(100).toLowerCase().trim()
});

const resetPasswordSchema = z.object({
  token: z.string().length(64),
  password: z.string().min(8).max(72)
});

// ============================================
// RATE LIMITING
// ============================================
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { error: "Too many registration attempts. Try again later." }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  skipSuccessfulRequests: true,
  message: { error: "Too many login attempts. Try again in 15 minutes." }
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: { error: "Too many reset requests. Try again later." }
});

// ============================================
// HELPERS
// ============================================
const DUMMY_HASH = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.G0G0G0G0G0G0G0";

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// ============================================
// POST /api/v1/clients/register
// ============================================
r.post("/register", registerLimiter, async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({ 
        error: "Invalid input",
        details: parsed.error.issues.map(i => i.message)
      });
    }
    
    const { 
      companyName, industry, website, companySize,
      contactName, email, password, phone, jobTitle 
    } = parsed.data;
    
    // Check if email already exists
    const existing = await prisma.client.findUnique({ 
      where: { email },
      select: { id: true }
    });
    
    if (existing) {
      // Don't reveal that email exists (security)
      return res.status(200).json({ 
        ok: true,
        message: "If this email is not registered, you will receive a verification email."
      });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);
    const verifyToken = generateToken();
    const verifyTokenExp = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    // Create client
    const client = await prisma.client.create({
      data: {
        companyName,
        industry: industry || null,
        website: website || null,
        companySize: companySize || null,
        contactName,
        email,
        passwordHash,
        phone: phone || null,
        jobTitle: jobTitle || null,
        verifyToken,
        verifyTokenExp,
        emailVerified: false,
        status: "PENDING"
      }
    });
    
    // TODO: Send verification email
    // sendClientVerificationEmail({
    //   to: email,
    //   name: contactName,
    //   companyName,
    //   token: verifyToken
    // }).catch(err => {
    //   console.error("[EMAIL] Failed to send client verification:", err);
    // });
    
    console.log(`[CLIENT] New registration: ${companyName} (${email})`);
    console.log(`[CLIENT] Verify token: ${verifyToken}`); // Remove in production
    
    res.status(201).json({ 
      ok: true,
      message: "Registration successful. Please check your email to verify your account. Once verified, your account will be reviewed by our team."
    });
    
  } catch (error) {
    console.error("[ERROR] Client registration failed:", error);
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
});

// ============================================
// GET /api/v1/clients/verify-email?token=xxx
// ============================================
r.get("/verify-email", async (req, res) => {
  try {
    const token = req.query.token as string;
    
    if (!token || token.length !== 64) {
      return res.status(400).json({ error: "Invalid verification link" });
    }
    
    const client = await prisma.client.findFirst({
      where: { 
        verifyToken: token,
        verifyTokenExp: { gt: new Date() }
      },
      select: { id: true, emailVerified: true, companyName: true }
    });
    
    if (!client) {
      return res.status(400).json({ error: "Invalid or expired verification link" });
    }
    
    if (client.emailVerified) {
      return res.redirect("/client-login.html?verified=already");
    }
    
    await prisma.client.update({
      where: { id: client.id },
      data: { 
        emailVerified: true,
        verifyToken: null,
        verifyTokenExp: null
      }
    });
    
    console.log(`[CLIENT] Email verified: ${client.companyName}`);
    
    // Redirect to login page with success message
    res.redirect("/client-login.html?verified=true");
    
  } catch (error) {
    console.error("[ERROR] Client email verification failed:", error);
    res.status(500).json({ error: "Verification failed" });
  }
});

// ============================================
// POST /api/v1/clients/login
// ============================================
r.post("/login", loginLimiter, async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input" });
    }
    
    const { email, password } = parsed.data;
    
    // Find client
    const client = await prisma.client.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        companyName: true,
        contactName: true,
        emailVerified: true,
        status: true,
        failedAttempts: true,
        lockedUntil: true
      }
    });
    
    // Constant-time comparison
    const hashToCompare = client?.passwordHash || DUMMY_HASH;
    const passwordMatches = await bcrypt.compare(password, hashToCompare);
    
    // Check if account is locked
    if (client?.lockedUntil && client.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((client.lockedUntil.getTime() - Date.now()) / 60000);
      return res.status(423).json({ 
        error: `Account temporarily locked. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`
      });
    }
    
    // Handle invalid credentials
    if (!client || !passwordMatches) {
      if (client) {
        const newFailedAttempts = (client.failedAttempts || 0) + 1;
        const shouldLock = newFailedAttempts >= 5;
        
        await prisma.client.update({
          where: { id: client.id },
          data: {
            failedAttempts: newFailedAttempts,
            lockedUntil: shouldLock ? new Date(Date.now() + 30 * 60 * 1000) : null
          }
        });
      }
      return res.status(401).json({ error: "Invalid email or password" });
    }
    
    // Check email verification
    if (!client.emailVerified) {
      return res.status(403).json({ 
        error: "Please verify your email before logging in. Check your inbox for the verification link.",
        code: "EMAIL_NOT_VERIFIED"
      });
    }
    
    // Check approval status
    if (client.status === "PENDING") {
      return res.status(403).json({ 
        error: "Your account is pending approval. We'll notify you once it's been reviewed.",
        code: "PENDING_APPROVAL"
      });
    }
    
    if (client.status === "REJECTED") {
      return res.status(403).json({ 
        error: "Your account application was not approved. Please contact us for more information.",
        code: "REJECTED"
      });
    }
    
    if (client.status === "SUSPENDED") {
      return res.status(403).json({ 
        error: "Your account has been suspended. Please contact us for assistance.",
        code: "SUSPENDED"
      });
    }
    
    // Success! Reset failed attempts and update last login
    await prisma.client.update({
      where: { id: client.id },
      data: {
        failedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date()
      }
    });
    
    // Set session
    (req.session as any).clientId = client.id;
    (req.session as any).clientEmail = client.email;
    (req.session as any).isClient = true;
    
    console.log(`[CLIENT] Login: ${client.companyName}`);
    
    res.json({
      ok: true,
      client: {
        id: client.id,
        email: client.email,
        companyName: client.companyName,
        contactName: client.contactName
      }
    });
    
  } catch (error) {
    console.error("[ERROR] Client login failed:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// ============================================
// POST /api/v1/clients/logout
// ============================================
r.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("[ERROR] Client logout failed:", err);
      return res.status(500).json({ error: "Logout failed" });
    }
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

// ============================================
// GET /api/v1/clients/session
// ============================================
r.get("/session", async (req, res) => {
  try {
    const clientId = (req.session as any)?.clientId;
    const isClient = (req.session as any)?.isClient;
    
    if (!clientId || !isClient) {
      return res.json({ authenticated: false });
    }
    
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        email: true,
        companyName: true,
        contactName: true,
        phone: true,
        industry: true,
        website: true,
        status: true
      }
    });
    
    if (!client || client.status !== "APPROVED") {
      return res.json({ authenticated: false });
    }
    
    res.json({
      authenticated: true,
      client
    });
    
  } catch (error) {
    console.error("[ERROR] Client session check failed:", error);
    res.json({ authenticated: false });
  }
});

// ============================================
// POST /api/v1/clients/forgot-password
// ============================================
r.post("/forgot-password", forgotPasswordLimiter, async (req, res) => {
  try {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid email" });
    }
    
    const { email } = parsed.data;
    
    const successResponse = { 
      ok: true, 
      message: "If an account exists with this email, you will receive a password reset link."
    };
    
    const client = await prisma.client.findUnique({
      where: { email },
      select: { id: true, contactName: true }
    });
    
    if (!client) {
      return res.json(successResponse);
    }
    
    const resetToken = generateToken();
    const resetTokenExp = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    
    await prisma.client.update({
      where: { id: client.id },
      data: { resetToken, resetTokenExp }
    });
    
    // TODO: Send reset email
    console.log(`[CLIENT] Password reset requested: ${email}`);
    console.log(`[CLIENT] Reset token: ${resetToken}`); // Remove in production
    
    res.json(successResponse);
    
  } catch (error) {
    console.error("[ERROR] Client forgot password failed:", error);
    res.status(500).json({ error: "Request failed" });
  }
});

// ============================================
// POST /api/v1/clients/reset-password
// ============================================
r.post("/reset-password", async (req, res) => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input" });
    }
    
    const { token, password } = parsed.data;
    
    const client = await prisma.client.findFirst({
      where: { 
        resetToken: token,
        resetTokenExp: { gt: new Date() }
      },
      select: { id: true, email: true }
    });
    
    if (!client) {
      return res.status(400).json({ error: "Invalid or expired reset link" });
    }
    
    const passwordHash = await bcrypt.hash(password, 12);
    
    await prisma.client.update({
      where: { id: client.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExp: null,
        failedAttempts: 0,
        lockedUntil: null
      }
    });
    
    console.log(`[CLIENT] Password reset complete: ${client.email}`);
    
    res.json({ ok: true, message: "Password reset successful. You can now log in." });
    
  } catch (error) {
    console.error("[ERROR] Client reset password failed:", error);
    res.status(500).json({ error: "Reset failed" });
  }
});

// ============================================
// GET /api/v1/clients/profile (authenticated)
// ============================================
r.get("/profile", async (req, res) => {
  try {
    const clientId = (req.session as any)?.clientId;
    
    if (!clientId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        companyName: true,
        industry: true,
        website: true,
        companySize: true,
        contactName: true,
        email: true,
        phone: true,
        jobTitle: true,
        createdAt: true
      }
    });
    
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }
    
    res.json(client);
    
  } catch (error) {
    console.error("[ERROR] Get client profile failed:", error);
    res.status(500).json({ error: "Failed to get profile" });
  }
});

// ============================================
// PUT /api/v1/clients/profile (authenticated)
// ============================================
const updateProfileSchema = z.object({
  companyName: z.string().min(2).max(200).trim().optional(),
  industry: z.string().max(100).optional(),
  website: z.string().url().max(200).optional().or(z.literal("")),
  companySize: z.string().max(50).optional(),
  contactName: z.string().min(2).max(100).trim().optional(),
  phone: z.string().max(20).optional(),
  jobTitle: z.string().max(100).optional()
});

r.put("/profile", async (req, res) => {
  try {
    const clientId = (req.session as any)?.clientId;
    
    if (!clientId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    const parsed = updateProfileSchema.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input" });
    }
    
    const client = await prisma.client.update({
      where: { id: clientId },
      data: parsed.data,
      select: {
        id: true,
        companyName: true,
        industry: true,
        website: true,
        companySize: true,
        contactName: true,
        email: true,
        phone: true,
        jobTitle: true
      }
    });
    
    res.json({ ok: true, client });
    
  } catch (error) {
    console.error("[ERROR] Update client profile failed:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

export default r;