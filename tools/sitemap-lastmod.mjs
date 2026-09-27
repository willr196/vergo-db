#!/usr/bin/env node
/**
 * Sets each page's lastmod in apps/api/src/site/sitemap.ts (the PAGES list)
 * to the date the page's source last changed: its last git commit, or today
 * if it has uncommitted changes. A page's source is its template,
 * apps/api/views/pages/<page>.eta, or its HTML file in apps/api/public/ if it
 * hasn't moved yet. Run it before committing page edits:
 *
 *   node tools/sitemap-lastmod.mjs
 *
 * The sitemap itself is built on request (GET /sitemap.xml), which also moves
 * a page's date forward when its content changes in the database. Blog posts
 * are dated by their own dateModified, so they aren't listed here.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.join(repo, 'apps', 'api');
const sitemapTs = path.join(apiDir, 'src', 'site', 'sitemap.ts');
const today = new Date().toISOString().slice(0, 10);

function git(args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

function sourceFor(pagePath) {
  const page = pagePath === '/' ? 'index' : pagePath.slice(1);
  const template = path.join(apiDir, 'views', 'pages', `${page}.eta`);
  return fs.existsSync(template) ? template : path.join(apiDir, 'public', `${page}.html`);
}

function lastChanged(file) {
  const rel = path.relative(repo, file).split(path.sep).join('/');
  if (git(['status', '--porcelain', '--', rel])) return today;
  return git(['log', '-1', '--format=%cs', '--', rel]) || today;
}

const source = fs.readFileSync(sitemapTs, 'utf8');
const start = source.indexOf('// PAGES:START');
const end = source.indexOf('// PAGES:END');
if (start < 0 || end < 0) throw new Error('PAGES:START / PAGES:END markers not found in sitemap.ts');

let changed = 0;
const block = source.slice(start, end).replace(/\{ path: '([^']+)', lastmod: '([^']+)'/g, (match, pagePath, old) => {
  const date = lastChanged(sourceFor(pagePath));
  if (date === old) return match;
  changed += 1;
  return `{ path: '${pagePath}', lastmod: '${date}'`;
});

fs.writeFileSync(sitemapTs, source.slice(0, start) + block + source.slice(end));
console.log(`sitemap.ts: ${changed} lastmod date(s) updated`);
