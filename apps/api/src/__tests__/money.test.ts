import test from 'node:test';
import assert from 'node:assert/strict';
import { parseClock, shiftHours, bookingMoney, floatPosition } from '../lib/money';
import { ON_COSTS } from '../config/pricing';

test('parseClock converts HH:MM to minutes since midnight and rejects malformed input', () => {
  assert.equal(parseClock('00:00'), 0);
  assert.equal(parseClock('07:00'), 420);
  assert.equal(parseClock('23:59'), 1439);
  assert.throws(() => parseClock('7:00'), /Invalid time/);
  assert.throws(() => parseClock('24:00'), /Invalid time/);
  assert.throws(() => parseClock('not-a-time'), /Invalid time/);
});

test('shiftHours computes paid hours for a standard 10-hour day', () => {
  assert.equal(shiftHours('09:00', '19:00'), 10);
  assert.equal(shiftHours('09:00', '19:30', 30), 10);
});

test('shiftHours handles a shift crossing midnight, break included', () => {
  // 22:00 -> 06:00 is 8h gross; a 30-minute break leaves 7.5h paid.
  assert.equal(shiftHours('22:00', '06:00', 30), 7.5);
});

test('shiftHours throws when the break is longer than the shift', () => {
  assert.throws(() => shiftHours('09:00', '13:00', 300), /longer than the shift/);
});

test('a casual assignment (no NI/pension liability) produces holiday-only on-costs', () => {
  // Mirrors the brief's own worked example: 6h @ £19 charge / £15.50 pay, casual.
  const result = bookingMoney({
    hours: 6,
    hourlyRateChargedPence: 1900,
    staffPayRatePence: 1550,
    niLiable: false,
    pensionEnrolled: false,
    provisional: false,
  });

  assert.equal(result.revenuePence, 11400);
  assert.equal(result.wagePence, 9300);
  assert.equal(result.onCostBreakdown.employerNiPence, 0);
  assert.equal(result.onCostBreakdown.pensionPence, 0);
  assert.equal(result.onCostsPence, result.onCostBreakdown.holidayPence);
  assert.equal(result.netMarginPence, 977);
});

test('a second casual example matches the brief\'s worked figures', () => {
  // 10h @ £19 charge / £13.50 pay, casual.
  const result = bookingMoney({
    hours: 10,
    hourlyRateChargedPence: 1900,
    staffPayRatePence: 1350,
    niLiable: false,
    pensionEnrolled: false,
    provisional: false,
  });

  assert.equal(result.netMarginPence, 3871);
});

test('a flagged assignment (NI liable + pension enrolled) charges all three on-costs', () => {
  const result = bookingMoney({
    hours: 8,
    hourlyRateChargedPence: 1900,
    staffPayRatePence: 1350,
    niLiable: true,
    pensionEnrolled: true,
    provisional: false,
  });

  const base = result.wagePence + result.onCostBreakdown.holidayPence;
  assert.equal(result.onCostBreakdown.employerNiPence, Math.round(base * ON_COSTS.employerNiRate));
  assert.equal(result.onCostBreakdown.pensionPence, Math.round(base * ON_COSTS.employerPensionRate));
  assert.equal(
    result.onCostsPence,
    result.onCostBreakdown.holidayPence + result.onCostBreakdown.employerNiPence + result.onCostBreakdown.pensionPence
  );
  assert.equal(result.netMarginPence, result.revenuePence - result.wagePence - result.onCostsPence);
});

test('bookingMoney carries the provisional flag through unchanged', () => {
  const provisional = bookingMoney({
    hours: 5, hourlyRateChargedPence: 1900, staffPayRatePence: 1350,
    niLiable: false, pensionEnrolled: false, provisional: true,
  });
  assert.equal(provisional.provisional, true);

  const final = bookingMoney({
    hours: 5, hourlyRateChargedPence: 1900, staffPayRatePence: 1350,
    niLiable: false, pensionEnrolled: false, provisional: false,
  });
  assert.equal(final.provisional, false);
});

test('floatPosition only counts bookings paid by the client but not yet paid to staff', () => {
  const now = new Date('2026-08-18T00:00:00Z');
  const rows = [
    {
      id: 'held-1',
      revenuePence: 20000,
      wagePence: 10000,
      onCostsPence: 1500,
      clientPaidAt: new Date('2026-08-01'),
      staffPaidAt: null,
      staffPayDueAt: new Date('2026-08-20'),
    },
    {
      id: 'held-2',
      revenuePence: 5000,
      wagePence: 2500,
      onCostsPence: 300,
      clientPaidAt: new Date('2026-08-10'),
      staffPaidAt: null,
      staffPayDueAt: new Date('2026-08-15'),
    },
    // Not yet client-paid — excluded.
    {
      id: 'unpaid',
      revenuePence: 9999,
      wagePence: 9999,
      onCostsPence: 9999,
      clientPaidAt: null,
      staffPaidAt: null,
      staffPayDueAt: null,
    },
    // Fully settled — excluded.
    {
      id: 'settled',
      revenuePence: 9999,
      wagePence: 9999,
      onCostsPence: 9999,
      clientPaidAt: new Date('2026-07-01'),
      staffPaidAt: new Date('2026-07-15'),
      staffPayDueAt: new Date('2026-07-15'),
    },
  ];

  const result = floatPosition(rows, now);

  assert.equal(result.heldPence, 25000);
  assert.equal(result.committedPence, 14300);
  assert.equal(result.freePence, 10700);
  assert.deepEqual(result.unwindsFrom, new Date('2026-08-15'));
  assert.equal(result.daysToUnwind, -3);
});

test('floatPosition returns nulls/zeroes when nothing is held', () => {
  const result = floatPosition([], new Date());
  assert.equal(result.heldPence, 0);
  assert.equal(result.committedPence, 0);
  assert.equal(result.freePence, 0);
  assert.equal(result.unwindsFrom, null);
  assert.equal(result.daysToUnwind, null);
});
