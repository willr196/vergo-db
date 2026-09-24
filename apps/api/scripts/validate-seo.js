#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const SITE_ORIGIN = 'https://vergoltd.com';

const publicRoot = path.join(process.cwd(), 'public');
const sitemapPath = path.join(publicRoot, 'sitemap.xml');

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function walkDir(dir) {
  /** @type {string[]} */
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...walkDir(abs));
      continue;
    }
    if (ent.isFile()) out.push(abs);
  }
  return out;
}

function cleanRouteFromRelHtml(relPosix) {
  if (!relPosix.endsWith('.html')) throw new Error(`Expected .html file, got: ${relPosix}`);

  if (relPosix === 'index.html') return '/';

  if (relPosix.endsWith('/index.html')) {
    const base = relPosix.slice(0, -'/index.html'.length);
    return '/' + base;
  }

  return '/' + relPosix.slice(0, -'.html'.length);
}

const canonicalOverrideByRoute = new Map([
  // Legacy alias page: server redirects /hire-us(.html) -> /hire-staff
  ['/hire-us', '/hire-staff'],
]);

function expectedCanonicalHrefForRoute(cleanRoute) {
  const canonicalRoute = canonicalOverrideByRoute.get(cleanRoute) ?? cleanRoute;
  return SITE_ORIGIN + (canonicalRoute === '/' ? '/' : canonicalRoute);
}

function extractCanonicalHref(html) {
  const linkTags = html.match(/<link\b[^>]*>/gi) || [];
  const canonicalTag = linkTags.find((t) => /\brel\s*=\s*["']canonical["']/i.test(t));
  if (!canonicalTag) return null;
  const m = canonicalTag.match(/\bhref\s*=\s*["']([^"']+)["']/i);
  return m ? m[1] : '';
}

function readSitemapLocs(xml) {
  /** @type {string[]} */
  const locs = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let m;
  while ((m = re.exec(xml))) {
    locs.push(m[1].trim());
  }
  return locs;
}

function normalizePathname(p) {
  if (!p.startsWith('/')) p = '/' + p;
  if (p.length > 1 && p.endsWith('/')) return p.slice(0, -1);
  return p;
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : (s + ' '.repeat(n - s.length));
}

function main() {
  if (!fs.existsSync(publicRoot)) {
    console.error(`ERROR: public root not found: ${publicRoot}`);
    process.exit(2);
  }

  const htmlAbsFiles = walkDir(publicRoot).filter((p) => p.endsWith('.html')).sort();
  const pages = htmlAbsFiles.map((abs) => {
    const rel = toPosix(path.relative(publicRoot, abs));
    const route = cleanRouteFromRelHtml(rel);
    const html = fs.readFileSync(abs, 'utf8');
    const canonicalHref = extractCanonicalHref(html);
    const expectedCanonical = expectedCanonicalHrefForRoute(route);
    const hasCanonical = !!(canonicalHref && canonicalHref.trim());
    const canonicalMatches = hasCanonical && canonicalHref.trim() === expectedCanonical;
    return {
      abs,
      rel,
      route,
      canonicalHref: canonicalHref ? canonicalHref.trim() : null,
      expectedCanonical,
      hasCanonical,
      canonicalMatches,
    };
  });

  const missingCanonical = pages.filter((p) => !p.hasCanonical);
  const canonicalMismatches = pages.filter((p) => p.hasCanonical && !p.canonicalMatches);

  /** @type {Set<string>} */
  const htmlRoutes = new Set(pages.map((p) => p.route));

  /** @type {Set<string>} */
  const sitemapRoutes = new Set();
  /** @type {string[]} */
  const sitemapLocsWithoutHtml = [];

  if (fs.existsSync(sitemapPath)) {
    const sitemapXml = fs.readFileSync(sitemapPath, 'utf8');
    const locs = readSitemapLocs(sitemapXml);
    for (const loc of locs) {
      let pathname = null;
      try {
        const u = new URL(loc);
        pathname = u.pathname;
      } catch {
        pathname = loc.replace(SITE_ORIGIN, '');
      }
      const route = normalizePathname(pathname);
      sitemapRoutes.add(route);
      if (!htmlRoutes.has(route)) sitemapLocsWithoutHtml.push(loc);
    }
  } else {
    console.warn(`WARN: sitemap not found: ${sitemapPath}`);
  }

  const inSitemap = (route) => sitemapRoutes.has(route);

  // Summary table
  const rows = pages.map((p) => ({
    page: p.rel,
    route: p.route,
    canonical: p.hasCanonical ? (p.canonicalMatches ? 'ok' : 'mismatch') : 'missing',
    sitemap: inSitemap(p.route) ? 'yes' : 'no',
  }));

  const pageW = Math.max('page'.length, ...rows.map((r) => r.page.length));
  const routeW = Math.max('clean_route'.length, ...rows.map((r) => r.route.length));

  console.log(`Total HTML pages found: ${pages.length}`);
  console.log('');
  console.log(`${pad('page', pageW)}  ${pad('clean_route', routeW)}  canonical  sitemap`);
  console.log(`${'-'.repeat(pageW)}  ${'-'.repeat(routeW)}  --------  ------`);
  for (const r of rows) {
    console.log(`${pad(r.page, pageW)}  ${pad(r.route, routeW)}  ${pad(r.canonical, 8)}  ${r.sitemap}`);
  }

  console.log('');
  console.log(`Pages missing canonical: ${missingCanonical.length}`);
  for (const p of missingCanonical) console.log(`- ${p.rel}`);

  console.log('');
  console.log(`Pages with canonical mismatch: ${canonicalMismatches.length}`);
  for (const p of canonicalMismatches) {
    console.log(`- ${p.rel}`);
    console.log(`  expected: ${p.expectedCanonical}`);
    console.log(`  found:    ${p.canonicalHref ?? ''}`);
  }

  console.log('');
  console.log(`Sitemap <loc> entries without matching public HTML file: ${sitemapLocsWithoutHtml.length}`);
  for (const loc of sitemapLocsWithoutHtml) console.log(`- ${loc}`);

  const metaProblems = checkPublicMeta(pages, sitemapRoutes);
  console.log('');
  console.log(`Public page metadata problems: ${metaProblems.length}`);
  for (const problem of metaProblems) console.log(`- ${problem}`);

  console.log('');
  console.log('How to run: npm run validate:seo');

  if (missingCanonical.length || canonicalMismatches.length || sitemapLocsWithoutHtml.length || metaProblems.length) {
    process.exitCode = 1;
  }
}

const TITLE_SUFFIX = '| VERGO';
const TITLE_MAX = 60;
const DESCRIPTION_MAX = 155;

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&rsquo;/g, '’')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function metaContent(html, attrName, attrValue) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  const tag = tags.find((t) => new RegExp(`\\b${attrName}\\s*=\\s*["']${attrValue}["']`, 'i').test(t));
  if (!tag) return null;
  const m = tag.match(/\bcontent\s*=\s*"([^"]*)"/i);
  return m ? decodeEntities(m[1]) : '';
}

