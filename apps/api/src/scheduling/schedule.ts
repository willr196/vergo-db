/**
 * Working out which days a run covers.
 *
 * Pure - no database, no clock of its own. Everything arrives as an argument,
 * which is what lets the awkward cases be tested exhaustively: runs that cross
 * a month, a year, and the March and October clock changes.
 *
 * A run is stored as one job per day rather than as one job with a span. See
 * the note on Job.endDate in schema.prisma for why.
 */

/** How far ahead an open-ended run is kept filled. */
export const ROLLING_WEEKS = 8;

/** A hard ceiling on one generation, so a typo in a date cannot flood the app. */
export const MAX_DAYS_PER_RUN = 400;

export class ScheduleError extends Error {
  constructor(
    message: string,
    readonly httpStatus = 400
  ) {
    super(message);
    this.name = 'ScheduleError';
  }
}

/** YYYY-MM-DD to a UTC midnight Date. */
export function utcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** UTC midnight Date back to YYYY-MM-DD. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * 1 = Monday to 7 = Sunday.
 *
 * getUTCDay gives 0 for Sunday, which sorts Sunday to the front and makes
 * every weekday comparison off by one. ISO numbering is what the UI uses and
 * what people say out loud, so convert once here rather than at each caller.
 */
export function isoWeekday(d: Date): number {
  const day = d.getUTCDay();
  return day === 0 ? 7 : day;
}

export function parseRepeatDays(input: unknown): number[] {
  if (input === null || input === undefined) return [];
  if (!Array.isArray(input)) throw new ScheduleError('Repeat days must be a list');
  const days = input.map((d) => Number(d));
  if (days.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) {
    throw new ScheduleError('Repeat days must be between 1 (Monday) and 7 (Sunday)');
  }
  // Duplicates would generate the same day twice.
  return [...new Set(days)].sort((a, b) => a - b);
}

export type RunShape = {
  /** First day of the run. */
  start: Date;
  /** Last day, or null when the run is open-ended. */
  end: Date | null;
  ongoing: boolean;
  /** Empty means every day. */
  repeatDays: number[];
};

/**
 * The days a run covers, in order.
 *
 * `horizon` is the last date worth generating for an open-ended run - normally
 * today plus the rolling window. It is passed in rather than read from a clock
 * so the caller decides what "now" means, and so tests can pin it.
 *
 * `after` skips days already on the books, which is what makes topping up an
 * ongoing run additive rather than a source of duplicates.
 */
export function daysInRun(shape: RunShape, horizon: Date, after: Date | null = null): Date[] {
  const { start, end, ongoing, repeatDays } = shape;

  if (end && end < start) {
    throw new ScheduleError('The run cannot end before it starts');
  }
  if (ongoing && end) {
    throw new ScheduleError('A run is either ongoing or has an end date, not both');
  }

  const last = ongoing ? horizon : (end ?? start);

  // An ongoing run whose window has already been filled has nothing to add,
  // and a fixed run entirely in the past has nothing left to generate.
  if (last < start) return [];

  const days: Date[] = [];
  for (let day = new Date(start); day <= last; day = addDays(day, 1)) {
    if (after && day <= after) continue;
    if (repeatDays.length > 0 && !repeatDays.includes(isoWeekday(day))) continue;
    days.push(new Date(day));
    if (days.length > MAX_DAYS_PER_RUN) {
      throw new ScheduleError(
        `That run works out at more than ${MAX_DAYS_PER_RUN} days. Shorten it, or set it to ongoing.`
      );
    }
  }

  // A pattern that never matches is a mistake worth naming - Saturdays only,
  // over a run that covers a single Tuesday, silently creates nothing.
  if (days.length === 0 && !after) {
    throw new ScheduleError('That pattern does not fall on any day in the run');
  }

  return days;
}

/** The far edge of the rolling window for an open-ended run. */
export function horizonFrom(today: Date, weeks = ROLLING_WEEKS): Date {
  return addDays(today, weeks * 7);
}
