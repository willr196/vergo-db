import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PRICING, ON_COSTS, calculateCharge, getVatBreakdown, formatPriceLine, getPublicRateCard } from '../config/pricing';
import { siteConfigScript } from '../site/render';

test('calculateCharge uses a single flat standardRate regardless of headcount', () => {
  assert.equal(calculateCharge({ headcount: 2, hoursPerPerson: 4 }).hourlyRate, PRICING.standardRate);
  assert.equal(calculateCharge({ headcount: 10, hoursPerPerson: 4 }).hourlyRate, PRICING.standardRate);
});

test('calculateCharge applies the four-hour minimum and after-midnight multiplier', () => {
  const belowMinimum = calculateCharge({ headcount: 5, hoursPerPerson: 2 });
  assert.equal(belowMinimum.billedHoursPerPerson, PRICING.minimumChargeHours);
  assert.equal(belowMinimum.net.net, PRICING.standardRate * PRICING.minimumChargeHours * 5);

  const midnight = calculateCharge({ headcount: 5, hoursPerPerson: 6, afterMidnight: true });
  assert.equal(midnight.net.net, PRICING.standardRate * PRICING.afterMidnightMultiplier * 6 * 5);
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

test('getPublicRateCard exposes the current rate, never accountRate, and includes holiday pay', () => {
  const card = getPublicRateCard();
  assert.equal(card.standardRate, PRICING.standardRate);
  assert.equal(card.holidayPayPercent, ON_COSTS.holidayAccrualRate * 100);
  assert.ok(!('accountRate' in card));
});

function listJsFilesRecursive(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJsFilesRecursive(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

test('no public JS file hardcodes a rate figure', () => {
  // /vergo-site-config.js is generated from config/pricing.ts (site/render.ts),
  // so it is not a file in public/ at all. Every public script must read the
  // rates from window.VERGO_CONFIG rather than carry its own copy that can
  // silently drift, which is how local and live once disagreed on the rate.
  const publicDir = path.join(process.cwd(), 'public');
  const offenders = listJsFilesRecursive(publicDir)
    .filter((file) => /(?:chargeRate|standardRate|premiumRate)\s*[:=]\s*[\d.]+/.test(fs.readFileSync(file, 'utf8')));

  assert.deepEqual(offenders, []);
  assert.ok(!fs.existsSync(path.join(publicDir, 'vergo-site-config.js')), 'the config script is generated, not a file');
});

test('the generated site config carries the rates from config/pricing.ts', () => {
  const script = siteConfigScript();
  const config = JSON.parse(script.slice(script.indexOf('= {') + 2, script.lastIndexOf('};') + 1));
  assert.equal(config.rates.standardRate, PRICING.standardRate);
  assert.equal(config.rates.premiumRate, PRICING.premiumEnabled ? PRICING.premiumRate : null);
  assert.equal(config.rates.minimumHours, PRICING.minimumChargeHours);
  assert.equal(config.rates.overrunBlockMinutes, PRICING.overrunBlockMinutes);
  assert.equal(config.specialEvents.themedHospitality, PRICING.specialEvents.themedHospitality);
});
