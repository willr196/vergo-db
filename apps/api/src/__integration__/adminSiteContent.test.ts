/**
 * Admin > Site content, against a real database: every save is validated,
 * logged, and on the rendered site straight after.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';

import { prisma, resetDatabase, disconnect, csrfHeaders, inject } from './helpers';
import { PRICING } from '../config/pricing';
import { resetContentForTests, siteContent } from '../site/store';
import { renderBlock, renderView } from '../site/view';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ADMIN_TEST_SESSION_ID } = require('../testing/csrf');

function createApp() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const router = require('../routes/adminSiteContent').default;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cookieParser = require('cookie-parser');
  const app = express();
  app.use('/api/v1/admin/site-content/photos', express.json({ limit: '17mb' }));
  app.use(express.json());
  app.use(cookieParser());
  app.use((req: any, _res: any, next: any) => {
    req.session = { id: ADMIN_TEST_SESSION_ID, adminId: 'admin-1', username: 'will', isAdmin: true };
    next();
  });
  app.use('/api/v1/admin/site-content', router);
  return app;
}

const app = createApp();
const BASE = '/api/v1/admin/site-content';
const send = (method: string, url: string, body?: unknown) =>
  inject(app, { method, url: BASE + url, headers: csrfHeaders(), body: body as any });

test.beforeEach(async () => {
  await resetDatabase();
  resetContentForTests();
});

test.after(async () => {
  resetContentForTests();
  fs.rmSync(path.join(process.cwd(), 'uploads', 'site'), { recursive: true, force: true });
  await disconnect();
});

async function imported() {
  const res = await send('POST', '/import');
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
}

test('nothing can be edited before the import, and the import changes nothing on the site', async () => {
  const before = renderView('hire/weddings', { path: '/hire/weddings' });

  const early = await send('PUT', '/settings/brand', { slogan: 'New', googleReviewsUrl: '' });
  assert.equal(early.statusCode, 409);

  await imported();
  const overview = await send('GET', '/');
  assert.equal(overview.body.seeded, true);
  assert.equal(overview.body.serving, 'database');
  assert.equal(renderView('hire/weddings', { path: '/hire/weddings' }), before);
});

test('a rate save is validated, stored in pence, logged, and on the site at once', async () => {
  await imported();
  const standard = (await send('GET', '/')).body.rates.find((r: any) => r.key === 'standard');
  assert.equal(standard.amountPence, 1900);
  assert.equal(standard.core, true);

  const tooLow = await send('PUT', `/rates/${standard.id}`, { ...standard, amountPence: 900 });
  assert.equal(tooLow.statusCode, 400);
  assert.equal(PRICING.standardRate, 19);

  const ok = await send('PUT', `/rates/${standard.id}`, { ...standard, amountPence: 1975 });
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
  assert.equal((await prisma.rate.findUniqueOrThrow({ where: { key: 'standard' } })).amountPence, 1975);
  assert.equal(PRICING.standardRate, 19.75);
  assert.match(renderBlock('rates', {}, { path: '/hire' }) || '', /£19\.75/);

  const log = await prisma.contentChange.findFirst({ where: { what: { startsWith: 'Edited the rate' } } });
  assert.equal(log?.who, 'will');

  // Undo it from the history.
  assert.equal((await send('POST', `/changes/${log!.id}/revert`)).statusCode, 200);
  assert.equal(PRICING.standardRate, 19);
});

test('core rates stay hourly, public and active, and can\'t be deleted; other rates are the admin\'s', async () => {
  await imported();
  const premium = (await send('GET', '/')).body.rates.find((r: any) => r.key === 'premium');
  assert.equal((await send('PUT', `/rates/${premium.id}`, { ...premium, visibility: 'quote_only' })).statusCode, 400);
  assert.equal((await send('PUT', `/rates/${premium.id}`, { ...premium, active: false })).statusCode, 400);
  assert.equal((await send('PUT', `/rates/${premium.id}`, { ...premium, key: 'premium_plus' })).statusCode, 400);
  assert.equal((await send('DELETE', `/rates/${premium.id}`)).statusCode, 400);

  const santa = { key: 'santa', label: 'Santa', amountPence: 4500, unit: 'hour', category: 'seasonal', visibility: 'public', active: true };
  const added = await send('POST', '/rates', santa);
  assert.equal(added.statusCode, 201, JSON.stringify(added.body));
  assert.equal((await send('POST', '/rates', santa)).statusCode, 409, 'keys are unique');
  assert.equal((await send('POST', '/rates', { ...santa, key: 'standard' })).statusCode, 409);
  await send('POST', '/rates', { ...santa, key: 'trade', label: 'Trade', amountPence: 1500, visibility: 'quote_only' });

  // An FAQ can carry the new rate as a token.
  await send('POST', '/faqs', { pageKey: 'special-events/christmas', question: 'Do you supply Santa?', answer: 'Yes, from {{RATE_SANTA}}/hr.' });
  assert.match(renderView('special-events/christmas', { path: '/special-events/christmas' }), /Yes, from £45\/hr\./);

  // The public API: never quote-only.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ratesRouter = require('../routes/rates').default;
  const pub = express();
  pub.use('/api/v1/rates', ratesRouter);
  const res = await inject(pub, { method: 'GET', url: '/api/v1/rates' });
  const keys = res.body.data.roles.map((r: any) => r.key);
  assert.ok(keys.includes('santa'));
  assert.ok(!keys.includes('trade'), 'quote-only rates never reach the public API');
  assert.equal(res.body.data.roles.find((r: any) => r.key === 'santa').amountPence, 4500);

  assert.equal((await send('DELETE', `/rates/${added.body.item.id}`)).statusCode, 200);
});

test('the rate card migration carries amounts already edited in the old settings row', async () => {
  await imported();
  await prisma.rate.deleteMany();
  await prisma.siteSetting.update({
    where: { key: 'rates' },
    data: { value: { standardRate: 19.75, premiumEnabled: true, premiumRate: 24, afterMidnightUpliftPct: 25, themedHospitality: 22.5, characterPerformer: 26, makeupArtist: 35 } },
  });
  const sql = fs.readFileSync(path.join(process.cwd(), 'prisma', 'migrations', '20261020130000_rate_card_pence', 'migration.sql'), 'utf8');
  await prisma.$executeRawUnsafe(sql.slice(sql.indexOf('WITH s AS')));
  const rows = Object.fromEntries((await prisma.rate.findMany()).map((r) => [r.key, r.amountPence]));
  assert.deepEqual(rows, { standard: 1975, premium: 2400, themed_hospitality: 2250, character_performer: 2600, makeup_artist: 3500 });
});

test('the length limits are enforced on the server', async () => {
  await imported();
  const long = Array.from({ length: 61 }, () => 'word').join(' ');
  const review = await send('POST', '/testimonials', { quote: long, name: 'A', context: 'B' });
  assert.equal(review.statusCode, 400);
  assert.match(review.body.error, /61 words; the limit is 60/);

  const faq = await send('POST', '/faqs', {
    pageKey: 'work',
    question: 'Q?',
    answer: 'One sentence. Two sentences. Three sentences.',
  });
  assert.equal(faq.statusCode, 400);
  assert.match(faq.body.error, /3 sentences; the limit is 2/);

  const work = await send('POST', '/recent-work', { title: 'Wedding', detail: 'one two three four five six seven eight nine ten eleven twelve' });
  assert.equal(work.statusCode, 400);

  const promos = (await send('GET', '/')).body.promos;
  const h = promos.find((p: any) => p.key === 'halloween');
  const banner = await send('PUT', `/promos/${h.id}`, {
    ...h,
    bannerText: 'one two three four five six seven eight nine ten eleven',
  });
  assert.equal(banner.statusCode, 400);
});

test('FAQs: add, edit, reorder and delete, each on the page straight away', async () => {
  await imported();
  const created = await send('POST', '/faqs', { pageKey: 'hire/weddings', question: 'Can you do a ceilidh?', answer: 'We can staff one.' });
  assert.equal(created.statusCode, 201, JSON.stringify(created.body));
  let html = renderView('hire/weddings', { path: '/hire/weddings' });
  assert.match(html, /Can you do a ceilidh\?/);
  // The FAQPage structured data follows the same rows.
  assert.match(html, /"name": "Can you do a ceilidh\?"/);

  const id = created.body.item.id;
  await send('PUT', `/faqs/${id}`, { pageKey: 'hire/weddings', question: 'Can you staff a ceilidh?', answer: 'Yes.' });
  html = renderView('hire/weddings', { path: '/hire/weddings' });
  assert.match(html, /Can you staff a ceilidh\?/);

  const rows = await prisma.faq.findMany({ where: { pageKey: 'hire/weddings' }, orderBy: { order: 'asc' } });
  const reversed = rows.map((r) => r.id).reverse();
  assert.equal((await send('POST', '/faqs/reorder', { ids: reversed })).statusCode, 200);
  html = renderView('hire/weddings', { path: '/hire/weddings' });
  assert.ok(html.indexOf('Can you staff a ceilidh?') < html.indexOf(rows[0].question), 'the new first FAQ renders first');

  assert.equal((await send('DELETE', `/faqs/${id}`)).statusCode, 200);
  assert.doesNotMatch(renderView('hire/weddings', { path: '/hire/weddings' }), /ceilidh/);
});

test('promo dates are London days, and the admin sees what is live', async () => {
  await imported();
  const h = (await send('GET', '/')).body.promos.find((p: any) => p.key === 'halloween');
  assert.equal(h.startsOn, '2026-09-01');
  assert.equal(h.endsOn, '2026-10-31');

  const backwards = await send('PUT', `/promos/${h.id}`, { ...h, startsOn: '2026-10-31', endsOn: '2026-09-01' });
  assert.equal(backwards.statusCode, 400);

  const moved = await send('PUT', `/promos/${h.id}`, { ...h, endsOn: '2026-11-02' });
  assert.equal(moved.statusCode, 200, JSON.stringify(moved.body));
  const row = await prisma.seasonalPromo.findUniqueOrThrow({ where: { id: h.id } });
  assert.equal(row.endsAt.toISOString(), '2026-11-02T23:59:59.999Z');
  assert.equal(siteContent().promos.find((p) => p.key === 'halloween')?.endsAt.toISOString(), '2026-11-02T23:59:59.999Z');
});

test('a photo upload is re-encoded to WebP widths and served by tag', async () => {
  await imported();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sharp = require('sharp');
  const png: Buffer = await sharp({ create: { width: 1000, height: 600, channels: 3, background: '#1F5C45' } }).png().toBuffer();

  const missingAlt = await send('POST', '/photos', { contentBase64: png.toString('base64'), alt: '', tags: [] });
  assert.equal(missingAlt.statusCode, 400);

  const notImage = await send('POST', '/photos', { contentBase64: Buffer.from('hello').toString('base64'), alt: 'x', tags: [] });
  assert.equal(notImage.statusCode, 400);

  const res = await send('POST', '/photos', {
    contentBase64: 'data:image/png;base64,' + png.toString('base64'),
    alt: 'The bar at a wedding in Richmond',
    tags: ['home'],
  });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  const photo = res.body.item;
  // 1000px wide: an 800px copy, and no 1600px one to upscale into.
  assert.deepEqual(photo.variants, [800]);
  assert.match(photo.path, /^\/media\/site\/[a-f0-9-]{36}-\{w\}\.webp$/);
  const file = path.join(process.cwd(), 'uploads', 'site', photo.path.split('/').pop().replace('{w}', '800'));
  assert.equal((await sharp(fs.readFileSync(file)).metadata()).format, 'webp');

  assert.ok(siteContent().photos.some((p) => p.alt === 'The bar at a wedding in Richmond'));
});

/** The newest change in the history, as the admin sees it. */
async function latestChange() {
  return (await send('GET', '/')).body.changes[0];
}

