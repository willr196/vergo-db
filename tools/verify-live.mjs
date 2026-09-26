#!/usr/bin/env node
/**
 * Checks that vergoltd.com and the Fly origin serve the same pages.
 *
 * Fetches every URL in the live sitemap from both hosts, cuts each response
 * down to its <main> element, replaces the host names so absolute links match,
 * and reports any page whose content differs. Run it after every deploy:
 *
 *   node tools/verify-live.mjs
 *
 * Exits 1 if any page differs or fails to load, so it can gate a script.
 * VERIFY_PUBLIC and VERIFY_ORIGIN override the two base URLs.
 */

const PUBLIC = (process.env.VERIFY_PUBLIC || 'https://vergoltd.com').replace(/\/$/, '');
const ORIGIN = (process.env.VERIFY_ORIGIN || 'https://vergo-app.fly.dev').replace(/\/$/, '');

function hostOf(base) {
  return new URL(base).host;
}

async function fetchText(url) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

function mainContent(html) {
  const match = html.match(/<main\b[\s\S]*?<\/main>/i);
  const body = match ? match[0] : html;
  return body
    .split(hostOf(PUBLIC)).join('HOST')
    .split(hostOf(ORIGIN)).join('HOST')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstDifference(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  const from = Math.max(0, i - 60);
  return {
    public: a.slice(from, i + 80),
    origin: b.slice(from, i + 80),
  };
}

async function main() {
  const sitemap = await fetchText(`${PUBLIC}/sitemap.xml`);
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1].trim()).pathname);
  if (!urls.length) throw new Error('No <loc> entries in the sitemap');

  let failures = 0;
  for (const pathname of urls) {
    try {
      const [live, origin] = await Promise.all([
        fetchText(PUBLIC + pathname),
        fetchText(ORIGIN + pathname),
      ]);
      const a = mainContent(live);
      const b = mainContent(origin);
      if (a === b) {
        console.log(`ok    ${pathname}`);
      } else {
        failures += 1;
        const diff = firstDifference(a, b);
        console.log(`DIFF  ${pathname}`);
        console.log(`      ${hostOf(PUBLIC)}: …${diff.public}…`);
        console.log(`      ${hostOf(ORIGIN)}: …${diff.origin}…`);
      }
    } catch (err) {
      failures += 1;
      console.log(`FAIL  ${pathname}: ${err.message}`);
    }
  }

  console.log(`\n${urls.length - failures}/${urls.length} pages match between ${hostOf(PUBLIC)} and ${hostOf(ORIGIN)}.`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
