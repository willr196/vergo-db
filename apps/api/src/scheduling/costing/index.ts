/**
 * What a job costs to staff, and what is left of what you charged.
 *
 * This is not payroll and must not grow into it. Tax, National Insurance,
 * student loan and take-home pay all belong to the payroll admin panel, which
 * holds the dates of birth and tax codes needed to work them out. This app
 * schedules people and prices the work.
 *
 * Pure - no database, no clock. Everything arrives as an argument.
 */

import { Decimal, ZERO, dec, round2 } from './money';

export { Decimal, ZERO, dec, round2 };

/**
 * Statutory holiday accrual for a worker with no fixed hours: 5.6 weeks over
 * the 46.4 remaining, which is 12.07%.
 *
 * Always added on top of the base rate, never rolled into it. Rolling it in is
 * what makes a rate look adequate when it is not.
 */
export const HOLIDAY_ACCRUAL_PCT = dec('0.1207');

export class CostingError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly httpStatus = 422
  ) {
    super(message);
    this.name = 'CostingError';
  }
}

export class MissingRateError extends CostingError {
  constructor(name: string) {
    super(`${name} has no hourly rate, so this job cannot be costed`, 'MISSING_RATE', 422);
  }
}

export type CostLine = {
  hours: Decimal;
  rate: Decimal;
  basePay: Decimal;
  holidayPay: Decimal;
  /** Base plus holiday. What the person costs you for this job. */
  totalCost: Decimal;
};

/** The all-in hourly rate, which is the number to quote from. */
export function allInRate(baseRate: Decimal): { holidayHourly: Decimal; allInHourly: Decimal } {
  const holiday = baseRate.times(HOLIDAY_ACCRUAL_PCT);
  return { holidayHourly: round2(holiday), allInHourly: round2(baseRate.plus(holiday)) };
}

/**
 * One person on one job.
 *
 * Base and holiday are each computed from hours and then rounded, rather than
 * rounding an hourly all-in rate first. Rounding the rate compounds the error
 * across a long timesheet and makes base + holiday disagree with the total.
 */
export function costFor(hours: Decimal, rate: Decimal, name = 'This person'): CostLine {
  if (!rate || rate.lessThanOrEqualTo(0)) throw new MissingRateError(name);
  if (hours.lessThan(0)) {
    throw new CostingError('Hours cannot be negative', 'NEGATIVE_HOURS', 400);
  }

  const basePay = round2(hours.times(rate));
  const holidayPay = round2(hours.times(rate).times(HOLIDAY_ACCRUAL_PCT));

  return { hours, rate, basePay, holidayPay, totalCost: round2(basePay.plus(holidayPay)) };
}
