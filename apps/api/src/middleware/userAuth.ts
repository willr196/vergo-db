import { Request, Response, NextFunction } from 'express';

const USER_IDLE_TIMEOUT = 2 * 60 * 60 * 1000; // 2 hours
const USER_MAX_SESSION_AGE = 24 * 60 * 60 * 1000; // 24 hours

declare module 'express-session' {
  interface SessionData {
    // User session fields
    isUser?: boolean;
    userId?: string;
    userEmail?: string;
    userLoginTime?: number;
    userLastActivity?: number;
  }
}

/**
 * Middleware to require authenticated user with session timeout
 */
export function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.isUser || !req.session?.userId) {
    return res.status(401).json({ error: 'Please log in to continue' });
  }
  
  const now = Date.now();
  const loginTime = req.session.userLoginTime || 0;
  const lastActivity = req.session.userLastActivity || 0;
  
  // Check absolute session age (24 hours max)
  if (loginTime && (now - loginTime > USER_MAX_SESSION_AGE)) {
    console.warn(`[SECURITY] User session expired (age): ${req.session.userEmail}`);
    req.session.destroy(() => {});
    res.clearCookie('vergo.sid');
    return res.status(401).json({ 
      error: 'Session expired. Please log in again.',
      code: 'SESSION_EXPIRED'
    });
  }
  
  // Check idle timeout (2 hours)
  if (lastActivity && (now - lastActivity > USER_IDLE_TIMEOUT)) {
    console.warn(`[SECURITY] User session expired (idle): ${req.session.userEmail}`);
    req.session.destroy(() => {});
    res.clearCookie('vergo.sid');
    return res.status(401).json({ 
      error: 'Session expired due to inactivity. Please log in again.',
      code: 'SESSION_IDLE'
    });
  }
  
  // Update last activity
  req.session.userLastActivity = now;
  
  return next();
}

/**
 * Optional user - doesn't require auth but loads user if present
 */
export function optionalUser(req: Request, res: Response, next: NextFunction) {
  // Just update activity if logged in
  if (req.session?.isUser && req.session?.userId) {
    req.session.userLastActivity = Date.now();
  }
  return next();
}
