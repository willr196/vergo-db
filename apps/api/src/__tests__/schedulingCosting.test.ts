import { describe, it } from 'node:test';
import { expect } from './schedulingExpect';
import {
  allInRate,
  costFor,
  dec,
  CostingError,
  MissingRateError,
  HOLIDAY_ACCRUAL_PCT,
} from '../scheduling/costing';

describe('holiday accrual', () => {
  it('is 12.07 percent, the statutory figure for irregular hours', () => {
    expect(HOLIDAY_ACCRUAL_PCT.toString()).toBe('0.1207');
  });

  it('is added on top of the rate, never rolled into it', () => {
    const { holidayHourly, allInHourly } = allInRate(dec('12.71'));
    expect(holidayHourly.toFixed(2)).toBe('1.53');
    expect(allInHourly.toFixed(2)).toBe('14.24');
  });
});

describe('costFor', () => {
  it('costs a normal shift', () => {
    const line = costFor(dec('7.5'), dec('15.00'));
    expect(line.basePay.toFixed(2)).toBe('112.50');
    expect(line.holidayPay.toFixed(2)).toBe('13.58');
    expect(line.totalCost.toFixed(2)).toBe('126.08');
  });

  it('rounds base and holiday from hours rather than from an all-in rate', () => {
    // Rounding the hourly rate first and multiplying would drift over a long
    // timesheet and make base + holiday disagree with the total.
    const line = costFor(dec('37.5'), dec('13.33'));
    expect(line.basePay.toFixed(2)).toBe('499.88');
    expect(line.holidayPay.toFixed(2)).toBe('60.33');
    expect(line.totalCost.toFixed(2)).toBe('560.21');
    expect(line.basePay.plus(line.holidayPay).toFixed(2)).toBe(line.totalCost.toFixed(2));
  });

  it('costs zero hours as zero rather than throwing', () => {
    const line = costFor(dec('0'), dec('15.00'));
    expect(line.totalCost.toFixed(2)).toBe('0.00');
  });

  it('refuses someone with no rate, because the job cost would silently be wrong', () => {
    expect(() => costFor(dec('7.5'), dec('0'), 'Amara')).toThrow(MissingRateError);
    expect(() => costFor(dec('7.5'), dec('0'), 'Amara')).toThrow(/Amara has no hourly rate/);
  });

  it('refuses negative hours', () => {
    expect(() => costFor(dec('-1'), dec('15.00'))).toThrow(/Hours cannot be negative/);
  });

  it('carries an HTTP status on every refusal, so none reach the client as a 500', () => {
    for (const [fn, status] of [
      [() => costFor(dec('7.5'), dec('0')), 422],
      [() => costFor(dec('-1'), dec('15.00')), 400],
    ] as const) {
      try {
        fn();
        throw new Error('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(CostingError);
        expect((e as CostingError).httpStatus).toBe(status);
      }
    }
  });
});
