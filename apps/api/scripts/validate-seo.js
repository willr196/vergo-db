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

  console.log('');
  console.log('How to run: npm run validate:seo');

  if (missingCanonical.length || canonicalMismatches.length || sitemapLocsWithoutHtml.length) {
    process.exitCode = 1;
  }
}

main();
