import { Request, Response, NextFunction } from 'express';
import { AuthSubjectType, verifyAccessToken } from '../utils/jwt';

type AuthInfo = {
  userId: string;
  type: AuthSubjectType;
  email?: string;
};

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthInfo;
  }
}

function parseBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

function requireJwt(req: Request, res: Response, next: NextFunction, expectedType: AuthSubjectType) {
  const token = parseBearerToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Missing authorization token' });
  }

  try {
    const payload = verifyAccessToken(token);
    if (payload.tokenType !== 'access' || payload.type !== expectedType) {
      return res.status(401).json({ ok: false, error: 'Invalid authorization token' });
    }

    req.auth = {
      userId: payload.sub,
      type: payload.type,
      email: payload.email
    };

    return next();
  } catch (error) {
    return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
  }
}

export function requireUserJwt(req: Request, res: Response, next: NextFunction) {
  return requireJwt(req, res, next, 'user');
}

export function requireClientJwt(req: Request, res: Response, next: NextFunction) {
  return requireJwt(req, res, next, 'client');
}
