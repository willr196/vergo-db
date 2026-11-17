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

  it('is already inside the rate, never added on top', () => {
    const { baseHourly, holidayHourly, allInHourly } = allInRate(dec('15.00'));
    expect(baseHourly.toFixed(2)).toBe('13.38');
    expect(holidayHourly.toFixed(2)).toBe('1.62');
    expect(allInHourly.toFixed(2)).toBe('15.00');
  });
});

describe('costFor', () => {
  it('costs a normal shift', () => {
    const line = costFor(dec('7.5'), dec('15.00'));
    // 7.5h at £15 all in costs £112.50, holiday included.
    expect(line.basePay.toFixed(2)).toBe('100.38');
    expect(line.holidayPay.toFixed(2)).toBe('12.12');
    expect(line.totalCost.toFixed(2)).toBe('112.50');
  });

  it('splits base and holiday from the shift total, so they always add up to it', () => {
    const line = costFor(dec('37.5'), dec('13.33'));
    expect(line.totalCost.toFixed(2)).toBe('499.88');
    expect(line.basePay.toFixed(2)).toBe('446.04');
    expect(line.holidayPay.toFixed(2)).toBe('53.84');
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
