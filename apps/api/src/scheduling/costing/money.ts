/**
 * Decimal helpers for the payroll engine.
 *
 * Every figure in this module is a Decimal. There are no floats anywhere in
 * `src/payroll/` — not in intermediates, not in constants, not in test
 * fixtures. Money arithmetic in binary floating point is how payroll systems
 * quietly drift by a penny a week.
 */
import Decimal from 'decimal.js';

export { Decimal };

export const ZERO = new Decimal(0);

export const dec = (v: Decimal.Value): Decimal => new Decimal(v);

/**
 * Round half-up to 2dp.
 *
 * Use ONLY at a named output (basePay, holidayPay, incomeTax, employeeNI,
 * employerNI). Rounding an intermediate is a bug: it compounds across a long
 * timesheet and makes base + holiday disagree with gross.
 */
export function round2(v: Decimal.Value): Decimal {
  return new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * Floor to 2dp. This is how HMRC derives periodic thresholds from annual ones
 * — Plan 2's £29,385 / 52 = 565.096… is published as £565.09, not £565.10.
 * Verified against all five student loan plans and the 1257L free-pay figure.
 */
export function floor2(v: Decimal.Value): Decimal {
  return new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_DOWN);
}

/** Floor to whole pounds — HMRC's rounding rule for student loan deductions. */
export function floorPound(v: Decimal.Value): Decimal {
  return new Decimal(v).toDecimalPlaces(0, Decimal.ROUND_DOWN);
}

/** max(0, v) — the shape every threshold calculation in PAYE takes. */
export function maxZero(v: Decimal): Decimal {
  return v.isNegative() ? ZERO : v;
}

/** The portion of `value` that falls between `lower` and `upper`. */
export function band(value: Decimal, lower: Decimal, upper: Decimal): Decimal {
  return maxZero(Decimal.min(value, upper).minus(lower));
}

/** Periods in a tax year for a given frequency. 53-week years are handled by
 *  PayPeriod.taxPeriod running to 53; the divisor stays 52 either way, which
 *  is what HMRC's week-1 tables do. */
export function periodsPerYear(frequency: 'WEEKLY' | 'MONTHLY'): number {
  return frequency === 'WEEKLY' ? 52 : 12;
}
