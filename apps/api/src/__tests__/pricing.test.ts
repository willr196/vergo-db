import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PRICING, ON_COSTS, calculateCharge, getVatBreakdown, formatPriceLine, getPublicRateCard, quoteShift, ShiftQuoteInput } from '../config/pricing';
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

// ---------------------------------------------------------------- quoteShift
//
// The cases the quote form has to get right. Each runs through quoteShift()
// and through public/pages/js/quote-calc.js, the browser copy, so the two
// cannot drift apart.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const browserCalc = require(path.join(process.cwd(), 'public', 'pages', 'js', 'quote-calc.js'));
const browserRates = {
  standardRate: PRICING.standardRate,
  premiumEnabled: PRICING.premiumEnabled,
  premiumRate: PRICING.premiumRate,
  minimumHours: PRICING.minimumChargeHours,
  overrunBlockMinutes: PRICING.overrunBlockMinutes,
  afterMidnightMultiplier: PRICING.afterMidnightMultiplier,
};

function bothQuotes(input: ShiftQuoteInput) {
  const server = quoteShift(input);
  const browser = browserCalc.quoteShift(input, browserRates);
  assert.deepEqual(browser, server, 'browser and server calculators agree');
  assert.ok(server);
  return server!;
}

const one = [{ role: 'Waiting staff', count: 1 }];
const S = PRICING.standardRate;
const P = PRICING.premiumRate;
const U = PRICING.afterMidnightMultiplier - 1;
const r2 = (n: number) => Math.round(n * 100) / 100;

test('quoteShift: Standard, 4 hours', () => {
  const q = bothQuotes({ start: '18:00', end: '22:00', staff: one });
  assert.equal(q.billedMinutes, 240);
  assert.equal(q.total, r2(4 * S));
});

test('quoteShift: Premium, 4 hours', { skip: !PRICING.premiumEnabled }, () => {
  const q = bothQuotes({ start: '18:00', end: '22:00', level: 'premium', staff: one });
  assert.equal(q.rate, P);
  assert.equal(q.total, r2(4 * P));
});

test('quoteShift: a 3-hour booking is billed as 4', () => {
  const q = bothQuotes({ start: '19:00', end: '22:00', staff: one });
  assert.equal(q.workedMinutes, 180);
  assert.equal(q.billedMinutes, 240);
  assert.equal(q.total, r2(4 * S));
});

test('quoteShift: 5h10m is billed as 5h30m', () => {
  const q = bothQuotes({ start: '17:00', end: '22:10', staff: one });
  assert.equal(q.billedMinutes, 330);
  assert.equal(q.total, r2(5.5 * S));
});

test('quoteShift: 20:00 to 01:00 has one hour at +25%', () => {
  const q = bothQuotes({ start: '20:00', end: '01:00', finishesNextDay: true, staff: one });
  assert.equal(q.billedMinutes, 300);
  assert.equal(q.afterMidnightMinutes, 60);
  assert.equal(q.uplift, r2(1 * S * U));
  assert.equal(q.total, r2(5 * S + 1 * S * U));
});

test('quoteShift: overnight 22:00 to 02:30', () => {
  const q = bothQuotes({ start: '22:00', end: '02:30', finishesNextDay: true, staff: one });
  assert.equal(q.workedMinutes, 270);
  assert.equal(q.billedMinutes, 270);
  assert.equal(q.afterMidnightMinutes, 150);
  assert.equal(q.total, r2(4.5 * S + 2.5 * S * U));
});

test('quoteShift: a same-day shift that ends before it starts is not priced', () => {
  assert.equal(quoteShift({ start: '22:00', end: '02:30', staff: one }), null);
  assert.equal(browserCalc.quoteShift({ start: '22:00', end: '02:30', staff: one }, browserRates), null);
});

test('quoteShift: mixed roles price at one rate', () => {
  const q = bothQuotes({
    start: '18:00',
    end: '23:00',
    staff: [
      { role: 'Waiting staff', count: 3 },
      { role: 'Bar staff', count: 2 },
      { role: 'Kitchen porters', count: 1 },
    ],
  });
  assert.equal(q.pricedPeople, 6);
  assert.equal(q.total, r2(6 * 5 * S));
});

test('quoteShift: senior roles stay out of the total', () => {
  const q = bothQuotes({
    start: '18:00',
    end: '22:00',
    staff: [
      { role: 'Waiting staff', count: 2 },
      { role: 'Chefs and cooks', count: 1, senior: true },
    ],
  });
  assert.equal(q.pricedPeople, 2);
  assert.equal(q.seniorPeople, 1);
  assert.equal(q.total, r2(2 * 4 * S));
});
