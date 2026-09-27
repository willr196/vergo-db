import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
// Nothing listens here, so every query fails fast: the "database is down" case.
process.env.DATABASE_URL = 'postgresql://nobody:nothing@127.0.0.1:1/vergo_test';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PRICING, SITE_TERMS } = require('../config/pricing');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SITE } = require('../site/content');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { applySettings, defaultSettings, parseSettings, SETTING_SCHEMAS } = require('../site/settings');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { refreshContent, resetContentForTests, siteContent } = require('../site/store');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { defaultPromos } = require('../site/defaults');

test.afterEach(() => resetContentForTests());

test('the defaults are today\'s values', () => {
  const s = defaultSettings();
  assert.equal(s.rates.standardRate, 18.5);
  assert.equal(s.rates.afterMidnightUpliftPct, 25);
  assert.equal(s.contact.phoneDisplay, SITE.phoneDisplay);
  for (const key of Object.keys(SETTING_SCHEMAS)) {
    assert.ok(SETTING_SCHEMAS[key].safeParse(s[key]).success, `${key} defaults must pass their own schema`);
  }
});

test('rates outside £12.71 to £100, and uplifts outside 0 to 100%, are refused', () => {
  const rates = defaultSettings().rates;
  assert.equal(SETTING_SCHEMAS.rates.safeParse({ ...rates, standardRate: 12.70 }).success, false);
  assert.equal(SETTING_SCHEMAS.rates.safeParse({ ...rates, premiumRate: 100.01 }).success, false);
  assert.equal(SETTING_SCHEMAS.rates.safeParse({ ...rates, afterMidnightUpliftPct: 101 }).success, false);
  assert.equal(SETTING_SCHEMAS.rates.safeParse({ ...rates, standardRate: 12.71 }).success, true);
});

test('a bad row keeps its default; a good one is applied everywhere', () => {
  const good = { ...defaultSettings().rates, standardRate: 20, afterMidnightUpliftPct: 50 };
  const settings = parseSettings([
    { key: 'rates', value: good },
    { key: 'promises', value: { confirmationPromise: '' } },
    { key: 'unknown', value: 1 },
  ]);
  assert.equal(settings.rates.standardRate, 20);
  assert.equal(settings.promises.confirmationPromise, SITE_TERMS.confirmationPromise);

  applySettings(settings);
  assert.equal(PRICING.standardRate, 20);
  assert.equal(PRICING.afterMidnightMultiplier, 1.5);
});

test('with the database down, a refresh keeps the site on its last good copy', async () => {
  const started = Date.now();
  await refreshContent();
  assert.ok(Date.now() - started < 2000, 'a failed refresh must not hang');
  assert.equal(siteContent().source, 'defaults');
  assert.equal(PRICING.standardRate, 18.5);
});

test('season windows are London days', () => {
  const [halloween, christmas] = defaultPromos(2026);
  // 1 September is BST, so midnight in London is 23:00 UTC the day before.
  assert.equal(halloween.startsAt.toISOString(), '2026-08-31T23:00:00.000Z');
  // 31 October 2026 is after the clocks go back: GMT.
  assert.equal(halloween.endsAt.toISOString(), '2026-10-31T23:59:59.999Z');
  assert.equal(christmas.navStartsAt.toISOString(), '2026-11-01T00:00:00.000Z');
});
