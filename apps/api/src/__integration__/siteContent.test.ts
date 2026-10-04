/**
 * Site content from the database, end to end: the seed, the store that pages
 * read from, and a change in the database reaching a rendered page.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { prisma, resetDatabase, disconnect } from './helpers';
import { PRICING } from '../config/pricing';
import { refreshContent, resetContentForTests, siteContent } from '../site/store';
import { renderBlock, renderView } from '../site/view';

const API_DIR = path.resolve(__dirname, '..', '..', '..');

function seed() {
  // The compiled seed, so this runs without tsx and against exactly this build.
  execFileSync(process.execPath, [path.join(API_DIR, 'dist', 'prisma', 'seed-site-content.js')], {
    cwd: API_DIR,
    env: process.env,
    stdio: 'pipe',
  });
}

test.beforeEach(async () => {
  await resetDatabase();
  resetContentForTests();
});

test.after(async () => {
  resetContentForTests();
  await disconnect();
});

test('an unseeded database leaves the built-in content in place', async () => {
  await prisma.testimonial.create({ data: { quote: 'Stray row', name: 'Nobody', context: 'test' } });
  await refreshContent();
  assert.equal(siteContent().source, 'defaults');
  assert.ok(!siteContent().testimonials.some((t) => t.quote === 'Stray row'));
});

test('the seed copies the site in, once, and the store then reads the database', async () => {
  seed();
  seed(); // a second run must not duplicate anything
  assert.equal(await prisma.faq.count({ where: { pageKey: 'special-events/halloween' } }), 4);
  assert.equal(await prisma.seasonalPromo.count(), 2);
  const testimonials = await prisma.testimonial.count();

  await refreshContent();
  const content = siteContent();
  assert.equal(content.source, 'database');
  assert.equal(content.testimonials.length, testimonials);
  assert.equal(content.faqs['hire/weddings'].length, 3);
});

test('a rate changed in the database reaches the rate block', async () => {
  seed();
  const row = await prisma.siteSetting.findUniqueOrThrow({ where: { key: 'rates' } });
  await prisma.siteSetting.update({
    where: { key: 'rates' },
    data: { value: { ...(row.value as object), standardRate: 19.25 } },
  });

  await refreshContent();
  assert.equal(PRICING.standardRate, 19.25);
  assert.match(renderBlock('rates', {}, { path: '/hire' }) || '', /£19\.25/);
});

test('a setting that fails validation keeps its default', async () => {
  seed();
  const row = await prisma.siteSetting.findUniqueOrThrow({ where: { key: 'rates' } });
  await prisma.siteSetting.update({
    where: { key: 'rates' },
    data: { value: { ...(row.value as object), standardRate: 5 } },
  });

  await refreshContent();
  assert.equal(siteContent().source, 'database');
  assert.equal(PRICING.standardRate, 18.5);
});

test('an unpublished review drops off the page', async () => {
  seed();
  await prisma.testimonial.updateMany({ data: { published: false } });
  await refreshContent();
  assert.equal(siteContent().testimonials.length, 0);
  assert.equal(renderBlock('testimonials', {}, { path: '/hire' }), '');
});

test("open shifts on /work come from the job board, and only VERGO's own upcoming ones", async () => {
  const role = await prisma.role.upsert({ where: { name: 'Bar staff' }, create: { name: 'Bar staff' }, update: {} });
  const tomorrow = new Date(Date.now() + 24 * 3600_000);
  const base = { description: 'x', location: 'Shoreditch', roleId: role.id, eventDate: tomorrow, payRate: 13.5 };
  await prisma.job.create({ data: { ...base, title: 'Open', status: 'OPEN', type: 'INTERNAL' } });
  await prisma.job.create({ data: { ...base, title: 'Draft', status: 'DRAFT', type: 'INTERNAL', location: 'Draftville' } });
  await prisma.job.create({ data: { ...base, title: 'Someone else', status: 'OPEN', type: 'EXTERNAL', location: 'Elsewhere' } });
  await prisma.job.create({ data: { ...base, title: 'Past', status: 'OPEN', type: 'INTERNAL', location: 'Yesterdayton', eventDate: new Date(Date.now() - 3 * 24 * 3600_000) } });

  await refreshContent();
  const html = renderView('work', { path: '/work' });
  assert.match(html, /<strong>Bar staff<\/strong>: [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2,3}, Shoreditch, £13\.50\/hr\./);
  assert.doesNotMatch(html, /Draftville|Elsewhere|Yesterdayton/);
  assert.doesNotMatch(html, /No open shifts right now/);

  await prisma.job.deleteMany({});
  await refreshContent();
  assert.match(renderView('work', { path: '/work' }), /No open shifts right now/);
});

test("editing a page's FAQ moves that page's lastmod in the sitemap, and only that page's", async () => {
  seed();
  // Back-date everything the seed wrote, as if it was imported long ago.
  const old = new Date('2026-01-01T12:00:00Z');
  for (const table of ['SiteSetting', 'Testimonial', 'RecentWork', 'GalleryPhoto', 'Faq', 'SeasonalPromo']) {
    await prisma.$executeRawUnsafe(`UPDATE "${table}" SET "updatedAt" = $1`, old);
  }
  const faq = await prisma.faq.findFirstOrThrow({ where: { pageKey: 'hire/weddings' } });
  await prisma.faq.update({ where: { id: faq.id }, data: { answer: faq.answer + ' ' } });

  await refreshContent();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { sitemapXml, PAGES } = require('../site/sitemap');
  const xml: string = sitemapXml();
  const lastmod = (p: string) => {
    const at = xml.indexOf(`<loc>https://vergoltd.com${p}</loc>`);
    return at < 0 ? undefined : /<lastmod>([^<]+)<\/lastmod>/.exec(xml.slice(at))?.[1];
  };
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(lastmod('/hire/weddings'), today);
  // Untouched pages keep the date in the sitemap config, which
  // tools/sitemap-lastmod.mjs rewrites, so read it rather than hard-code it.
  const configured = PAGES.find((p: { path: string }) => p.path === '/hire/bar-staff').lastmod;
  assert.equal(lastmod('/hire/bar-staff'), configured);
});
