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

test('a rate save is validated, logged, and on the site at once', async () => {
  await imported();
  const rates = (await send('GET', '/')).body.settings.rates;

  const tooLow = await send('PUT', '/settings/rates', { ...rates, standardRate: 9 });
  assert.equal(tooLow.statusCode, 400);
  assert.equal(PRICING.standardRate, 18.5);

  const ok = await send('PUT', '/settings/rates', { ...rates, standardRate: 19.75 });
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
  assert.equal(PRICING.standardRate, 19.75);
  assert.match(renderBlock('rates', {}, { path: '/hire' }) || '', /£19\.75/);

  const log = await prisma.contentChange.findFirst({ where: { what: 'Updated rates' } });
  assert.equal(log?.who, 'will');
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
