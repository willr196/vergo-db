#!/usr/bin/env node
/**
 * Sets every <lastmod> in apps/api/public/sitemap.xml to the date the page's
 * HTML file last changed: its last git commit, or today if it has uncommitted
 * changes. Run it before committing page edits:
 *
 *   node tools/sitemap-lastmod.mjs
 *
 * The BLOG block is included: its pages map to files the same way, so the
 * dates agree with what tools/blog/build.js writes.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(repo, 'apps', 'api', 'public');
const sitemapPath = path.join(publicDir, 'sitemap.xml');
const today = new Date().toISOString().slice(0, 10);

function git(args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

function fileFor(loc) {
  const pathname = new URL(loc).pathname.replace(/\/$/, '');
  const rel = pathname === '' ? 'index.html' : `${pathname.slice(1)}.html`;
  return path.join(publicDir, rel);
}

function lastChanged(file) {
  const rel = path.relative(repo, file).split(path.sep).join('/');
  if (git(['status', '--porcelain', '--', rel])) return today;
  return git(['log', '-1', '--format=%cs', '--', rel]) || today;
}

let xml = fs.readFileSync(sitemapPath, 'utf8');
let changed = 0;
xml = xml.replace(/(<loc>([^<]+)<\/loc>\s*<lastmod>)([^<]+)(<\/lastmod>)/g, (match, head, loc, old, tail) => {
  const file = fileFor(loc.trim());
  if (!fs.existsSync(file)) {
    console.warn(`no file for ${loc}`);
    return match;
  }
  const date = lastChanged(file);
  if (date !== old) changed += 1;
  return `${head}${date}${tail}`;
});
fs.writeFileSync(sitemapPath, xml);
console.log(`sitemap.xml: ${changed} lastmod date(s) updated`);
