/**
 * Staff logins on the website. A worker never gets a password from us: they
 * get a one-time link to /staff/set-password and choose their own. The same
 * link shape serves an invite from Ops, the roster welcome email and a
 * forgotten password; only how long it lasts differs.
 *
 * The token rides in User.resetToken (hashed) and User.resetTokenExp, which is
 * what POST /api/v1/user/reset-password already checks.
 */

import crypto from 'node:crypto';
import { prisma } from '../prisma';
import { env } from '../env';
import { hashToken } from '../utils/jwt';

/** An invite waits a week; someone added on a Monday may not look until Sunday. */
export const INVITE_LINK_DAYS = 7;

/** Same prefix userAuth.ts uses, so a stored hash can never be replayed as a token. */
export function hashResetToken(token: string): string {
  return `sha256:${hashToken(token)}`;
}

export function setPasswordPath(token: string, kind: 'invite' | 'reset' = 'reset'): string {
  return `/staff/set-password?token=${encodeURIComponent(token)}${kind === 'invite' ? '&invite=1' : ''}`;
}

export function setPasswordUrl(token: string, kind: 'invite' | 'reset' = 'reset'): string {
  const base = (env.webOrigin || `http://localhost:${env.port}`).replace(/\/+$/, '');
  return `${base}${setPasswordPath(token, kind)}`;
}

/**
 * Issues a fresh link for this worker, replacing any earlier one: only the
 * newest link in their inbox works. Returns the URL to email and when it stops.
 */
export async function issueSetPasswordLink(userId: string, days = INVITE_LINK_DAYS) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await prisma.user.update({
    where: { id: userId },
    data: { resetToken: hashResetToken(token), resetTokenExp: expiresAt },
  });
  return { url: setPasswordUrl(token, 'invite'), path: setPasswordPath(token, 'invite'), expiresAt };
}
