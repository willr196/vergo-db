/**
 * Shared login protections for the admin, staff and client doors:
 *
 * - Account lockout. The lock caps password guessing against one account when
 *   the attempts come from many addresses. It is set high enough that a stranger
 *   who only knows a username can't keep the owner locked out from one address:
 *   each route's own limiter allows 5 failures per address and account every 15
 *   minutes, so reaching LOCK_AFTER_FAILURES takes several addresses.
 * - A per-address limit across every account, so one address can't try a
 *   password list against many accounts.
 * - Ending an account's sessions and app refresh tokens after a password change
 *   or reset, so whoever held them before loses access.
 */
import type { Store } from 'express-session';
import rateLimit from 'express-rate-limit';
import { prisma } from '../prisma';

export const LOCK_AFTER_FAILURES = 20;
export const LOCK_DURATION_MS = 15 * 60 * 1000;

/**
 * The failure count and lock to store after a wrong password. A lock that has
 * run out starts the count again; otherwise the count stays at the threshold
 * and the next single typo locks the account again.
 */
export function failedLoginUpdate(
  account: { failedAttempts: number | null; lockedUntil: Date | null },
  now = new Date()
) {
  const prior = account.lockedUntil && account.lockedUntil <= now ? 0 : account.failedAttempts || 0;
  const failedAttempts = prior + 1;
  const locked = failedAttempts >= LOCK_AFTER_FAILURES;
  return {
    failedAttempts,
    lockedUntil: locked ? new Date(now.getTime() + LOCK_DURATION_MS) : null,
    locked,
  };
}

/**
 * Failed logins per address across every account and every login door. Counts
 * failures only, so an office of staff signing in behind one address is fine.
 */
export const loginAddressLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many login attempts from your network. Try again in 15 minutes.' },
});

export type AccountKind = 'user' | 'client' | 'admin';

/** The session flag and id field each kind of login writes (see the login routes). */
const SESSION_FIELDS: Record<AccountKind, { flag: string; id: string }> = {
  user: { flag: 'isUser', id: 'userId' },
  client: { flag: 'isClient', id: 'clientId' },
  admin: { flag: 'isAdmin', id: 'userId' },
};

/**
 * Logs an account out everywhere: deletes its web sessions (except keepSid, the
 * session making the change) and revokes its app refresh tokens. App access
 * tokens already issued run out within 15 minutes.
 */
export async function endAccountSessions(
  store: Store | undefined,
  kind: AccountKind,
  accountId: string,
  keepSid?: string
): Promise<void> {
  const { flag, id } = SESSION_FIELDS[kind];

  if (kind !== 'admin') {
    await prisma.refreshToken.updateMany({
      where: { ...(kind === 'user' ? { userId: accountId } : { clientId: accountId }), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // The in-memory store (tests) can list its sessions; the Postgres store
  // can't, so it is cleared with one query against its table.
  const listable = store as (Store & { all?: Store['all'] }) | undefined;
  if (listable?.all) {
    const sessions = await new Promise<Record<string, any>>((resolve, reject) =>
      listable.all!((err, all) => (err ? reject(err) : resolve((all as Record<string, any>) || {})))
    );
    await Promise.all(
      Object.entries(sessions)
        .filter(([sid, sess]) => sid !== keepSid && sess?.[flag] === true && sess?.[id] === accountId)
        .map(([sid]) => new Promise<void>((resolve) => listable.destroy(sid, () => resolve())))
    );
    return;
  }

  await prisma.$executeRaw`
    DELETE FROM user_sessions
    WHERE sess->>${flag} = 'true'
      AND sess->>${id} = ${accountId}
      AND sid <> ${keepSid ?? ''}`;
}
