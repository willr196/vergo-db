/**
 * Counts database work, to prove public pages don't wake Neon. Off unless
 * LOG_DB_QUERIES=1; then every Prisma query and every session-store call
 * (connect-pg-simple has its own connection) adds one, and each request logs
 * how many happened while it ran:
 *
 *   [DB] GET /hire 200 0 queries
 *
 * Exact for requests made one at a time, which is how the check is run.
 */
export const COUNT_DB_QUERIES = process.env.LOG_DB_QUERIES === '1';

let count = 0;

export function countQuery(): void {
  count++;
}

export function dbQueryCount(): number {
  return count;
}

/** Counts each session-store call that reaches the database. */
export function countSessionStore(store: object): void {
  const s = store as Record<string, unknown>;
  for (const method of ['get', 'set', 'touch', 'destroy']) {
    const original = s[method];
    if (typeof original !== 'function') continue;
    s[method] = function (this: unknown, ...args: unknown[]) {
      count++;
      return (original as (...a: unknown[]) => unknown).apply(this, args);
    };
  }
}
