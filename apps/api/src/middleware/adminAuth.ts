import { Request, Response, NextFunction } from 'express';

const MAX_IDLE_TIME = 30 * 60 * 1000; // 30 minutes
const MAX_SESSION_AGE = 8 * 60 * 60 * 1000; // 8 hours

declare module 'express-session' {
  interface SessionData {
    isAdmin?: boolean;
    username?: string;
    userId?: string;
    loginTime?: number;
    lastActivity?: number;
  }
}

export function adminAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.isAdmin) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const now = Date.now();
  const lastActivity = req.session.lastActivity || 0;
  const loginTime = req.session.loginTime || 0;
  
  // Check idle timeout
  if (lastActivity && (now - lastActivity > MAX_IDLE_TIME)) {
    console.warn(`[SECURITY] Session expired (idle): ${req.session.username}`);
    res.clearCookie("vergo.sid");
    return req.session.destroy(() => {
      res.status(401).json({
        error: 'Session expired due to inactivity. Please log in again.'
      });
    });
  }

  // Check absolute session age
  if (loginTime && (now - loginTime > MAX_SESSION_AGE)) {
    console.warn(`[SECURITY] Session expired (age): ${req.session.username}`);
    res.clearCookie("vergo.sid");
    return req.session.destroy(() => {
      res.status(401).json({
        error: 'Session expired. Please log in again.'
      });
    });
  }

  req.session.lastActivity = now;
  return next();
}

export function adminPageAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.isAdmin) {
    const accept = req.headers['accept'] || '';
    const wantsHTML = typeof accept === 'string' && accept.includes('text/html');
    
    if (wantsHTML) {
      const redirectPath = req.originalUrl.startsWith('/') && !req.originalUrl.startsWith('//') ? req.originalUrl : '/admin.html';
      return res.redirect('/login.html?redirect=' + encodeURIComponent(redirectPath));
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const now = Date.now();
  const lastActivity = req.session.lastActivity || 0;
  const loginTime = req.session.loginTime || 0;
  
  if (lastActivity && (now - lastActivity > MAX_IDLE_TIME)) {
    res.clearCookie("vergo.sid");
    req.session.destroy(() => {
      res.redirect('/login.html?timeout=idle');
    });
    return;
  }

  if (loginTime && (now - loginTime > MAX_SESSION_AGE)) {
    res.clearCookie("vergo.sid");
    req.session.destroy(() => {
      res.redirect('/login.html?timeout=expired');
    });
    return;
  }
  
  req.session.lastActivity = now;
  return next();
}