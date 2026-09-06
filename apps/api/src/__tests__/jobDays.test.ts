import test from 'node:test';
import assert from 'node:assert/strict';
import {
  crewSizeFromDays,
  defaultDaysForJob,
  expandDayKeys,
  fromDayKey,
  normalizeDays,
  toDayKey,
} from '../lib/jobDays';

test('toDayKey reads a date in UTC, not the server timezone', () => {
  assert.equal(toDayKey(new Date('2026-09-05T00:00:00.000Z')), '2026-09-05');
  // 23:30 UTC is already the next day in some zones; the key must not drift.
  assert.equal(toDayKey(new Date('2026-09-05T23:30:00.000Z')), '2026-09-05');
  assert.equal(toDayKey('2026-12-31T12:00:00.000Z'), '2026-12-31');
});

test('fromDayKey pins the day to UTC midnight and rejects anything else', () => {
  assert.equal(fromDayKey('2026-09-05').toISOString(), '2026-09-05T00:00:00.000Z');
  assert.throws(() => fromDayKey('05/09/2026'), /expected YYYY-MM-DD/);
  assert.throws(() => fromDayKey('2026-9-5'), /expected YYYY-MM-DD/);
});

test('expandDayKeys covers the range inclusively, month and year boundaries included', () => {
  assert.deepEqual(expandDayKeys('2026-09-05T00:00:00.000Z', '2026-09-07T00:00:00.000Z'), [
    '2026-09-05',
    '2026-09-06',
    '2026-09-07',
  ]);
  assert.deepEqual(expandDayKeys('2026-12-31T00:00:00.000Z', '2027-01-01T00:00:00.000Z'), [
    '2026-12-31',
    '2027-01-01',
  ]);
});

test('expandDayKeys falls back to the single start day when the end is missing or backwards', () => {
  assert.deepEqual(expandDayKeys('2026-09-05T00:00:00.000Z'), ['2026-09-05']);
  assert.deepEqual(expandDayKeys('2026-09-05T00:00:00.000Z', null), ['2026-09-05']);
  assert.deepEqual(
    expandDayKeys('2026-09-05T00:00:00.000Z', '2026-09-01T00:00:00.000Z'),
    ['2026-09-05'],
  );
});

test('defaultDaysForJob gives every day of the event the job headcount', () => {
  assert.deepEqual(
    defaultDaysForJob({
      eventDate: new Date('2026-09-05T00:00:00.000Z'),
      eventEndDate: new Date('2026-09-06T00:00:00.000Z'),
      staffNeeded: 4,
    }),
    [
      { date: '2026-09-05', staffNeeded: 4 },
      { date: '2026-09-06', staffNeeded: 4 },
    ],
  );
});

test('defaultDaysForJob returns nothing for a job with no date yet', () => {
  assert.deepEqual(
    defaultDaysForJob({ eventDate: null, eventEndDate: null, staffNeeded: 3 }),
    [],
  );
});

test('crewSizeFromDays takes the busiest day, not the sum across days', () => {
  // The same six people work all three days; you hire six, not eleven.
  assert.equal(
    crewSizeFromDays(
      [{ staffNeeded: 2 }, { staffNeeded: 6 }, { staffNeeded: 3 }],
      1,
    ),
    6,
  );
});

test('crewSizeFromDays falls back to the job figure when there are no days', () => {
  assert.equal(crewSizeFromDays([], 5), 5);
  assert.equal(crewSizeFromDays([], 0), 1);
});

test('normalizeDays sorts, de-duplicates last-write-wins, and floors headcount at one', () => {
  assert.deepEqual(
    normalizeDays([
      { date: '2026-09-07', staffNeeded: 2 },
      { date: '2026-09-05', staffNeeded: 4 },
      { date: '2026-09-05', staffNeeded: 9 },
      { date: '2026-09-06', staffNeeded: 0 },
    ]),
    [
      { date: '2026-09-05', staffNeeded: 9 },
      { date: '2026-09-06', staffNeeded: 1 },
      { date: '2026-09-07', staffNeeded: 2 },
    ],
  );
});

test('normalizeDays rejects a malformed date rather than storing it', () => {
  assert.throws(() => normalizeDays([{ date: '2026/09/05', staffNeeded: 1 }]), /expected YYYY-MM-DD/);
});
