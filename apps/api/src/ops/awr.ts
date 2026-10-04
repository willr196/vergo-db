/**
 * AWR tracking aid — review required.
 *
 * Under the Agency Workers Regulations 2010 a worker can gain equal-treatment
 * rights after 12 calendar weeks in the same role with the same hirer. Any part
 * of a week worked counts as a week. A gap of six calendar weeks or less pauses
 * the clock; a gap of more than six resets it. Some breaks (sickness, maternity,
 * a planned shutdown, jury service and others) do not reset it however long
 * they are, and whether two roles are "substantively different" is a judgement.
 *
 * This counts weeks from the assignments on record and flags when someone is
 * getting close. It does not decide entitlement, and it cannot see the reason
 * for a break, so every result says a person needs to review it.
 */

import { weekStartKey, weeksBetween, addDays } from './time';

export const AWR_LABEL = 'AWR tracking aid — review required';
export const AWR_WARNING_WEEKS = 10;
export const AWR_REVIEW_WEEKS = 12;
/** A gap longer than this many calendar weeks resets the count. */
export const AWR_MAX_BREAK_WEEKS = 6;

export interface AwrShift {
  /** London date of the shift. */
  date: string;
}

export interface AwrResult {
  weeksAccumulated: number;
  firstQualifyingDate: string | null;
  lastQualifyingAssignment: string | null;
  /** Did a gap of more than six weeks reset the count at some point? */
  resetOccurred: boolean;
  /** Weeks since the last worked week, as of `today`. */
  weeksSinceLastWorked: number | null;
  /** If no work happens by this date the count is likely to reset. */
  resetsIfNoWorkBy: string | null;
  level: 'none' | 'warning' | 'review_required';
  label: string;
}

/**
 * Count AWR weeks for one worker + hirer + role. Pass only shifts that
 * happened (or are confirmed to happen) on or before `today`.
 */
export function awrWeeks(shifts: AwrShift[], today: string): AwrResult {
  const weeks = [...new Set(shifts.filter((s) => s.date <= today).map((s) => weekStartKey(s.date)))].sort();

  if (weeks.length === 0) {
    return {
      weeksAccumulated: 0, firstQualifyingDate: null, lastQualifyingAssignment: null,
      resetOccurred: false, weeksSinceLastWorked: null, resetsIfNoWorkBy: null, level: 'none', label: AWR_LABEL,
    };
  }

  let runStart = 0;
  let resetOccurred = false;
  for (let i = 1; i < weeks.length; i++) {
    const gap = weeksBetween(weeks[i - 1], weeks[i]) - 1;
    if (gap > AWR_MAX_BREAK_WEEKS) {
      runStart = i;
      resetOccurred = true;
    }
  }

  const run = weeks.slice(runStart);
  const lastWeek = run[run.length - 1];
  const sinceLast = weeksBetween(lastWeek, weekStartKey(today));

  // If the current gap already exceeds six weeks, the run has lapsed.
  const lapsed = sinceLast - 1 > AWR_MAX_BREAK_WEEKS;
  const weeksAccumulated = lapsed ? 0 : run.length;
  const lastShift = shifts.filter((s) => s.date <= today).map((s) => s.date).sort().pop() ?? null;

  const level = weeksAccumulated >= AWR_REVIEW_WEEKS
    ? 'review_required'
    : weeksAccumulated >= AWR_WARNING_WEEKS ? 'warning' : 'none';

  return {
    weeksAccumulated,
    firstQualifyingDate: lapsed ? null : run[0],
    lastQualifyingAssignment: lastShift,
    resetOccurred: resetOccurred || lapsed,
    weeksSinceLastWorked: sinceLast,
    // The Sunday of the last week that still leaves a gap of six weeks or less.
    resetsIfNoWorkBy: lapsed ? null : addDays(lastWeek, (AWR_MAX_BREAK_WEEKS + 2) * 7 - 1),
    level,
    label: AWR_LABEL,
  };
}
