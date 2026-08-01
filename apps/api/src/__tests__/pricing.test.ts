import test from 'node:test';
import assert from 'node:assert/strict';
import { PRICING, calculateCharge, getVatBreakdown, formatPriceLine, resolveHourlyRate } from '../config/pricing';

test('resolveHourlyRate applies standardRateBelowThreshold under the volume threshold', () => {
  assert.equal(resolveHourlyRate(4), PRICING.standardRateBelowThreshold);
  assert.equal(resolveHourlyRate(5), PRICING.volumeRate);
  assert.equal(resolveHourlyRate(10), PRICING.volumeRate);
});

test('calculateCharge applies the four-hour minimum and after-midnight multiplier', () => {
  const belowMinimum = calculateCharge({ headcount: 5, hoursPerPerson: 2 });
  assert.equal(belowMinimum.billedHoursPerPerson, PRICING.minimumChargeHours);
  assert.equal(belowMinimum.net.net, PRICING.volumeRate * PRICING.minimumChargeHours * 5);

  const midnight = calculateCharge({ headcount: 5, hoursPerPerson: 6, afterMidnight: true });
  assert.equal(midnight.net.net, PRICING.volumeRate * PRICING.afterMidnightMultiplier * 6 * 5);
});

test('VAT is driven entirely by the vatRegistered flag — flipping it is the only required change', (t) => {
  const original = PRICING.vatRegistered;
  t.after(() => {
    (PRICING as { vatRegistered: boolean }).vatRegistered = original;
  });

  (PRICING as { vatRegistered: boolean }).vatRegistered = false;
  const netOnly = getVatBreakdown(100);
  assert.deepEqual(netOnly, { net: 100, vat: 0, gross: 100 });
  assert.equal(formatPriceLine(100), '£100');

  (PRICING as { vatRegistered: boolean }).vatRegistered = true;
  const withVat = getVatBreakdown(100);
  assert.deepEqual(withVat, { net: 100, vat: 20, gross: 120 });
  assert.equal(formatPriceLine(100), '£100 + VAT');
});