test('a settings change can be reverted, once, and the revert reverted in turn', async () => {
  await imported();
  const terms = (await send('GET', '/')).body.settings.terms;
  assert.equal((await send('PUT', '/settings/terms', { ...terms, minimumChargeHours: 6 })).statusCode, 200);
  assert.equal(PRICING.minimumChargeHours, 6);
  const change = await latestChange();
  assert.equal(change.revertible, true);

  assert.equal((await send('POST', `/changes/${change.id}/revert`)).statusCode, 200);
  assert.equal(PRICING.minimumChargeHours, 4);
  assert.match(renderBlock('rates', {}, { path: '/hire' }) || '', /4-hour minimum/);

  const history = (await send('GET', '/')).body.changes;
  assert.equal(history.find((c: any) => c.id === change.id).reverted, true);
  assert.equal((await send('POST', `/changes/${change.id}/revert`)).statusCode, 409);

  // Undoing the revert puts the 6 back.
  assert.equal((await send('POST', `/changes/${history[0].id}/revert`)).statusCode, 200);
  assert.equal(PRICING.minimumChargeHours, 6);
});

test('a setting first written by a save is removed again by its revert', async () => {
  await imported();
  await prisma.siteSetting.delete({ where: { key: 'company' } });
  const company = (await send('GET', '/')).body.settings.company;
  assert.equal((await send('PUT', '/settings/company', { ...company, companyNumber: 'SC123456' })).statusCode, 200);
  assert.equal((await send('POST', `/changes/${(await latestChange()).id}/revert`)).statusCode, 200);
  assert.equal(await prisma.siteSetting.findUnique({ where: { key: 'company' } }), null);
  assert.equal(siteContent().settings.company.companyNumber, '16627585');
});

