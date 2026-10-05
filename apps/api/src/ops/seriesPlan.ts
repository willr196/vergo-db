/**
 * Which days a repeating Ops booking should add, worked out from calendar
 * dates alone. Kept free of the database and app config so it can be tested
 * on its own (src/ops/series.ts does the writing).
 */

import { addDays } from './time';

export const DEFAULT_AHEAD_WEEKS = 6;
export const MAX_AHEAD_WEEKS = 26;

/** 1 = Monday .. 7 = Sunday for a YYYY-MM-DD date. */
export function isoWeekday(ymd: string): number {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay() || 7;
}

export interface SeriesPlanInput {
  weekdays: number[];
  startsOn: string;
  endsOn: string | null;
  generatedThrough: string | null;
  aheadWeeks: number;
  today: string;
}

/**
 * The days a series should add now, and the new generatedThrough. Never
 * reaches back before today or before generatedThrough, never past endsOn.
 */
export function planSeriesDays(input: SeriesPlanInput): { dates: string[]; through: string | null } {
  const days = new Set(input.weekdays);
  const after = input.generatedThrough ? addDays(input.generatedThrough, 1) : input.startsOn;
  let from = [input.startsOn, after, input.today].sort().pop()!;
  const horizon = addDays(input.today, Math.min(Math.max(input.aheadWeeks, 1), MAX_AHEAD_WEEKS) * 7);
  const until = input.endsOn && input.endsOn < horizon ? input.endsOn : horizon;
  if (from > until || days.size === 0) return { dates: [], through: input.generatedThrough };
  const dates: string[] = [];
  for (; from <= until; from = addDays(from, 1)) if (days.has(isoWeekday(from))) dates.push(from);
  const through = input.generatedThrough && input.generatedThrough > until ? input.generatedThrough : until;
  return { dates, through };
}
