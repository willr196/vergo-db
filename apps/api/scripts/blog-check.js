#!/usr/bin/env node
'use strict';

/**
 * Lints every post in apps/api/content/blog/, drafts included, and says what
 * would stop one being served. Nothing is built: the server renders the blog
 * from the markdown on request (src/site/blog/).
 *
 *   npm run blog:check          (from the repo root)
 *
 * To preview a draft, run the API locally (npm run dev in apps/api) and open
 * /blog/<slug>: drafts show on a development server, as noindex, and never in
 * production or the sitemap. See docs/VERGO-BLOG-SYSTEM.md for the rules.
 */

const fs = require('fs');
const path = require('path');
const { loadPost, splitFrontmatter } = require('../src/site/blog/post');
const { lintPost } = require('../src/site/blog/lint');

const dir = path.join(__dirname, '..', 'content', 'blog');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('_') && f !== 'README.md').sort();

let failed = 0;
let warnings = 0;
const slugs = new Map();
for (const name of files) {
  const raw = fs.readFileSync(path.join(dir, name), 'utf8');
  let post;
  try {
    post = loadPost(name, raw);
  } catch (err) {
    failed += 1;
    console.log(`${name}\n  error  ${err.message}`);
    continue;
  }
  const { errors, warnings: warns } = lintPost(post, splitFrontmatter(raw, name).body);
  if (slugs.has(post.slug)) errors.push(`duplicate slug "${post.slug}" (also ${slugs.get(post.slug)})`);
  slugs.set(post.slug, name);
  if (errors.length || warns.length) console.log(name);
  errors.forEach((e) => console.log(`  error  ${e}`));
  warns.forEach((w) => console.log(`  warn   ${w}`));
  warnings += warns.length;
  if (errors.length) failed += 1;
  else console.log(`- ${post.route}  ${post.wordCount} words  ${post.draft ? '[draft] ' : ''}${post.published}`);
}

console.log(`\nChecked ${files.length} post(s). ${warnings} warning(s). ${failed} with errors.`);
if (failed) {
  console.log('A post with errors is not served. Fix it before deploying.');
  process.exit(1);
}