test('FAQ edits, deletes, additions and reorders revert; a later edit blocks reverting an earlier one', async () => {
  await imported();
  const page = () => renderView('hire/weddings', { path: '/hire/weddings' });
  const rows = await prisma.faq.findMany({ where: { pageKey: 'hire/weddings' }, orderBy: { order: 'asc' } });
  const first = rows[0];

  // Edit, then revert: the old wording is back on the page.
  await send('PUT', `/faqs/${first.id}`, { pageKey: first.pageKey, question: 'Edited question?', answer: first.answer });
  const edit = await latestChange();
  await send('PUT', `/faqs/${first.id}`, { pageKey: first.pageKey, question: 'Edited again?', answer: first.answer });
  const blocked = await send('POST', `/changes/${edit.id}/revert`);
  assert.equal(blocked.statusCode, 409);
  assert.match(blocked.body.error, /changed again since/);
  assert.equal((await send('POST', `/changes/${(await latestChange()).id}/revert`)).statusCode, 200);
  assert.equal((await send('POST', `/changes/${edit.id}/revert`)).statusCode, 200);
  assert.equal((await prisma.faq.findUniqueOrThrow({ where: { id: first.id } })).question, first.question);

  // Delete, then revert: the same row is back, with the same id.
  await send('DELETE', `/faqs/${first.id}`);
  assert.doesNotMatch(page(), new RegExp(first.question.replace(/[?.]/g, '\$&')));
  assert.equal((await send('POST', `/changes/${(await latestChange()).id}/revert`)).statusCode, 200);
  assert.match(page(), new RegExp(first.question.replace(/[?.]/g, '\$&')));

  // Add, then revert: gone.
  await send('POST', '/faqs', { pageKey: 'hire/weddings', question: 'Can you do a ceilidh?', answer: 'We can staff one.' });
  assert.equal((await send('POST', `/changes/${(await latestChange()).id}/revert`)).statusCode, 200);
  assert.doesNotMatch(page(), /ceilidh/);

  // Reorder, then revert: the old order.
  const ids = rows.map((r) => r.id);
  await send('POST', '/faqs/reorder', { ids: [...ids].reverse() });
  assert.equal((await send('POST', `/changes/${(await latestChange()).id}/revert`)).statusCode, 200);
  const after = await prisma.faq.findMany({ where: { pageKey: 'hire/weddings' }, orderBy: { order: 'asc' } });
  assert.deepEqual(after.map((r) => r.id), ids);
});

