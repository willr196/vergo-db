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

test('the season decides the banner, the header item and the homepage section', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { seasonState, renderBlock } = require('../site/view');
  const at = (iso: string) => {
    const s = seasonState(new Date(iso));
    return { banner: s.banner.map((p: { key: string }) => p.key).join('+'), header: s.header ? s.header.key : '' };
  };
  assert.deepEqual(at('2026-08-31T22:59:59Z'), { banner: '', header: '' }); // 31 Aug, 11:59pm BST
  assert.deepEqual(at('2026-08-31T23:00:00Z'), { banner: 'halloween+christmas', header: 'halloween' }); // 1 Sep
  assert.deepEqual(at('2026-10-31T23:59:59Z'), { banner: 'halloween+christmas', header: 'halloween' }); // 31 Oct, last second
  assert.deepEqual(at('2026-11-01T00:00:00Z'), { banner: 'christmas', header: 'christmas' });
  assert.deepEqual(at('2026-12-20T23:59:59Z'), { banner: 'christmas', header: 'christmas' });
  assert.deepEqual(at('2026-12-21T00:00:00Z'), { banner: '', header: '' });

  // Outside a season the blocks render nothing, rather than an empty shell.
  const realNow = Date.now;
  Date.now = () => Date.parse('2026-12-25T12:00:00Z');
  const RealDate = Date;
  // seasonState() defaults to new Date(); pin it for the block renders.
  (global as any).Date = class extends RealDate {
    constructor(...args: any[]) { super(...(args.length ? args : [RealDate.parse('2026-12-25T12:00:00Z')]) as []); }
  };
  try {
    assert.equal(renderBlock('season-feature', {}, { path: '/' }), '');
    assert.doesNotMatch(renderBlock('header', {}, { path: '/' }), /season-banner|data-season-item/);
  } finally {
    (global as any).Date = RealDate;
    Date.now = realNow;
  }
  assert.match(renderBlock('header', {}, { path: '/terms' }) || '', /data-shared-header/);
});
