/**
 * Per-day staffing for jobs.
 *
 * A job spans one or more calendar days, and each day carries its own
 * headcount — a three-day event needs a different crew size on the build day
 * than on the show day. `JobDay` holds that headcount; `JobAssignment` names
 * who is rostered onto each day.
 *
 * Dates are handled as bare "YYYY-MM-DD" keys throughout and only become
 * `Date` objects at the Prisma boundary, pinned to UTC midnight. The column is
 * `@db.Date`, so a local-midnight Date west of Greenwich would land on the
 * previous day; going through the key form makes that impossible.
 */

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type DayInput = { date: string; staffNeeded: number };

/** A Date (or ISO string) -> "YYYY-MM-DD", read in UTC. */
export function toDayKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${String(value)}`);
  }
  return date.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" -> Date at UTC midnight, ready for a `@db.Date` column. */
export function fromDayKey(key: string): Date {
  if (!DAY_KEY_PATTERN.test(key)) {
    throw new Error(`Invalid day "${key}" — expected YYYY-MM-DD`);
  }
  const date = new Date(`${key}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid day "${key}"`);
  }
  return date;
}

/**
 * Every day key from start to end inclusive. Returns just the start day when
 * end is missing or earlier, so a fat-fingered end date can't blow up a save.
 */
export function expandDayKeys(start: Date | string, end?: Date | string | null): string[] {
  const first = fromDayKey(toDayKey(start));
  const last = end ? fromDayKey(toDayKey(end)) : first;
  if (last <= first) return [toDayKey(first)];

  const keys: string[] = [];
  for (let t = first.getTime(); t <= last.getTime(); t += MS_PER_DAY) {
    keys.push(toDayKey(new Date(t)));
  }
  return keys;
}

/**
 * The days a job should have when nobody has edited them by hand: one per day
 * of the event, each at the job's overall headcount.
 */
export function defaultDaysForJob(job: {
  eventDate: Date | null;
  eventEndDate: Date | null;
  staffNeeded: number;
}): DayInput[] {
  if (!job.eventDate) return [];
  return expandDayKeys(job.eventDate, job.eventEndDate).map((date) => ({
    date,
    staffNeeded: Math.max(1, job.staffNeeded),
  }));
}

/**
 * Job.staffNeeded is the size of the crew you have to hire, which is the
 * busiest single day — not the sum across days, since the same people usually
 * work every day of an event.
 */
export function crewSizeFromDays(days: { staffNeeded: number }[], fallback: number): number {
  if (days.length === 0) return Math.max(1, fallback);
  return Math.max(1, ...days.map((day) => day.staffNeeded));
}

/** Collapses duplicate dates (last one wins) and sorts chronologically. */
export function normalizeDays(days: DayInput[]): DayInput[] {
  const byKey = new Map<string, number>();
  for (const day of days) {
    byKey.set(toDayKey(fromDayKey(day.date)), Math.max(1, Math.trunc(day.staffNeeded)));
  }
  return [...byKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, staffNeeded]) => ({ date, staffNeeded }));
}
