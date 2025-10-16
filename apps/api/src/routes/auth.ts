import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcrypt";
import { z } from "zod";
import { prisma } from "../prisma";

const r = Router();

// ============================================
// INPUT VALIDATION
// ============================================
const loginSchema = z.object({
  username: z.string().min(1).max(100).trim(),
  password: z.string().min(1).max(72)
});

// ============================================
// RATE LIMITING
// ============================================
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Too many login attempts. Try again in 10 minutes." },
  keyGenerator: (req) => {
    const username = req.body?.username || 'unknown';
    return `${req.ip}-${username}`;
  }
});

// ============================================
// CONSTANT-TIME VERIFICATION (prevents timing attacks)
// ============================================
const DUMMY_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

async function verifyCredentials(username: string, password: string) {
  const user = await prisma.adminUser.findUnique({ 
    where: { username },
    select: {
      id: true,
      username: true,
      password: true,
      failedAttempts: true,
      lockedUntil: true
    }
  });
  
  // Always perform bcrypt comparison (prevents timing attacks)
  const hashToCompare = user?.password || DUMMY_HASH;
  const passwordMatches = await bcrypt.compare(password, hashToCompare);
  
  return { user, passwordMatches };
}

// ============================================
// POST /api/v1/auth/login
// ============================================
r.post("/login", loginLimiter, async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({ 
        error: "Invalid input"
      });
    }
    
    const { username, password } = parsed.data;
    const { user, passwordMatches } = await verifyCredentials(username, password);
    
    // Check if account is locked
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000
      );
      return res.status(423).json({ 
        error: `Account temporarily locked. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.` 
      });
    }
    
    // Handle invalid credentials
    if (!user || !passwordMatches) {
      if (user) {
        const newFailedAttempts = (user.failedAttempts || 0) + 1;
        const shouldLock = newFailedAttempts >= 5;
        
        await prisma.adminUser.update({
          where: { id: user.id },
          data: {
            failedAttempts: newFailedAttempts,
            lockedUntil: shouldLock 
              ? new Date(Date.now() + 30 * 60 * 1000)
              : null
          }
        });
        
        console.warn(`[SECURITY] Failed login: ${username} (${newFailedAttempts}/5)`);
        
        if (shouldLock) {
          console.warn(`[SECURITY] Account locked: ${username}`);
          return res.status(423).json({ 
            error: "Too many failed attempts. Account locked for 30 minutes." 
          });
        }
      }
      
      return res.status(401).json({ error: "Invalid credentials" });
    }
    
    // Reset failed attempts on successful login
    if (user.failedAttempts > 0 || user.lockedUntil) {
      await prisma.adminUser.update({
        where: { id: user.id },
        data: { 
          failedAttempts: 0,
          lockedUntil: null 
        }
      });
    }
    
    // Regenerate session ID (prevent session fixation)
    req.session.regenerate((err) => {
      if (err) {
        console.error('[ERROR] Session regeneration failed:', err);
        return res.status(500).json({ error: "Authentication error" });
      }
      
      req.session.isAdmin = true;
      req.session.username = username;
      req.session.userId = user.id;
      req.session.loginTime = Date.now();
      req.session.lastActivity = Date.now();
      
      req.session.save((err) => {
        if (err) {
          console.error('[ERROR] Session save failed:', err);
          return res.status(500).json({ error: "Authentication error" });
        }
        
        console.info(`[AUTH] Login success: ${username}`);
        res.json({ ok: true, username });
      });
    });
    
  } catch (error) {
    console.error('[ERROR] Login error:', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ============================================
// POST /api/v1/auth/logout
// ============================================
r.post("/logout", (req, res) => {
  const username = req.session?.username;
  
  req.session.destroy((err) => {
    if (err) {
      console.error('[ERROR] Session destruction error:', err);
      return res.status(500).json({ error: "Logout failed" });
    }
    
    res.clearCookie("vergo.sid", {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict''
    });
    
    if (username) {
      console.info(`[AUTH] Logout: ${username}`);
    }
    
    res.json({ ok: true });
  });
});

// ============================================
// GET /api/v1/auth/session
// ============================================
r.get("/session", (req, res) => {
  if (req.session?.isAdmin) {
    return res.json({ 
      authenticated: true,
      username: req.session.username 
    });
  }
  res.json({ authenticated: false });
});

export default r;