/**
 * The rules from the SEO brief for every public page: a unique title of 60
 * characters or fewer ending "| VERGO", a unique description of 155 or
 * fewer, og:title/og:description matching them, og:site_name and twitter:card
 * present, and the sitemap holding exactly the indexable pages.
 */
function checkPublicMeta(pages, sitemapRoutes) {
  /** @type {string[]} */
  const problems = [];
  const seenTitles = new Map();
  const seenDescriptions = new Map();

  for (const page of pages) {
    if (/^admin/.test(page.rel)) continue;
    const html = fs.readFileSync(page.abs, 'utf8');
    const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
    const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : '';
    const description = metaContent(html, 'name', 'description') || '';
    const robots = metaContent(html, 'name', 'robots') || '';
    const indexable = !/noindex/i.test(robots);

    if (!title.endsWith(TITLE_SUFFIX)) problems.push(`${page.rel}: title should end "${TITLE_SUFFIX}"`);
    if (title.length > TITLE_MAX) problems.push(`${page.rel}: title is ${title.length} characters (max ${TITLE_MAX})`);
    if (!description) problems.push(`${page.rel}: missing meta description`);
    if (description.length > DESCRIPTION_MAX) {
      problems.push(`${page.rel}: description is ${description.length} characters (max ${DESCRIPTION_MAX})`);
    }
    if (metaContent(html, 'property', 'og:title') !== title) problems.push(`${page.rel}: og:title does not match <title>`);
    if (metaContent(html, 'property', 'og:description') !== description) {
      problems.push(`${page.rel}: og:description does not match the meta description`);
    }
    if (metaContent(html, 'property', 'og:site_name') !== 'VERGO') problems.push(`${page.rel}: missing og:site_name`);
    if (!metaContent(html, 'name', 'twitter:card')) problems.push(`${page.rel}: missing twitter:card`);

    if (title) {
      if (seenTitles.has(title)) problems.push(`${page.rel}: title duplicates ${seenTitles.get(title)}`);
      seenTitles.set(title, page.rel);
    }
    if (description) {
      if (seenDescriptions.has(description)) problems.push(`${page.rel}: description duplicates ${seenDescriptions.get(description)}`);
      seenDescriptions.set(description, page.rel);
    }

    if (!indexable && sitemapRoutes.has(page.route)) problems.push(`${page.rel}: noindex but listed in the sitemap`);
    if (indexable && !sitemapRoutes.has(page.route)) problems.push(`${page.rel}: indexable but missing from the sitemap`);
  }

  return problems;
}

main();
