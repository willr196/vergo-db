#!/usr/bin/env node
/**
 * Visual check for a page moved to a template: screenshots the page as it
 * was (its old HTML from git, rendered by the current server code) and as it
 * is now, at 375px and 1280px, and reports the share of pixels that differ.
 *
 *   node tools/screenshot-diff.mjs <base url> <page> [<git rev of the old html>]
 *   node tools/screenshot-diff.mjs http://localhost:4320 terms
 *
 * The server at <base url> must be this checkout (npm run build && PORT=4320
 * node dist/src/index.js). The old HTML is written for the length of the run
 * to public/__before/<page>.html, which the server renders like any other
 * page, then removed. Screenshots go to tools/screenshots/compare/.
 * Exits 1 if either width differs by 1% or more.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(path.resolve('apps/api/package.json'));
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');

const [base, page, rev = 'HEAD'] = process.argv.slice(2);
if (!base || !page) {
  console.error('usage: node tools/screenshot-diff.mjs <base url> <page> [<git rev>]');
  process.exit(2);
}

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.resolve('tools/screenshots/compare');
const PROFILE = path.resolve('tools/screenshots/.chrome-profile');
const BEFORE_DIR = path.resolve('apps/api/public/__before');
const HEIGHT = 12000;

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.dirname(path.join(BEFORE_DIR, page)), { recursive: true });

// Rendered here as if it were still at /<page>, so the header, the current
// nav item and the seasonal banner match that page, not /__before/<page>.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
const publicDir = path.resolve('apps/api/public');
process.chdir('apps/api'); // the renderer finds views/ and public/ from the working directory
const { renderPublicSource } = require('./dist/src/lib/publicHtml');
const oldSource = execFileSync('git', ['show', `${rev}:apps/api/public/${page}.html`], { encoding: 'utf8' });
const oldHtml = renderPublicSource(oldSource, path.join(publicDir, `${page}.html`), publicDir);
const beforeFile = path.join(BEFORE_DIR, `${page}.html`);
fs.writeFileSync(beforeFile, oldHtml);

function shoot(url, width, file) {
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--window-size=${width},${HEIGHT}`, `--user-data-dir=${PROFILE}`,
    '--virtual-time-budget=3000', `--screenshot=${file}`, url,
  ], { stdio: 'ignore' });
  return PNG.sync.read(fs.readFileSync(file));
}

/** Rows below the page's end are background in both; trim to the taller page. */
function contentHeight(png) {
  const { width, height, data } = png;
  const bg = data.slice((height - 1) * width * 4, (height - 1) * width * 4 + 4);
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x += 4) {
      const i = (y * width + x) * 4;
      if (data[i] !== bg[0] || data[i + 1] !== bg[1] || data[i + 2] !== bg[2]) return y + 1;
    }
  }
  return 1;
}

let failed = false;
try {
  for (const width of [375, 1280]) {
    const slug = page.replace(/\//g, '_');
    const a = shoot(`${base}/__before/${page}?cookie=0`, width, path.join(OUT, `${slug}-${width}-before.png`));
    const b = shoot(`${base}/${page === 'index' ? '' : page}?cookie=0`, width, path.join(OUT, `${slug}-${width}-after.png`));
    const w = Math.min(a.width, b.width);
    const h = Math.max(contentHeight(a), contentHeight(b));
    const crop = (png) => {
      const out = new PNG({ width: w, height: h });
      PNG.bitblt(png, out, 0, 0, w, Math.min(h, png.height), 0, 0);
      return out;
    };
    const ca = crop(a), cb = crop(b);
    const diff = new PNG({ width: w, height: h });
    const changed = pixelmatch(ca.data, cb.data, diff.data, w, h, { threshold: 0.1 });
    fs.writeFileSync(path.join(OUT, `${slug}-${width}-diff.png`), PNG.sync.write(diff));
    const pct = (changed / (w * h)) * 100;
    if (pct >= 1) failed = true;
    console.log(`${page} @${width}px: ${pct.toFixed(3)}% of pixels differ (${h}px tall)`);
  }
} finally {
  fs.rmSync(BEFORE_DIR, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
