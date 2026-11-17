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
 * The hourly rate you enter is all in: holiday pay is already inside it, never
 * added on top. A £15 rate costs £15 an hour, of which £13.38 is basic pay and
 * £1.62 holiday (15 / 1.1207). Watch the basic part against minimum wage.
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
  /** Hours times the all-in rate. What the person costs you for this job. */
  totalCost: Decimal;
};

/** Splits an all-in hourly rate into its basic and holiday parts. */
export function allInRate(rate: Decimal): { baseHourly: Decimal; holidayHourly: Decimal; allInHourly: Decimal } {
  const allIn = round2(rate);
  const base = round2(rate.dividedBy(HOLIDAY_ACCRUAL_PCT.plus(1)));
  return { baseHourly: base, holidayHourly: allIn.minus(base), allInHourly: allIn };
}

/**
 * One person on one job.
 *
 * The total is hours times the all-in rate. Basic and holiday are split from
 * that total, not from a rounded hourly figure, so they always add up to it.
 */
export function costFor(hours: Decimal, rate: Decimal, name = 'This person'): CostLine {
  if (!rate || rate.lessThanOrEqualTo(0)) throw new MissingRateError(name);
  if (hours.lessThan(0)) {
    throw new CostingError('Hours cannot be negative', 'NEGATIVE_HOURS', 400);
  }

  const totalCost = round2(hours.times(rate));
  const basePay = round2(totalCost.dividedBy(HOLIDAY_ACCRUAL_PCT.plus(1)));

  return { hours, rate, basePay, holidayPay: totalCost.minus(basePay), totalCost };
}
