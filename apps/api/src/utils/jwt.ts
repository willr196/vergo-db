import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../env';

export type AuthTokenType = 'access' | 'refresh';
export type AuthSubjectType = 'user' | 'client';

export interface AuthTokenPayload {
  sub: string;
  type: AuthSubjectType;
  email?: string;
  tokenType: AuthTokenType;
}

const ACCESS_EXPIRES_IN = '15m';
const REFRESH_EXPIRES_IN = '30d';

export function signAccessToken(payload: Omit<AuthTokenPayload, 'tokenType'>) {
  return jwt.sign({ ...payload, tokenType: 'access' }, env.jwt, { expiresIn: ACCESS_EXPIRES_IN });
}

export function signRefreshToken(payload: Omit<AuthTokenPayload, 'tokenType'>) {
  return jwt.sign({ ...payload, tokenType: 'refresh' }, env.jwtRefresh, { expiresIn: REFRESH_EXPIRES_IN });
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.jwt) as AuthTokenPayload;
}

export function verifyRefreshToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.jwtRefresh) as AuthTokenPayload;
}

export function getTokenExpiresAt(token: string): Date {
  const decoded = jwt.decode(token) as { exp?: number } | null;
  if (!decoded?.exp) {
    throw new Error('Token expiry missing');
  }
  return new Date(decoded.exp * 1000);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
