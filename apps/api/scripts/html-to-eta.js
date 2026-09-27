#!/usr/bin/env node
'use strict';

/**
 * Moves one public page from public/<page>.html to views/pages/<page>.eta,
 * word for word. Used for Phase 3 of the dynamic-site move; delete it once
 * every page has moved.
 *
 *   node scripts/html-to-eta.js hire/weddings
 *
 * What it does:
 *   - <head>: title, description, OG image, canonical, robots, page stylesheets
 *     and JSON-LD become the layout() data. JSON-LD becomes plain objects, with
 *     {{TOKENS}} turned into it.t.* so prices and contact details stay live.
 *     An FAQPage block is replaced by it.faqJsonLd(page), built from the FAQs
 *     in the database, so the structured data can't disagree with the page.
 *   - <body class>, the <!--#header ...--> attributes and the scripts after the
 *     footer become layout data too.
 *   - <main>: <!--#block attr="..."--> markers become it.blocks.*() calls,
 *     {{TOKENS}} become it.t.*, and a run of <details class="faq"> becomes the
 *     faq partial reading it.faqs(page).
 *
 * It writes the .eta and prints what it found; it doesn't delete the .html or
 * register the route. Those are separate, checked steps.
 */

const fs = require('node:fs');
const path = require('node:path');

const page = process.argv[2];
if (!page) {
  console.error('usage: node scripts/html-to-eta.js <page, e.g. hire/weddings>');
  process.exit(1);
}

const API_DIR = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(API_DIR, 'public', `${page}.html`), 'utf8');
const ORIGIN = 'https://vergoltd.com';

function decodeEntities(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&pound;/g, '£')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** A JS string expression for text that may carry {{TOKENS}}. */
function jsString(text) {
  if (!/\{\{[A-Z0-9_]+\}\}/.test(text)) return JSON.stringify(text);
  const body = text
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')
    .replace(/\{\{([A-Z0-9_]+)\}\}/g, '${it.t.$1}');
  return '`' + body + '`';
}

function indent(text, pad) {
  return text.split('\n').map((l) => (l ? pad + l : l)).join('\n');
}

/** A JSON value as JS source, strings through jsString. */
function toJs(value, pad = '') {
  const inner = pad + '  ';
  if (typeof value === 'string') {
    const num = /^\u0000NUM:([A-Z0-9_]+)\u0000$/.exec(value);
    return num ? `Number(it.t.${num[1]})` : jsString(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return '[\n' + value.map((v) => inner + toJs(v, inner)).join(',\n') + '\n' + pad + ']';
  }
  const entries = Object.entries(value);
  if (!entries.length) return '{}';
  return '{\n' + entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${toJs(v, inner)}`).join(',\n') + '\n' + pad + '}';
}

function attr(tag, name) {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? m[1] : undefined;
}

const head = /<head>([\s\S]*?)<\/head>/.exec(src)[1];
const found = [];

const meta = {};
meta.title = decodeEntities(/<title>([\s\S]*?)<\/title>/.exec(head)[1].trim());
const metaTag = (sel) => {
  const m = new RegExp(`<meta ${sel} content="([^"]*)">`).exec(head);
  return m ? decodeEntities(m[1]) : undefined;
};
meta.description = metaTag('name="description"');
const ogTitle = metaTag('property="og:title"');
const ogDescription = metaTag('property="og:description"');
if (ogTitle && ogTitle !== meta.title) meta.ogTitle = ogTitle;
if (ogDescription && ogDescription !== meta.description) meta.ogDescription = ogDescription;
const ogImage = metaTag('property="og:image"');
if (ogImage) meta.ogImage = ogImage.replace(ORIGIN, '');
const ogType = metaTag('property="og:type"');
if (ogType && ogType !== 'website') meta.ogType = ogType;
const robots = metaTag('name="robots"');
if (robots) meta.robots = robots;
const canonical = /<link rel="canonical" href="([^"]*)">/.exec(head);
meta.canonical = canonical ? canonical[1].replace(ORIGIN, '') || '/' : '/' + page;

const styles = [...head.matchAll(/<link rel="stylesheet" href="([^"]*)">/g)].map((m) => m[1]);

