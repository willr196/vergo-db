import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../prisma";
import { sendUserVerificationEmail, sendPasswordResetEmail } from "../services/email";

const r = Router();

// ============================================
// SESSION TYPES
// ============================================
declare module "express-session" {
  interface SessionData {
    userId?: string;
    userEmail?: string;
    isUser?: boolean;
  }
}

// ============================================
// VALIDATION SCHEMAS
// ============================================
const registerSchema = z.object({
  email: z.string().email().max(255).toLowerCase().trim(),
  password: z.string().min(8).max(72),
  firstName: z.string().min(1).max(100).trim(),
  lastName: z.string().min(1).max(100).trim(),
  phone: z.string().max(20).optional()
});

const loginSchema = z.object({
  email: z.string().email().max(255).toLowerCase().trim(),
  password: z.string().min(1).max(72)
});

const forgotPasswordSchema = z.object({
  email: z.string().email().max(255).toLowerCase().trim()
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(72)
});

// ============================================
// RATE LIMITERS
// ============================================
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 registrations per hour per IP
  message: { error: "Too many registration attempts. Try again later." }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 min
  skipSuccessfulRequests: true,
  message: { error: "Too many login attempts. Try again in 15 minutes." }
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 reset requests per hour
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
// POST /api/v1/user/register
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
    
    const { email, password, firstName, lastName, phone } = parsed.data;
    
    // Check if email already exists
    const existing = await prisma.user.findUnique({ 
      where: { email },
      select: { id: true }
    });
    
    if (existing) {
      // Don't reveal that email exists (security)
      // But still return success-like response
      return res.status(200).json({ 
        ok: true,
        message: "If this email is not registered, you will receive a verification email."
      });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);
    const verifyToken = generateToken();
    
    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        phone: phone || null,
        verifyToken,
        emailVerified: false
      }
    });
    
    // Send verification email (async, don't block)
    sendUserVerificationEmail({
      to: email,
      name: firstName,
      token: verifyToken
    }).catch(err => {
      console.error("[EMAIL] Failed to send verification:", err);
    });
    
    console.log(`[USER] New registration: ${email}`);
    
    res.status(201).json({ 
      ok: true,
      message: "Registration successful. Please check your email to verify your account."
    });
    
  } catch (error) {
    console.error("[ERROR] Registration failed:", error);
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
});

// ============================================
// GET /api/v1/user/verify-email?token=xxx
// ============================================
r.get("/verify-email", async (req, res) => {
  try {
    const token = req.query.token as string;
    
    if (!token || token.length !== 64) {
      return res.status(400).json({ error: "Invalid verification link" });
    }
    
    const user = await prisma.user.findFirst({
      where: { verifyToken: token },
      select: { id: true, emailVerified: true }
    });
    
    if (!user) {
      return res.status(400).json({ error: "Invalid or expired verification link" });
    }
    
    if (user.emailVerified) {
      return res.status(200).json({ ok: true, message: "Email already verified" });
    }
    
    await prisma.user.update({
      where: { id: user.id },
      data: { 
        emailVerified: true,
        verifyToken: null
      }
    });
    
    console.log(`[USER] Email verified: ${user.id}`);
    
    // Redirect to login page with success message
    res.redirect("/login.html?verified=true");
    
  } catch (error) {
    console.error("[ERROR] Email verification failed:", error);
    res.status(500).json({ error: "Verification failed" });
  }
});

