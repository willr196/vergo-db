import { Request, Response, NextFunction } from 'express';

export function adminAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session?.isAdmin) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

export function adminPageAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session?.isAdmin) return next();

  const accept = req.headers['accept'] || '';
  const wantsHTML = typeof accept === 'string' && accept.includes('text/html');

  if (wantsHTML) return res.status(401).send('Unauthorized');
  return res.status(401).json({ error: 'Unauthorized' });
}
