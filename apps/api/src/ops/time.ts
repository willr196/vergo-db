/**
 * UK event time. Shifts are entered as a London calendar date plus HH:MM
 * clock times, and a finish at or before the start is the next morning. These
 * turn that into real instants, so overlap checks and hour counts are right
 * across the clock changes in March and October.
 */

const LONDON = 'Europe/London';
const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isClock(value: string): boolean {
  return CLOCK.test(value);
}

export function clockMinutes(value: string): number {
  const match = CLOCK.exec(value);
  if (!match) throw new Error(`Invalid time "${value}", expected 24-hour HH:MM`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Minutes London is ahead of UTC at this instant: 0 in winter, 60 in summer. */
export function londonOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: LONDON,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}

/** "2026-10-03" for a Date stored as a calendar date (midnight UTC). */
export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The London calendar date an instant falls on. */
export function londonDateKey(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: LONDON }).format(at);
}

/** The London wall-clock time of an instant, "HH:MM". */
export function londonClock(at: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: LONDON, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(at);
}

/** The instant a London wall-clock time happens on a London calendar date. */
export function londonInstant(dateYmd: string, clock: string): Date {
  const [y, m, d] = dateYmd.split('-').map(Number);
  const minutes = clockMinutes(clock);
  const naiveUtc = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  // Two passes settle the offset either side of a clock change.
  let guess = naiveUtc - londonOffsetMinutes(new Date(naiveUtc)) * 60000;
  guess = naiveUtc - londonOffsetMinutes(new Date(guess)) * 60000;
  return new Date(guess);
}

export interface Interval {
  start: Date;
  end: Date;
}

/** A shift as real instants. A finish at or before the start rolls to the next day. */
export function shiftInterval(dateYmd: string, startClock: string, finishClock: string): Interval {
  const start = londonInstant(dateYmd, startClock);
  let end = londonInstant(dateYmd, finishClock);
  if (end.getTime() <= start.getTime()) end = londonInstant(addDays(dateYmd, 1), finishClock);
  return { start, end };
}

/**
 * Hours of a shift that fall after midnight, by the clock. Only shifts that run
 * past midnight carry the uplift, matching how the quote form prices them.
 */
export function afterMidnightHours(startClock: string, finishClock: string): number {
  const start = clockMinutes(startClock);
  const finish = clockMinutes(finishClock);
  if (finish > start) return 0;
  return finish / 60;
}

/** Monday of the London week containing a calendar date, as "YYYY-MM-DD". */
export function weekStartKey(dateYmd: string): string {
  const [y, m, d] = dateYmd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const isoDay = (date.getUTCDay() + 6) % 7; // Monday 0
  return dateKey(new Date(date.getTime() - isoDay * DAY_MS));
}

/** Whole weeks between two Monday keys. */
export function weeksBetween(fromMonday: string, toMonday: string): number {
  return Math.round((Date.parse(`${toMonday}T00:00:00Z`) - Date.parse(`${fromMonday}T00:00:00Z`)) / (7 * DAY_MS));
}

export function addDays(dateYmd: string, days: number): string {
  return dateKey(new Date(Date.parse(`${dateYmd}T00:00:00Z`) + days * DAY_MS));
}

/** Whole days from one calendar date to another (negative if before). */
export function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.round((Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / DAY_MS);
}

/** Age in whole years on a date. */
export function ageOn(dateOfBirth: Date, onYmd: string): number {
  const dob = dateKey(dateOfBirth);
  const [by, bm, bd] = dob.split('-').map(Number);
  const [y, m, d] = onYmd.split('-').map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return age;
}

/** UK tax year label for a date: 6 April starts a new one. "2026-27". */
export function taxYearOf(dateYmd: string): string {
  const [y, m, d] = dateYmd.split('-').map(Number);
  const startYear = m > 4 || (m === 4 && d >= 6) ? y : y - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}