// ============================================
// POST /api/v1/user/login
// ============================================
r.post("/login", loginLimiter, async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input" });
    }
    
    const { email, password } = parsed.data;
    
    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        firstName: true,
        lastName: true,
        emailVerified: true,
        failedAttempts: true,
        lockedUntil: true
      }
    });
    
    // Constant-time comparison (prevents timing attacks)
    const hashToCompare = user?.passwordHash || DUMMY_HASH;
    const passwordMatches = await bcrypt.compare(password, hashToCompare);
    
    // Check if account is locked
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      return res.status(423).json({ 
        error: `Account temporarily locked. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? "s" : ""}.`
      });
    }
    
    // Invalid credentials
    if (!user || !passwordMatches) {
      if (user) {
        const newFailedAttempts = (user.failedAttempts || 0) + 1;
        const shouldLock = newFailedAttempts >= 5;
        
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedAttempts: newFailedAttempts,
            lockedUntil: shouldLock ? new Date(Date.now() + 30 * 60 * 1000) : null
          }
        });
        
        if (shouldLock) {
          return res.status(423).json({ 
            error: "Too many failed attempts. Account locked for 30 minutes."
          });
        }
      }
      
      return res.status(401).json({ error: "Invalid email or password" });
    }
    
    // Check email verification
    if (!user.emailVerified) {
      return res.status(403).json({ 
        error: "Please verify your email before logging in.",
        code: "EMAIL_NOT_VERIFIED"
      });
    }
    
    // Reset failed attempts
    if (user.failedAttempts > 0 || user.lockedUntil) {
      await prisma.user.update({
        where: { id: user.id },
        data: { 
          failedAttempts: 0, 
          lockedUntil: null,
          lastLoginAt: new Date()
        }
      });
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() }
      });
    }
    
    // Create session
    req.session.regenerate((err) => {
      if (err) {
        console.error("[ERROR] Session regeneration failed:", err);
        return res.status(500).json({ error: "Login failed" });
      }
      
      req.session.userId = user.id;
      req.session.userEmail = user.email;
      req.session.isUser = true;
      
      req.session.save((err) => {
        if (err) {
          console.error("[ERROR] Session save failed:", err);
          return res.status(500).json({ error: "Login failed" });
        }
        
        console.log(`[USER] Login: ${email}`);
        
        res.json({ 
          ok: true,
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName
          }
        });
      });
    });
    
  } catch (error) {
    console.error("[ERROR] Login failed:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// ============================================
// POST /api/v1/user/logout
// ============================================
r.post("/logout", (req, res) => {
  const email = req.session?.userEmail;
  
  req.session.destroy((err) => {
    if (err) {
      console.error("[ERROR] Logout failed:", err);
      return res.status(500).json({ error: "Logout failed" });
    }
    
    res.clearCookie("vergo.sid", {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict"
    });
    
    if (email) {
      console.log(`[USER] Logout: ${email}`);
    }
    
    res.json({ ok: true });
  });
});

// ============================================
// GET /api/v1/user/session
// ============================================
r.get("/session", async (req, res) => {
  if (!req.session?.isUser || !req.session?.userId) {
    return res.json({ authenticated: false });
  }
  
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        applicantId: true
      }
    });
    
    if (!user) {
      return res.json({ authenticated: false });
    }
    
    res.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        isOnRoster: !!user.applicantId // They've applied to join VERGO
      }
    });
    
  } catch (error) {
    console.error("[ERROR] Session check failed:", error);
    res.json({ authenticated: false });
  }
});

// ============================================
// POST /api/v1/user/forgot-password
// ============================================
r.post("/forgot-password", forgotPasswordLimiter, async (req, res) => {
  try {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid email" });
    }
    
    const { email } = parsed.data;
    
    // Always return success (don't reveal if email exists)
    const successResponse = { 
      ok: true, 
      message: "If an account exists with this email, you will receive a password reset link."
    };
    
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, firstName: true }
    });
    
    if (!user) {
      return res.json(successResponse);
    }
    
    const resetToken = generateToken();
    const resetTokenExp = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    
    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken, resetTokenExp }
    });
    
    // Send reset email
    sendPasswordResetEmail({
      to: email,
      name: user.firstName,
      token: resetToken
    }).catch(err => {
      console.error("[EMAIL] Failed to send password reset:", err);
    });
    
    console.log(`[USER] Password reset requested: ${email}`);
    
    res.json(successResponse);
    
  } catch (error) {
    console.error("[ERROR] Forgot password failed:", error);
    res.status(500).json({ error: "Request failed" });
  }
});

// ============================================
// POST /api/v1/user/reset-password
// ============================================
r.post("/reset-password", async (req, res) => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input" });
    }
    
    const { token, password } = parsed.data;
    
    const user = await prisma.user.findFirst({
      where: { 
        resetToken: token,
        resetTokenExp: { gt: new Date() }
      },
      select: { id: true, email: true }
    });
    
    if (!user) {
      return res.status(400).json({ error: "Invalid or expired reset link" });
    }
    
    const passwordHash = await bcrypt.hash(password, 12);
    
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExp: null,
        failedAttempts: 0,
        lockedUntil: null
      }
    });
    
    console.log(`[USER] Password reset complete: ${user.email}`);
    
    res.json({ ok: true, message: "Password reset successful. You can now log in." });
    
  } catch (error) {
    console.error("[ERROR] Password reset failed:", error);
    res.status(500).json({ error: "Reset failed" });
  }
});

// ============================================
// POST /api/v1/user/resend-verification
// ============================================
r.post("/resend-verification", forgotPasswordLimiter, async (req, res) => {
  try {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid email" });
    }
    
    const { email } = parsed.data;
    
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, firstName: true, emailVerified: true }
    });
    
    // Don't reveal if email exists
    const successResponse = { ok: true, message: "If the email exists and is unverified, a new verification link has been sent." };
    
    if (!user || user.emailVerified) {
      return res.json(successResponse);
    }
    
    const verifyToken = generateToken();
    
    await prisma.user.update({
      where: { id: user.id },
      data: { verifyToken }
    });
    
    sendUserVerificationEmail({
      to: email,
      name: user.firstName,
      token: verifyToken
    }).catch(err => {
      console.error("[EMAIL] Failed to resend verification:", err);
    });
    
    res.json(successResponse);
    
  } catch (error) {
    console.error("[ERROR] Resend verification failed:", error);
    res.status(500).json({ error: "Request failed" });
  }
});

export default r;