test('history from before snapshots shows no Revert, and reverting it is refused', async () => {
  await imported();
  const old = await prisma.contentChange.create({ data: { who: 'will', what: 'Updated brand', detail: { before: null, after: {} } } });
  const row = (await send('GET', '/')).body.changes.find((c: any) => c.id === old.id);
  assert.equal(row.revertible, false);
  assert.equal((await send('POST', `/changes/${old.id}/revert`)).statusCode, 409);
});

test('a promo carries its event page line and in-season date', async () => {
  await imported();
  const h = (await send('GET', '/')).body.promos.find((p: any) => p.key === 'halloween');
  assert.equal(h.pageLine, 'Now booking 23–24 and 30–31 October.');
  const c = (await send('GET', '/')).body.promos.find((p: any) => p.key === 'christmas');
  assert.equal(c.pageUntilOn, '2026-12-31');

  const res = await send('PUT', `/promos/${h.id}`, { ...h, pageLine: 'Now booking 30–31 October only.', pageUntilOn: '2030-11-01' });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(siteContent().promos.find((p) => p.key === 'halloween')?.pageUntil?.toISOString(), '2030-11-01T23:59:59.999Z');
  // The FAQ that carries the token follows the promo's line.
  assert.match(renderView('special-events/halloween', { path: '/special-events/halloween' }), /Now booking 30–31 October only\. Ask anyway/);
});

