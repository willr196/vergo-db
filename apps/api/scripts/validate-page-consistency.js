#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const publicRoot = path.join(process.cwd(), 'public');

const legacyAliasRedirects = new Map([
  ['js/client-login.html', '/client-login'],
  ['js/client-register.html', '/client-register'],
]);

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function walkDir(dir) {
  /** @type {string[]} */
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkDir(abs));
      continue;
    }
    if (entry.isFile() && abs.endsWith('.html')) out.push(abs);
  }
  return out;
}

function hasTitle(html) {
  const match = html.match(/<title>([^<]+)<\/title>/i);
  return Boolean(match && match[1].trim());
}

function hasThemeColor(html) {
  return /<meta\b[^>]*name=["']theme-color["'][^>]*content=["'][^"']+["'][^>]*>/i.test(html);
}

function hasCanonical(html) {
  return /<link\b[^>]*rel=["']canonical["'][^>]*href=["'][^"']+["'][^>]*>/i.test(html);
}

function hasPublicShell(html) {
  return /<script\b[^>]*src=["']\/vergo-public-shell\.js["'][^>]*><\/script>/i.test(html);
}

function hasHeaderShellMount(html) {
  return /id=["']site-header["']/i.test(html);
}

function hasFooterShellMount(html) {
  return /<footer\b[^>]*role=["']contentinfo["'][^>]*>/i.test(html);
}

function hasSkipLink(html) {
  return /<a\b[^>]*href=["']#main-content["'][^>]*class=["'][^"']*\bskip-link\b[^"']*["'][^>]*>/i.test(html)
    || /<a\b[^>]*class=["'][^"']*\bskip-link\b[^"']*["'][^>]*href=["']#main-content["'][^>]*>/i.test(html);
}

function hasMainTarget(html) {
  return /id=["']main-content["']/i.test(html);
}

function hasAdminSharedCss(html) {
  return /<link\b[^>]*href=["']\/pages\/css\/admin-shared\.css["'][^>]*>/i.test(html);
}

function hasAdminCore(html) {
  return /<script\b[^>]*src=["']\/js\/admin-core\.js["'][^>]*><\/script>/i.test(html);
}

function hasAdminNav(html) {
  return /<script\b[^>]*src=["']\/js\/admin-nav\.js["'][^>]*><\/script>/i.test(html);
}

function hasNoindexRobots(html) {
  return /<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex[^"']*["'][^>]*>/i.test(html);
}

function isAdminPage(rel) {
  return /^admin[^/]*\.html$/i.test(rel);
}

function isLegacyAlias(rel) {
  return legacyAliasRedirects.has(rel);
}

function validatePublicPage(rel, html) {
  /** @type {string[]} */
  const issues = [];

  if (!hasTitle(html)) issues.push('missing non-empty <title>');
  if (!hasThemeColor(html)) issues.push('missing theme-color meta');
  if (!hasCanonical(html)) issues.push('missing canonical link');
  if (!hasHeaderShellMount(html)) issues.push('missing #site-header shell mount');
  if (!hasFooterShellMount(html)) issues.push('missing footer[role="contentinfo"] shell mount');
  if (!hasPublicShell(html)) issues.push('missing /vergo-public-shell.js');
  if (!hasSkipLink(html)) issues.push('missing skip link to #main-content');
  if (!hasMainTarget(html)) issues.push('missing #main-content target');

  return issues;
}

function validateAdminPage(rel, html) {
  /** @type {string[]} */
  const issues = [];

  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';

  if (!title) issues.push('missing non-empty <title>');
  if (title && !/VERGO Admin$/i.test(title)) issues.push('title should end with "VERGO Admin"');
  if (!hasNoindexRobots(html)) issues.push('missing noindex robots meta');
  if (!hasAdminSharedCss(html)) issues.push('missing /pages/css/admin-shared.css');
  if (!hasAdminCore(html)) issues.push('missing /js/admin-core.js');
  if (!hasAdminNav(html)) issues.push('missing /js/admin-nav.js');

  return issues;
}

function main() {
  if (!fs.existsSync(publicRoot)) {
    console.error(`ERROR: public root not found: ${publicRoot}`);
    process.exit(2);
  }

  const htmlFiles = walkDir(publicRoot)
    .map((abs) => ({
      abs,
      rel: toPosix(path.relative(publicRoot, abs)),
      html: fs.readFileSync(abs, 'utf8'),
    }))
    .sort((a, b) => a.rel.localeCompare(b.rel));

  /** @type {{ rel: string, kind: string, issues: string[] }[]} */
  const failures = [];
  let publicCount = 0;
  let adminCount = 0;
  let ignoredCount = 0;

  for (const file of htmlFiles) {
    if (isLegacyAlias(file.rel)) {
      ignoredCount += 1;
      continue;
    }

    if (isAdminPage(file.rel)) {
      adminCount += 1;
      const issues = validateAdminPage(file.rel, file.html);
      if (issues.length) failures.push({ rel: file.rel, kind: 'admin', issues });
      continue;
    }

    publicCount += 1;
    const issues = validatePublicPage(file.rel, file.html);
    if (issues.length) failures.push({ rel: file.rel, kind: 'public', issues });
  }

  console.log(`Total HTML files found: ${htmlFiles.length}`);
  console.log(`Public pages checked: ${publicCount}`);
  console.log(`Admin pages checked: ${adminCount}`);
  console.log(`Ignored legacy alias pages: ${ignoredCount}`);
  for (const [rel, target] of legacyAliasRedirects.entries()) {
    console.log(`- ${rel} -> ${target}`);
  }

  console.log('');
  if (!failures.length) {
    console.log('All checked pages passed consistency validation.');
    console.log('How to run: npm run validate:pages');
    return;
  }

  console.log(`Pages with consistency issues: ${failures.length}`);
  for (const failure of failures) {
    console.log(`- ${failure.rel} [${failure.kind}]`);
    for (const issue of failure.issues) {
      console.log(`  - ${issue}`);
    }
  }

  console.log('');
  console.log('How to run: npm run validate:pages');
  process.exitCode = 1;
}

main();
