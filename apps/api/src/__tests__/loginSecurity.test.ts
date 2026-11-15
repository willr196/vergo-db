import test from 'node:test';
import assert from 'node:assert/strict';
import session from 'express-session';
import { prisma } from '../prisma';
import { failedLoginUpdate, endAccountSessions, LOCK_AFTER_FAILURES, LOCK_DURATION_MS } from '../lib/loginSecurity';

const now = new Date('2026-11-13T12:00:00Z');

test('an account locks only after LOCK_AFTER_FAILURES wrong passwords', () => {
  const below = failedLoginUpdate({ failedAttempts: LOCK_AFTER_FAILURES - 2, lockedUntil: null }, now);
  assert.equal(below.locked, false);
  assert.equal(below.lockedUntil, null);

  const at = failedLoginUpdate({ failedAttempts: LOCK_AFTER_FAILURES - 1, lockedUntil: null }, now);
  assert.equal(at.locked, true);
  assert.equal(at.lockedUntil!.getTime(), now.getTime() + LOCK_DURATION_MS);
});

test('a lock that has run out starts the count again, so one typo does not re-lock', () => {
  const expired = new Date(now.getTime() - 1000);
  const next = failedLoginUpdate({ failedAttempts: LOCK_AFTER_FAILURES, lockedUntil: expired }, now);
  assert.equal(next.failedAttempts, 1);
  assert.equal(next.locked, false);
});

function put(store: session.MemoryStore, sid: string, data: Record<string, unknown>) {
  return new Promise<void>((resolve) =>
    store.set(sid, { cookie: { originalMaxAge: 60_000, expires: new Date(Date.now() + 60_000) }, ...data } as any, () => resolve())
  );
}

function sids(store: session.MemoryStore) {
  return new Promise<string[]>((resolve) => store.all!((_e, all) => resolve(Object.keys(all || {}).sort())));
}

test('ending a staff account\'s sessions keeps the current one and leaves other accounts alone', async () => {
  const prismaAny = prisma as any;
  const original = prismaAny.refreshToken.updateMany;
  let revoked: any = null;
  prismaAny.refreshToken.updateMany = async (args: any) => { revoked = args.where; return { count: 2 }; };

  const store = new session.MemoryStore();
  await put(store, 'current', { isUser: true, userId: 'u1' });
  await put(store, 'stolen', { isUser: true, userId: 'u1' });
  await put(store, 'other-staff', { isUser: true, userId: 'u2' });
  // An admin whose id happens to match is a different account.
  await put(store, 'admin', { isAdmin: true, userId: 'u1' });

  try {
    await endAccountSessions(store, 'user', 'u1', 'current');
    assert.deepEqual((await sids(store)).sort(), ['admin', 'current', 'other-staff']);
    assert.deepEqual(revoked, { userId: 'u1', revokedAt: null });
  } finally {
    prismaAny.refreshToken.updateMany = original;
  }
});

test('ending an admin\'s sessions touches no app tokens', async () => {
  const prismaAny = prisma as any;
  const original = prismaAny.refreshToken.updateMany;
  let called = false;
  prismaAny.refreshToken.updateMany = async () => { called = true; return { count: 0 }; };

  const store = new session.MemoryStore();
  await put(store, 'a', { isAdmin: true, userId: 'admin-1' });
  try {
    await endAccountSessions(store, 'admin', 'admin-1');
    assert.deepEqual(await sids(store), []);
    assert.equal(called, false);
  } finally {
    prismaAny.refreshToken.updateMany = original;
  }
});
