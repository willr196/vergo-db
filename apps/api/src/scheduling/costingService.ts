/**
 * The bridge between the routes and the costing module.
 *
 * Replaces the old payrollService. Tax, NI, student loan and take-home pay
 * moved out of this app with the dates of birth and tax codes they needed;
 * what is left is scheduling and what a job costs.
 */

import { costFor, dec, round2, ZERO, type CostLine, type Decimal } from './costing';

export { costFor, type CostLine };

/**
 * Hours between two 24-hour times, less the break.
 *
 * An end time at or before the start means the job runs past midnight.
 */
export function hoursBetween(startTime: string, endTime: string, breakMinutes = 0): Decimal {
  const parse = (t: string) => {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t);
    if (!m) throw new Error(`Invalid time "${t}" — expected 24-hour HH:MM`);
    return Number(m[1]) * 60 + Number(m[2]);
  };

  const start = parse(startTime);
  let end = parse(endTime);
  if (end <= start) end += 24 * 60;

  const worked = end - start - breakMinutes;
  if (worked <= 0) throw new Error('The break is longer than the job');
  return round2(dec(worked).dividedBy(60));
}

export interface JobMargin {
  hours: string;
  charged: string;
  /** Base pay plus holiday pay for everyone on the job. */
  staffCost: string;
  margin: string;
  marginPercent: string;
  marginPerHour: string;
  /** True when margin per hour is under £2 - the point a job stops being worth doing. */
  thin: boolean;
  /**
   * Employer National Insurance is NOT included, and cannot be: the rate
   * depends on an NI category, which depends on age, which left with the date
   * of birth. Real margin is lower than this figure by roughly 15% of pay above
   * the secondary threshold. Surfaced to the UI so the number is never read as
   * a full cost.
   */
  excludesEmployerNI: true;
}

const THIN_MARGIN_PER_HOUR = dec('2');

export function marginFor(chargeRate: Decimal, lines: Array<{ hours: Decimal; cost: CostLine }>): JobMargin {
  let hours = ZERO;
  let charged = ZERO;
  let staffCost = ZERO;

  for (const { hours: h, cost } of lines) {
    hours = hours.plus(h);
    charged = charged.plus(h.times(chargeRate));
    staffCost = staffCost.plus(cost.totalCost);
  }

  charged = round2(charged);
  staffCost = round2(staffCost);
  const margin = charged.minus(staffCost);
  const marginPerHour = hours.isZero() ? ZERO : margin.dividedBy(hours);

  return {
    hours: hours.toFixed(2),
    charged: charged.toFixed(2),
    staffCost: staffCost.toFixed(2),
    margin: round2(margin).toFixed(2),
    marginPercent: charged.isZero() ? '0.0' : round2(margin.dividedBy(charged).times(100)).toFixed(1),
    marginPerHour: round2(marginPerHour).toFixed(2),
    thin: !hours.isZero() && marginPerHour.lessThan(THIN_MARGIN_PER_HOUR),
    excludesEmployerNI: true,
  };
}
