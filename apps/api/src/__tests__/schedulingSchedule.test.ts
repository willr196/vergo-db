import { describe, it } from 'node:test';
import { expect } from './schedulingExpect';
import {
  daysInRun,
  horizonFrom,
  isoDate,
  isoWeekday,
  parseRepeatDays,
  utcDate,
  ScheduleError,
  MAX_DAYS_PER_RUN,
} from '../scheduling/schedule';

const run = (start: string, opts: Partial<{ end: string; ongoing: boolean; repeatDays: number[] }> = {}) => ({
  start: utcDate(start),
  end: opts.end ? utcDate(opts.end) : null,
  ongoing: opts.ongoing ?? false,
  repeatDays: opts.repeatDays ?? [],
});

const iso = (days: Date[]) => days.map(isoDate);

describe('isoWeekday', () => {
  it('numbers Monday to Sunday as 1 to 7', () => {
    // 2026-09-07 is a Monday.
    expect(isoWeekday(utcDate('2026-09-07'))).toBe(1);
    expect(isoWeekday(utcDate('2026-09-12'))).toBe(6);
    // Sunday is 7, not the 0 that getUTCDay gives.
    expect(isoWeekday(utcDate('2026-09-13'))).toBe(7);
  });
});

describe('parseRepeatDays', () => {
  it('treats nothing as every day', () => {
    expect(parseRepeatDays(null)).toEqual([]);
    expect(parseRepeatDays(undefined)).toEqual([]);
  });

  it('sorts and de-duplicates, so a day cannot be generated twice', () => {
    expect(parseRepeatDays([5, 1, 1, 3])).toEqual([1, 3, 5]);
  });

  it('refuses days outside 1 to 7', () => {
    expect(() => parseRepeatDays([0])).toThrow(ScheduleError);
    expect(() => parseRepeatDays([8])).toThrow(ScheduleError);
    expect(() => parseRepeatDays(['x'])).toThrow(ScheduleError);
  });
});

describe('daysInRun', () => {
  const horizon = utcDate('2027-12-31');

  it('a job with no end is a single day', () => {
    expect(iso(daysInRun(run('2026-09-07'), horizon))).toEqual(['2026-09-07']);
  });

  it('covers every day of a span when no pattern is given', () => {
    expect(iso(daysInRun(run('2026-09-07', { end: '2026-09-10' }), horizon))).toEqual([
      '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10',
    ]);
  });

  it('keeps only the chosen weekdays', () => {
    // Mon 7 Sep to Sun 20 Sep, weekdays only.
    const days = iso(daysInRun(run('2026-09-07', { end: '2026-09-20', repeatDays: [1, 2, 3, 4, 5] }), horizon));
    expect(days).toHaveLength(10);
    expect(days).toContain('2026-09-07');
    expect(days).not.toContain('2026-09-12'); // Saturday
    expect(days).not.toContain('2026-09-13'); // Sunday
  });

  it('crosses a month boundary', () => {
    const days = iso(daysInRun(run('2026-09-29', { end: '2026-10-02' }), horizon));
    expect(days).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  });

  it('crosses a year boundary', () => {
    const days = iso(daysInRun(run('2026-12-30', { end: '2027-01-02' }), horizon));
    expect(days).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  });

  it('does not lose or repeat a day across the spring clock change', () => {
    // BST starts 29 March 2026. Local-time arithmetic loses an hour here and
    // can skip or duplicate a day; everything is UTC midnight to avoid it.
    const days = iso(daysInRun(run('2026-03-28', { end: '2026-03-30' }), horizon));
    expect(days).toEqual(['2026-03-28', '2026-03-29', '2026-03-30']);
  });

  it('does not lose or repeat a day across the autumn clock change', () => {
    // GMT returns 25 October 2026.
    const days = iso(daysInRun(run('2026-10-24', { end: '2026-10-26' }), horizon));
    expect(days).toEqual(['2026-10-24', '2026-10-25', '2026-10-26']);
  });

  it('fills only to the horizon when the run is ongoing', () => {
    const days = iso(daysInRun(run('2026-09-07', { ongoing: true, repeatDays: [1] }), utcDate('2026-09-28')));
    expect(days).toEqual(['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']);
  });

  it('tops up an ongoing run without repeating what is already there', () => {
    const days = iso(
      daysInRun(run('2026-09-07', { ongoing: true, repeatDays: [1] }), utcDate('2026-09-28'), utcDate('2026-09-14'))
    );
    expect(days).toEqual(['2026-09-21', '2026-09-28']);
  });

  it('returns nothing when an ongoing run is already filled to the horizon', () => {
    const days = daysInRun(
      run('2026-09-07', { ongoing: true, repeatDays: [1] }),
      utcDate('2026-09-14'),
      utcDate('2026-09-14')
    );
    expect(days).toEqual([]);
  });

  it('refuses a run that ends before it starts', () => {
    expect(() => daysInRun(run('2026-09-10', { end: '2026-09-07' }), horizon)).toThrow(
      /cannot end before it starts/
    );
  });

  it('refuses a run that is both ongoing and ended', () => {
    expect(() => daysInRun(run('2026-09-07', { end: '2026-09-10', ongoing: true }), horizon)).toThrow(
      /either ongoing or has an end date/
    );
  });

  it('refuses a pattern that never lands on a day in the run', () => {
    // Tue 8 Sep only, asking for Saturdays.
    expect(() => daysInRun(run('2026-09-08', { end: '2026-09-08', repeatDays: [6] }), horizon)).toThrow(
      /does not fall on any day/
    );
  });

  it('refuses a run longer than the ceiling, so a mistyped year cannot flood it', () => {
    expect(() => daysInRun(run('2026-09-07', { end: '2036-09-07' }), horizon)).toThrow(
      new RegExp(`more than ${MAX_DAYS_PER_RUN} days`)
    );
  });

  it('carries an HTTP status on every refusal, so none reach the client as a 500', () => {
    try {
      daysInRun(run('2026-09-10', { end: '2026-09-07' }), horizon);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ScheduleError);
      expect((e as ScheduleError).httpStatus).toBe(400);
    }
  });
});

describe('horizonFrom', () => {
  it('is the rolling window ahead of today', () => {
    expect(isoDate(horizonFrom(utcDate('2026-09-07'), 8))).toBe('2026-11-02');
  });
});
