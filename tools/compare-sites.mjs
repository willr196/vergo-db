#!/usr/bin/env node
/**
 * Compares two copies of the public site, URL by URL: what a visitor and a
 * search engine see. Use it before a deploy (main against a branch, both run
 * locally) and after one (vergoltd.com against the Fly origin).
 *
 *   node tools/compare-sites.mjs <base A> <base B>
 *   node tools/compare-sites.mjs http://127.0.0.1:4321 http://127.0.0.1:4320
 *
 * URLs: every <loc> in either sitemap, each one's old .html address, the
 * legacy redirects in apps/api/src/index.ts, and a missing page. For each it
 * compares the status and redirect target, then, for pages, the title, meta
 * description and robots, canonical, Open Graph and Twitter tags, the JSON-LD,
 * the h1 to h3 headings and the visible text of <main>. Host names and ?v=
 * asset hashes are ignored.
 *
 * COMPARE_DELAY_MS waits between URLs, for a server with a rate limit
 * (the API allows 120 requests a minute per address).
 *
 * Exits 1 if anything differs or fails to load.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [A, B] = process.argv.slice(2).map((u) => u && u.replace(/\/$/, ''));
if (!A || !B) {
  console.error('Usage: node tools/compare-sites.mjs <base A> <base B>');
  process.exit(2);
}

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function legacyPaths() {
  const src = fs.readFileSync(path.join(root, 'apps', 'api', 'src', 'index.ts'), 'utf8');
  const block = src.slice(src.indexOf('LEGACY_REDIRECTS'), src.indexOf('};', src.indexOf('LEGACY_REDIRECTS')));
  return [...block.matchAll(/'(\/[^']*)':\s*'/g)].map((m) => m[1]);
}

async function sitemapPaths(base) {
  const res = await fetch(`${base}/sitemap.xml`);
  if (!res.ok) throw new Error(`${base}/sitemap.xml: ${res.status}`);
  return [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
}

const decode = (s) => s
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&pound;/g, '£');
const textOf = (html) => decode(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}

/** The parts of a page that matter, as comparable strings. */
function extract(html, base) {
  const host = new URL(base).host;
  const clean = html.split(host).join('HOST').replace(/\?v=[0-9a-f]+/g, '');
  const attr = (re) => [...clean.matchAll(re)].map((m) => decode(m[1])).join(' | ');
  const main = /<main\b[\s\S]*?<\/main>/i.exec(clean);
  return {
    title: attr(/<title>([\s\S]*?)<\/title>/gi),
    description: attr(/<meta\s+name="description"\s+content="([^"]*)"/gi),
    robots: attr(/<meta\s+name="robots"\s+content="([^"]*)"/gi),
    canonical: attr(/<link\s+rel="canonical"\s+href="([^"]*)"/gi),
    og: [...clean.matchAll(/<meta\s+property="(og:[^"]+)"\s+content="([^"]*)"/gi)].map((m) => `${m[1]}=${decode(m[2])}`).join(' | '),
    twitter: [...clean.matchAll(/<meta\s+name="(twitter:[^"]+)"\s+content="([^"]*)"/gi)].map((m) => `${m[1]}=${decode(m[2])}`).join(' | '),
    jsonLd: [...clean.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)]
      .map((m) => { try { return JSON.stringify(sortKeys(JSON.parse(m[1]))); } catch { return 'UNPARSEABLE'; } }).join('\n'),
    headings: [...clean.matchAll(/<(h[1-3])\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => `${m[1]}: ${textOf(m[2])}`).join(' | '),
    text: main ? textOf(main[0]) : 'NO <main>',
  };
}

async function get(base, p) {
  const res = await fetch(base + p, { redirect: 'manual' });
  const location = res.headers.get('location');
  const out = { status: res.status, location: location ? location.replace(/^https?:\/\/[^/]+/, '') : '' };
  if (res.status === 200 && /html/.test(res.headers.get('content-type') || '')) out.page = extract(await res.text(), base);
  return out;
}

/** Where two strings first part, with a little context either side. */
function firstDifference(a, b) {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  const at = Math.max(0, i - 60);
  return `\n      A: …${a.slice(at, i + 80)}…\n      B: …${b.slice(at, i + 80)}…`;
}

const sitemap = [...new Set([...(await sitemapPaths(A)), ...(await sitemapPaths(B))])].sort();
const paths = [...new Set([
  ...sitemap,
  ...sitemap.filter((p) => p !== '/').map((p) => `${p}.html`),
  '/index.html', '/index', '/hire/', '/sitemap.xml', '/robots.txt',
  ...legacyPaths(),
  '/no-such-page-for-the-comparison',
])];

const DELAY = Number(process.env.COMPARE_DELAY_MS || 0);
let differing = 0;
for (const p of paths) {
  if (DELAY) await new Promise((r) => setTimeout(r, DELAY));
  let a, b;
  try {
    [a, b] = await Promise.all([get(A, p), get(B, p)]);
  } catch (err) {
    differing++;
    console.log(`FAIL ${p}: ${err.message}`);
    continue;
  }
  const problems = [];
  if (a.status !== b.status) problems.push(`status ${a.status} vs ${b.status}`);
  if (a.location !== b.location) problems.push(`redirect ${a.location || '-'} vs ${b.location || '-'}`);
  if (a.page && b.page) {
    for (const key of Object.keys(a.page)) {
      if (a.page[key] !== b.page[key]) problems.push(`${key} differs:${firstDifference(a.page[key], b.page[key])}`);
    }
  }
  if (problems.length) {
    differing++;
    console.log(`DIFF ${p}\n    ${problems.join('\n    ')}`);
  } else {
    console.log(`same ${p} (${a.status}${a.location ? ' -> ' + a.location : ''})`);
  }
}
console.log(`\n${paths.length} URLs, ${differing} differing. A = ${A}, B = ${B}`);
process.exit(differing ? 1 : 0);