test('a draft changes nothing live, shows in the admin preview, and goes live on publish', async () => {
  await imported();
  const page = () => renderView('hire/weddings', { path: '/hire/weddings' });
  const live = page();
  const first = (await prisma.faq.findMany({ where: { pageKey: 'hire/weddings' }, orderBy: { order: 'asc' } }))[0];

  // An edit to an existing FAQ, and a new one, both as drafts.
  const edit = await send('POST', '/drafts/faqs', { rowId: first.id, data: { pageKey: 'hire/weddings', question: 'Drafted question?', answer: first.answer } });
  assert.equal(edit.statusCode, 201, JSON.stringify(edit.body));
  const fresh = await send('POST', '/drafts/faqs', { data: { pageKey: 'hire/weddings', question: 'Can you do a ceilidh?', answer: 'We can staff one.' } });
  assert.equal(fresh.statusCode, 201);
  assert.equal(page(), live, 'drafts never reach the live page');

  // Saving again over the same record replaces its draft rather than adding one.
  const again = await send('POST', '/drafts/faqs', { rowId: first.id, data: { pageKey: 'hire/weddings', question: 'Drafted again?', answer: first.answer } });
  assert.equal(again.statusCode, 200);
  assert.equal(await prisma.contentDraft.count(), 2);

  // Drafts are validated like a save.
  const tooLong = await send('POST', '/drafts/faqs', { data: { pageKey: 'hire/weddings', question: 'Q?', answer: 'word '.repeat(80) } });
  assert.equal(tooLong.statusCode, 400);

  const preview = await send('GET', '/preview?path=/hire/weddings');
  assert.equal(preview.statusCode, 200);
  assert.match(String(preview.headers['cache-control']), /no-store/);
  assert.match(preview.raw, /Preview with drafts\. Not live until published\./);
  assert.match(preview.raw, /Drafted again\?/);
  assert.match(preview.raw, /Can you do a ceilidh\?/);
  assert.doesNotMatch(preview.raw, new RegExp(first.question.replace(/[?.]/g, '\$&')));
  assert.equal(page(), live, 'a preview leaves the live copy alone');
  assert.equal((await send('GET', '/preview?path=/no-such-page')).statusCode, 404);

  // Publish the edit: live, logged and revertible, and the draft is gone.
  assert.equal((await send('POST', `/drafts/${again.body.draft.id}/publish`)).statusCode, 200);
  assert.match(page(), /Drafted again\?/);
  assert.doesNotMatch(page(), /ceilidh/);
  const overview = (await send('GET', '/')).body;
  assert.equal(overview.drafts.length, 1);
  assert.equal(overview.changes[0].revertible, true);

  // Discard the new one: nothing changes live.
  assert.equal((await send('DELETE', `/drafts/${fresh.body.draft.id}`)).statusCode, 200);
  assert.equal(await prisma.contentDraft.count(), 0);
  assert.doesNotMatch(page(), /ceilidh/);
});

test('a new promo published from a draft runs its banner; deleting a record drops its draft', async () => {
  await imported();
  const promo = {
    key: 'festival', navLabel: 'Festivals', bannerText: 'Festival bar teams: now booking', href: '/hire',
    homeHeading: 'Festival season', homeLines: ['Bar teams for festivals.'], startsOn: '2020-01-01', endsOn: '2099-12-31',
  };
  const draft = await send('POST', '/drafts/promos', { data: promo });
  assert.equal(draft.statusCode, 201, JSON.stringify(draft.body));
  assert.doesNotMatch(renderBlock('header', {}, { path: '/hire' }) || '', /Festival bar teams/);
  assert.match((await send('GET', '/preview?path=/hire')).raw, /Festival bar teams: now booking/);

  assert.equal((await send('POST', `/drafts/${draft.body.draft.id}/publish`)).statusCode, 200);
  assert.match(renderBlock('header', {}, { path: '/hire' }) || '', /Festival bar teams: now booking/);

  const row = await prisma.seasonalPromo.findUniqueOrThrow({ where: { key: 'festival' } });
  await send('POST', '/drafts/promos', { rowId: row.id, data: { ...promo, bannerText: 'Changed' } });
  assert.equal((await send('DELETE', `/promos/${row.id}`)).statusCode, 200);
  assert.equal(await prisma.contentDraft.count(), 0);
});

test('the preview needs an admin session', async () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const router = require('../routes/adminSiteContent').default;
  const bare = express();
  bare.use((req: any, _res: any, next: any) => { req.session = {}; next(); });
  bare.use(BASE, router);
  const res = await inject(bare, { method: 'GET', url: `${BASE}/preview?path=/hire` });
  assert.ok([401, 403].includes(res.statusCode), `got ${res.statusCode}`);
  assert.doesNotMatch(String(res.raw || ''), /<main/);
});
