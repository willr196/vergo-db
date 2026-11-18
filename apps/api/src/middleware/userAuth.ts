import { Request, Response, NextFunction } from 'express';

const USER_IDLE_TIMEOUT = 2 * 60 * 60 * 1000; // 2 hours
const USER_MAX_SESSION_AGE = 24 * 60 * 60 * 1000; // 24 hours
/** "Keep me logged in": ticked at login, the session lasts 30 days on that device. */
export const USER_REMEMBER_AGE = 30 * 24 * 60 * 60 * 1000;

function setNoStoreHeaders(res: Response) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

declare module 'express-session' {
  interface SessionData {
    // User session fields
    isUser?: boolean;
    userId?: string;
    userEmail?: string;
    userLoginTime?: number;
    userLastActivity?: number;
    /** Ticked "Keep me logged in": 30 days, no 2-hour idle limit. */
    userRemember?: boolean;
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
  const remember = req.session.userRemember === true;
  const maxAge = remember ? USER_REMEMBER_AGE : USER_MAX_SESSION_AGE;
  const idleLimit = remember ? USER_REMEMBER_AGE : USER_IDLE_TIMEOUT;
  
  // Check absolute session age (24 hours, or 30 days if they chose to stay logged in)
  if (loginTime && (now - loginTime > maxAge)) {
    console.warn(`[SECURITY] User session expired (age): userId=${req.session.userId || 'unknown'}`);
    req.session.destroy(() => {});
    res.clearCookie('vergo.sid');
    return res.status(401).json({ 
      error: 'Session expired. Please log in again.',
      code: 'SESSION_EXPIRED'
    });
  }
  
  // Check idle timeout (2 hours, unless they chose to stay logged in)
  if (lastActivity && (now - lastActivity > idleLimit)) {
    console.warn(`[SECURITY] User session expired (idle): userId=${req.session.userId || 'unknown'}`);
    req.session.destroy(() => {});
    res.clearCookie('vergo.sid');
    return res.status(401).json({ 
      error: 'Session expired due to inactivity. Please log in again.',
      code: 'SESSION_IDLE'
    });
  }
  
  // Update last activity
  req.session.userLastActivity = now;
  setNoStoreHeaders(res);
  
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
