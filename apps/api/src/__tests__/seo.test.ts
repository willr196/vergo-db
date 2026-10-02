import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

/**
 * The on-page SEO rules, checked against every page the sitemap lists, as
 * served: titles, descriptions, canonicals, Open Graph, one H1, structured
 * data that parses, a breadcrumb trail below the homepage, and internal links
 * that land. `npm run validate:seo` runs this file on its own.
 */

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/vergo_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || '0123456789abcdef0123456789abcdef';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fedcba9876543210fedcba9876543210';
process.env.WEB_ORIGIN = process.env.WEB_ORIGIN || 'http://localhost:8080';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { default: app } = require('../index');

const ORIGIN = 'https://vergoltd.com';
const SUFFIX = '| VERGO Staffing';
const NOINDEX_PAGES = ['/hire/quote', '/work/apply'];

function decode(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function attr(html: string, tagPattern: RegExp): string | null {
  const tag = html.match(tagPattern);
  if (!tag) return null;
  const content = tag[0].match(/\b(?:content|href)="([^"]*)"/);
  return content ? decode(content[1]) : null;
}

const meta = (html: string, key: string) => attr(html, new RegExp(`<meta (?:name|property)="${key}"[^>]*>`));

let base = '';
let server: http.Server;
const pages = new Map<string, string>();

test.before(async () => {
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
  for (const m of sitemap.matchAll(/<loc>https:\/\/vergoltd\.com([^<]*)<\/loc>/g)) {
    const res = await fetch(base + m[1], { redirect: 'manual' });
    assert.equal(res.status, 200, `${m[1]} is in the sitemap, so it must serve 200`);
    pages.set(m[1], await res.text());
  }
});

test.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

test('the sitemap lists the indexable pages and none of the noindex ones', () => {
  assert.ok(pages.size >= 15, `only ${pages.size} pages in the sitemap`);
  for (const p of NOINDEX_PAGES) assert.ok(!pages.has(p), `${p} is noindex and must stay out of the sitemap`);
  for (const [p, html] of pages) assert.ok(!/noindex/.test(meta(html, 'robots') || ''), `${p} is in the sitemap but noindex`);
});

test('every page has a unique title of 60 characters or fewer, ending "| VERGO Staffing"', () => {
  const seen = new Map<string, string>();
  for (const [p, html] of pages) {
    const title = decode((html.match(/<title>([^<]*)<\/title>/) || [])[1] || '');
    assert.ok(title.endsWith(SUFFIX), `${p}: title "${title}" should end "${SUFFIX}"`);
    assert.ok(title.length <= 60, `${p}: title is ${title.length} characters`);
    assert.ok(!seen.has(title), `${p}: title duplicates ${seen.get(title)}`);
    seen.set(title, p);
    assert.equal(meta(html, 'og:title'), title, `${p}: og:title should match the title`);
  }
});

test('every page has a unique description of 70 to 155 characters', () => {
  const seen = new Map<string, string>();
  for (const [p, html] of pages) {
    const description = meta(html, 'description') || '';
    assert.ok(description.length >= 70 || ['/terms', '/legal'].includes(p), `${p}: description is only ${description.length} characters`);
    assert.ok(description.length <= 155, `${p}: description is ${description.length} characters`);
    assert.ok(!seen.has(description), `${p}: description duplicates ${seen.get(description)}`);
    seen.set(description, p);
    assert.equal(meta(html, 'og:description'), description, `${p}: og:description should match the description`);
  }
});

test('every page is canonical to itself on vergoltd.com, in British English', () => {
  for (const [p, html] of pages) {
    assert.equal(attr(html, /<link rel="canonical"[^>]*>/), ORIGIN + p, `${p}: canonical`);
    assert.equal(meta(html, 'og:url'), ORIGIN + p, `${p}: og:url`);
    assert.match(html, /<html lang="en-GB">/, `${p}: html lang`);
  }
});

test('every page has exactly one H1', () => {
  for (const [p, html] of pages) {
    assert.equal((html.match(/<h1\b/g) || []).length, 1, `${p}: H1 count`);
  }
});

test('every share image exists and every content image has alt text', () => {
  const publicDir = path.join(process.cwd(), 'public');
  for (const [p, html] of pages) {
    const image = meta(html, 'og:image') || '';
    assert.ok(image.startsWith(`${ORIGIN}/images/`), `${p}: og:image ${image}`);
    assert.ok(fs.existsSync(path.join(publicDir, image.slice(ORIGIN.length))), `${p}: ${image} is not on disk`);
    assert.ok(meta(html, 'twitter:card'), `${p}: twitter:card`);
    for (const img of html.match(/<img\b[^>]*>/g) || []) assert.match(img, /\balt="/, `${p}: <img> without alt: ${img.slice(0, 80)}`);
  }
});

test('structured data parses, and every page below the homepage has a breadcrumb trail', () => {
  for (const [p, html] of pages) {
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => {
      try {
        return JSON.parse(m[1]);
      } catch {
        assert.fail(`${p}: JSON-LD does not parse`);
      }
    });
    if (p === '/') {
      assert.ok(blocks.some((b) => b['@id'] === `${ORIGIN}/#organization`), 'homepage carries the organisation');
      continue;
    }
    const trail = blocks.find((b) => b['@type'] === 'BreadcrumbList');
    assert.ok(trail, `${p}: no BreadcrumbList`);
    const items = trail.itemListElement;
    assert.equal(items[0].item, `${ORIGIN}/`, `${p}: breadcrumb starts at Home`);
    assert.equal(items[items.length - 1].item, ORIGIN + p, `${p}: breadcrumb ends on the page`);
  }
});

test('every internal link on every page lands', async () => {
  const checked = new Map<string, number>();
  for (const [p, html] of pages) {
    for (const m of html.matchAll(/<a\b[^>]*\bhref="(\/[^"#?]*)/g)) {
      const href = m[1];
      if (!checked.has(href)) {
        const res = await fetch(base + href, { redirect: 'manual' });
        await res.arrayBuffer();
        checked.set(href, res.status);
      }
      assert.ok([200, 301].includes(checked.get(href)!), `${p} links to ${href}, which answers ${checked.get(href)}`);
    }
  }
});