const pageKey = page;
const jsonLd = [...src.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => {
  const raw = m[1].replace(/(:\s*)\{\{([A-Z0-9_]+)\}\}/g, '$1"\\u0000NUM:$2\\u0000"');
  const data = JSON.parse(raw);
  if (data['@type'] === 'FAQPage') {
    found.push(`FAQPage JSON-LD (${data.mainEntity.length} questions) -> it.faqJsonLd('${pageKey}')`);
    return `it.faqJsonLd(${JSON.stringify(pageKey)})`;
  }
  return toJs(data, '    ');
});
const inBodyLd = /<body[\s\S]*<script type="application\/ld\+json">/.test(src);
if (inBodyLd) found.push('WARNING: JSON-LD inside <body> was moved to <head>');

const bodyTag = /<body[^>]*>/.exec(src)[0];
const bodyClass = attr(bodyTag, 'class');

const headerMarker = /<!--#header((?:\s+[\w-]+="[^"]*")*)\s*-->/.exec(src);
const header = {};
if (headerMarker) for (const m of headerMarker[1].matchAll(/([\w-]+)="([^"]*)"/g)) header[m[1]] = m[2];

const afterFooter = src.slice(src.indexOf('<!--#footer-->'));
const scripts = [...afterFooter.matchAll(/<script src="([^"]*)"><\/script>/g)].map((m) => m[1]);

let main = /<main id="main-content">\n?([\s\S]*?)\n?\s*<\/main>/.exec(src)[1];
if (main.includes('<%')) throw new Error('page already contains "<%"');

// A run of FAQ <details>, as the faq partial fed from the database.
main = main.replace(/((?:[ \t]*<details class="faq"[^>]*>[\s\S]*?<\/details>\s*)+)/g, (run) => {
  const name = attr(/<details class="faq"[^>]*>/.exec(run)[0], 'name');
  const count = (run.match(/<details class="faq"/g) || []).length;
  found.push(`${count} FAQ <details> -> faq partial reading it.faqs('${pageKey}')`);
  const lead = /^[ \t]*/.exec(run)[0];
  const trail = /\s*$/.exec(run)[0];
  return `${lead}<%~ include('/partials/faq', { items: it.faqs(${JSON.stringify(pageKey)}), name: ${JSON.stringify(name || '')}, esc: it.esc }) %>${trail}`;
});

main = main.replace(/<!--#([\w-]+)((?:\s+[\w-]+="[^"]*")*)\s*-->/g, (_m, name, rawAttrs) => {
  const attrs = {};
  for (const m of rawAttrs.matchAll(/([\w-]+)="([^"]*)"/g)) attrs[m[1]] = m[2];
  found.push(`block ${name}${Object.keys(attrs).length ? ' ' + JSON.stringify(attrs) : ''}`);
  const arg = Object.keys(attrs).length ? JSON.stringify(attrs) : '';
  return `<%~ it.blocks[${JSON.stringify(name)}](${arg}) %>`;
});

const tokens = new Set();
main = main.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_m, key) => {
  tokens.add(key);
  return `<%~ it.t.${key} %>`;
});
if (tokens.size) found.push(`tokens: ${[...tokens].join(', ')}`);

const layoutData = [`  meta: ${toJs(meta, '  ')}`];
if (styles.length) layoutData.push(`  styles: ${JSON.stringify(styles)}`);
if (scripts.length) layoutData.push(`  scripts: ${JSON.stringify(scripts)}`);
if (bodyClass) layoutData.push(`  bodyClass: ${JSON.stringify(bodyClass)}`);
if (Object.keys(header).length) layoutData.push(`  header: ${JSON.stringify(header)}`);
if (jsonLd.length) layoutData.push(`  jsonLd: [\n${jsonLd.map((j) => '    ' + j).join(',\n')}\n  ]`);

const out = `<%/* ${meta.canonical}: moved from public/${page}.html. Shared blocks, prices and contact details come from it.blocks and it.t. */%>
<% layout('/layouts/base', {
${layoutData.join(',\n')}
}) %>
${main}
`;

const dest = path.join(API_DIR, 'views', 'pages', `${page}.eta`);
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out);
console.log(`wrote views/pages/${page}.eta`);
for (const line of found) console.log('  ' + line);
