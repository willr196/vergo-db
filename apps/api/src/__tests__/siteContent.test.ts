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
  assert.equal(s.rates.standardRate, 19);
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
  assert.equal(PRICING.standardRate, 19);
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

test('booking terms and company details are validated, then reach the pricing, the tokens and the calculator', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { siteTokens } = require('../site/content');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { quoteShift } = require('../config/pricing');
  const s = defaultSettings();
  assert.equal(s.terms.minimumChargeHours, 4);
  assert.equal(s.company.companyNumber, '16627585');
  assert.equal(SETTING_SCHEMAS.terms.safeParse({ ...s.terms, minimumChargeHours: 0 }).success, false);
  assert.equal(SETTING_SCHEMAS.terms.safeParse({ ...s.terms, overrunBlockMinutes: 20 }).success, false);
  assert.equal(SETTING_SCHEMAS.terms.safeParse({ ...s.terms, newYearsEveFromHour: 24 }).success, false);
  assert.equal(SETTING_SCHEMAS.company.safeParse({ ...s.company, companyNumber: '1234' }).success, false);
  assert.equal(SETTING_SCHEMAS.company.safeParse({ ...s.company, registeredOffice: 'London' }).success, false);

  applySettings({
    ...s,
    terms: { ...s.terms, minimumChargeHours: 5, overrunBlockMinutes: 15, newYearsEveFromHour: 20, cancellation: 'Free 72h+ before.' },
    company: { ...s.company, companyNumber: 'SC123456' },
  });
  assert.equal(PRICING.minimumChargeHours, 5);
  assert.equal(PRICING.specialEvents.minimumChargeHours, 5);
  assert.equal(SITE_TERMS.cancellation, 'Free 72h+ before.');
  const t = siteTokens();
  assert.equal(t.MIN_HOURS, '5');
  assert.equal(t.MIN_HOURS_WORD, 'five');
  assert.equal(t.OVERRUN_MINUTES, '15');
  assert.equal(t.NYE_FROM, '8pm');
  assert.equal(t.COMPANY_NUMBER, 'SC123456');
  // A 3-hour shift bills the new 5-hour minimum; 5h10m rounds to the next 15 minutes.
  assert.equal(quoteShift({ start: '18:00', end: '21:00', staff: [{ role: 'Waiting staff', count: 1 }] }).billedMinutes, 300);
  assert.equal(quoteShift({ start: '18:00', end: '23:10', staff: [{ role: 'Waiting staff', count: 1 }] }).billedMinutes, 315);
});

test('event pages switch to next year once their season has passed, and stay up', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { eventSeason, renderView } = require('../site/view');
  const at = (key: string, iso: string) => eventSeason(key, key, new Date(iso));

  assert.deepEqual(at('halloween', '2026-10-31T23:59:59Z'), { inSeason: true, year: 2026, label: 'Halloween', line: 'Now booking 23–24 and 30–31 October.' });
  assert.deepEqual(at('halloween', '2026-11-01T00:00:00Z'), { inSeason: false, year: 2027, label: 'Halloween', line: 'Now booking Halloween 2027.' });
  // Christmas's page runs past its banner (20 December) to New Year's Eve.
  assert.equal(at('christmas', '2026-12-21T12:00:00Z').inSeason, true);
  assert.equal(at('christmas', '2026-12-31T23:59:59Z').inSeason, true);
  assert.deepEqual(at('christmas', '2027-01-01T00:00:00Z'), { inSeason: false, year: 2027, label: 'Christmas', line: 'Now booking Christmas 2027.' });
  // No promo: the page shows as it is, with no dates line.
  assert.deepEqual(at('festival', '2026-11-01T00:00:00Z'), { inSeason: true, year: 2026, label: 'festival', line: null });

  const RealDate = Date;
  const render = (iso: string) => {
    (global as any).Date = class extends RealDate {
      constructor(...args: any[]) { super(...(args.length ? args : [RealDate.parse(iso)]) as []); }
      static now() { return RealDate.parse(iso); }
    };
    try {
      return renderView('special-events/halloween', { path: '/special-events/halloween' });
    } finally {
      (global as any).Date = RealDate;
    }
  };
  const inSeason = render('2026-10-20T12:00:00Z');
  assert.match(inSeason, /Now booking 23–24 and 30–31 October\./);
  assert.doesNotMatch(inSeason, /data-block="event-season"/);

  const after = render('2026-11-02T12:00:00Z');
  assert.match(after, /data-block="event-season"/);
  assert.match(after, /<h2 id="season-heading">Now booking Halloween 2027<\/h2>/);
  assert.doesNotMatch(after, /23–24 and 30–31 October/);
  // Everything else stays, so the page keeps its rankings.
  assert.match(after, /<h1>Halloween event staff and performers in London<\/h1>/);
  assert.match(after, /id="halloweenForm"/);
});
