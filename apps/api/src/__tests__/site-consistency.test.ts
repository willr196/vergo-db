/**
 * Site consistency: every public page, checked as it is served (shared blocks
 * and {{TOKENS}} filled in), against the values in config/pricing.ts and
 * site/content.ts. This is what stops a price, a promise or a placeholder
 * drifting back onto one page.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PRICING, SITE_TERMS, formatRate } from '../config/pricing';
import { renderPublicSource } from '../lib/publicHtml';
import { renderView, VIEW_ROUTES } from '../site/view';

function setRequiredEnv() {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '0';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/vergo_test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || '0123456789abcdef0123456789abcdef';
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fedcba9876543210fedcba9876543210';
  process.env.WEB_ORIGIN = process.env.WEB_ORIGIN || 'http://localhost:8080';
}
setRequiredEnv();
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LEGACY_REDIRECTS } = require('../index') as { LEGACY_REDIRECTS: Record<string, string> };

const publicDir = path.join(process.cwd(), 'public');

// Used by parse(), which runs as the page list below is built.
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style']);

/* ------------------------------------------------------------ the pages */

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'pages' ? [] : walk(full);
    return e.name.endsWith('.html') ? [full] : [];
  });
}

interface Page {
  rel: string; // "hire/quote.html"
  url: string; // "/hire/quote"
  html: string;
  root: Node;
}

// The admin panel and its login page are out of scope.
const pages: Page[] = walk(publicDir)
  .map((file) => path.relative(publicDir, file).split(path.sep).join('/'))
  .filter((rel) => !/^admin/.test(rel) && rel !== 'login.html')
  .map((rel) => {
    const file = path.join(publicDir, rel);
    const html = renderPublicSource(fs.readFileSync(file, 'utf8'), file, publicDir);
    const url = '/' + rel.replace(/\.html$/, '').replace(/(^|\/)index$/, '');
    return { rel, url: url === '/' ? '/' : url.replace(/\/$/, ''), html, root: parse(html) };
  })
  // And every page served from a template, rendered as the server sends it.
  .concat(
    VIEW_ROUTES.map((route) => {
      const html = renderView(route.view, { path: route.path });
      return { rel: `views/pages/${route.view}.eta`, url: route.path, html, root: parse(html) };
    }),
  );

const LEGAL = new Set(['/terms', '/privacy', '/legal']);
const isExempt = (p: Page) => LEGAL.has(p.url) || p.url === '/blog' || p.url.startsWith('/blog/') || p.url === '/404';

function page(url: string): Page {
  const p = pages.find((x) => x.url === url);
  assert.ok(p, `page ${url} exists`);
  return p!;
}

/* ------------------------------------------------ a very small HTML tree */

interface Node {
  tag: string; // '#text' for text
  attrs: Record<string, string>;
  children: Node[];
  text?: string;
  parent?: Node;
}


function parse(html: string): Node {
  const root: Node = { tag: '#root', attrs: {}, children: [] };
  let cur = root;
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)|</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[0].startsWith('<!--')) continue;
    if (m[5] !== undefined || m[0] === '<') {
      cur.children.push({ tag: '#text', attrs: {}, children: [], text: m[0], parent: cur });
      continue;
    }
    const tag = m[2].toLowerCase();
    if (m[1]) {
      let n: Node | undefined = cur;
      while (n && n.tag !== tag) n = n.parent;
      if (n && n.parent) cur = n.parent;
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of m[3].matchAll(/([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? '';
    }
    const node: Node = { tag, attrs, children: [], parent: cur };
    cur.children.push(node);
    if (RAW.has(tag)) {
      const end = html.indexOf(`</${tag}`, re.lastIndex);
      node.children.push({ tag: '#text', attrs: {}, children: [], text: html.slice(re.lastIndex, end), parent: node });
      re.lastIndex = html.indexOf('>', end) + 1;
      continue;
    }
    if (!VOID.has(tag) && !m[4]) cur = node;
  }
  return root;
}

function all(node: Node, pred: (n: Node) => boolean, out: Node[] = []): Node[] {
  for (const c of node.children) {
    if (c.tag === '#text') continue;
    if (pred(c)) out.push(c);
    all(c, pred, out);
  }
  return out;
}
const byTag = (tag: string) => (n: Node) => n.tag === tag;
const hasClass = (cls: string) => (n: Node) => (n.attrs.class || '').split(/\s+/).includes(cls);

function decode(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&pound;/g, '£').replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"').replace(/&mdash;|&ndash;/g, '-').replace(/&rarr;/g, '→').replace(/&times;/g, '×')
    .replace(/&eacute;/g, 'é').replace(/&middot;/g, '·').replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)));
}

/** Visible text: no scripts, styles or comments. skip() prunes subtrees. */
function text(node: Node, skip: (n: Node) => boolean = () => false): string {
  if (node.tag === '#text') return decode(node.text || '');
  if (RAW.has(node.tag) || skip(node)) return '';
  const inline = /^(a|span|strong|em|b|i|small|abbr|time|label|sup|sub)$/.test(node.tag);
  const inner = node.children.map((c) => text(c, skip)).join('');
  return inline ? inner : ` ${inner} `;
}

// A word has at least one letter: step numbers ("01") and phone digits don't
// count, prices ("£18.50/hr") do via their unit.
const words = (s: string) => (s.match(/[A-Za-z0-9£][\w'’£.,/+-]*/g) || []).filter((w) => /[A-Za-z]/.test(w)).length;

/* ------------------------------------------------------ banned strings */

test('no page carries a placeholder, an old price or a retired line', () => {
  const banned: Array<[RegExp, string]> = [
    [/TO CONFIRM/, 'TO CONFIRM'],
    [/\bTBC\b/, 'TBC'],
    [/coming soon/i, 'coming soon'],
    [/First draft/i, 'First draft'],
    [/In development/i, 'In development'],
    [/lorem/i, 'lorem'],
    [/£19\.00|£19\b/, '£19'],
    [/19 pounds/i, '19 pounds'],
    [/pounds an hour/i, 'pounds an hour'],
    [/small enough to mean it/i, 'small enough to mean it'],
    [/Wherever you go/i, 'Wherever you go'],
    [/no surcharges/i, 'no surcharges'],
    [/Someone doesn't show, you don't pay/i, "Someone doesn't show"],
    [/Private client/, 'Private client'],
    [/Lorraine, Host/, 'Lorraine, Host'],
    [/Jake, Chef/, 'Jake, Chef'],
    [/VERGO Events/, 'VERGO Events'],
    [/William Robb/, 'William Robb'],
    [/Back to \//, 'Back to /'],
    [/All staff employed on PAYE/i, 'All staff employed on PAYE'],
    [/Every VERGO worker is PAYE/i, 'Every VERGO worker is PAYE'],
    [/8am and 10pm|8am.{0,3}10pm/i, '8am-10pm'],
    [/Squid Game/i, 'Squid Game'],
    [/Tim Burton/i, 'Tim Burton'],
    [/See shifts/i, 'See shifts'],
    [/\{\{[A-Z_]+\}\}/, 'unfilled {{TOKEN}}'],
    [/<!--#/, 'unfilled block marker'],
  ];
  const problems: string[] = [];
  for (const p of pages) {
    const body = all(p.root, byTag('body'))[0] || p.root;
    const visible = text(body);
    const meta = [...p.html.matchAll(/<(?:title|meta[^>]*content=")([^<"]*)/g)].map((m) => m[1]).join(' ');
    for (const [re, label] of banned) {
      if (re.test(visible) || re.test(meta) || (label.startsWith('unfilled') && re.test(p.html))) problems.push(`${p.rel}: ${label}`);
    }
    if (/placeholder/i.test(visible)) problems.push(`${p.rel}: "placeholder" in visible text`);
    for (const m of p.html.matchAll(/(?:src|href|srcset)="([^"]*placeholder[^"]*)"/gi)) problems.push(`${p.rel}: placeholder asset ${m[1]}`);
  }
  assert.deepEqual(problems, []);
});

test('public scripts carry no placeholder or retired wording', () => {
  const dir = path.join(publicDir);
  const files = ['vergo-site.js', 'vergo-whatsapp.js', 'vergo-consent.js', 'pages/js/quote.js', 'pages/js/quote-calc.js', 'pages/js/halloween-team.js', 'pages/js/work-apply.js'];
  const problems: string[] = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    // String literals only: comments may explain what was removed.
    const strings = [...src.matchAll(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`[^`]*`/g)].map((m) => m[0]).join('\n');
    for (const re of [/TO CONFIRM/, /\bTBC\b/, /coming soon/i, /8am.{0,6}10pm/i, /£19/, /no surcharges/i, /Wherever you go/i]) {
      if (re.test(strings)) problems.push(`${f}: ${re}`);
    }
  }
  assert.deepEqual(problems, []);
});

/* --------------------------------------------------------------- chrome */

test('every public page has the shared header and footer, with Cookie settings', () => {
  const problems: string[] = [];
  for (const p of pages) {
    if (!/<header[^>]*data-shared-header/.test(p.html)) problems.push(`${p.rel}: no shared header`);
    if (!/<footer[^>]*data-shared-footer/.test(p.html)) problems.push(`${p.rel}: no shared footer`);
    if (!/>Cookie settings</.test(p.html)) problems.push(`${p.rel}: no Cookie settings link`);
  }
  assert.deepEqual(problems, []);
});

test('the header never carries a permanent link to /special-events', () => {
  const problems: string[] = [];
  for (const p of pages) {
    for (const header of all(p.root, (n) => n.tag === 'header' && 'data-shared-header' in n.attrs)) {
      for (const a of all(header, byTag('a'))) {
        // The seasonal item is allowed: the server only renders it while a
        // season's dates are live (site/view.ts seasonState).
        if ('data-season-item' in (a.parent?.attrs || {})) continue;
        if ((a.attrs.href || '').startsWith('/special-events')) problems.push(`${p.rel}: header links ${a.attrs.href}`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

/* ------------------------------------------------------- word budgets */

const BUDGETS: Record<string, number> = {
  '/': 220,
  '/hire': 220,
  '/hire/waiting-staff': 160,
  '/hire/bar-staff': 160,
  '/hire/kitchen-porters': 160,
  '/hire/weddings': 180,
  '/hire/production-catering': 200,
  '/special-events/christmas': 220,
  '/special-events/halloween': 550,
  '/special-events': 120,
  '/book-an-event': 150,
  '/about': 150,
  '/work': 180,
  '/hire/quote': 80,
  '/work/apply': 80,
};

function mainWords(p: Page): number {
  const main = all(p.root, byTag('main'))[0];
  assert.ok(main, `${p.rel} has <main>`);
  const excluded = (n: Node) =>
    n.tag === 'form' ||
    n.attrs['data-block'] === 'rates' ||
    n.attrs['data-block'] === 'guarantees' ||
    ('hidden' in n.attrs && !('data-season' in n.attrs));
  // Seasonal slots ship hidden and only one shows at a time: count the largest.
  const seasonal = all(main, (n) => 'data-season' in n.attrs).map((n) => words(text(n)));
  const rest = words(text(main, (n) => excluded(n) || 'data-season' in n.attrs));
  return rest + (seasonal.length ? Math.max(...seasonal) : 0);
}

test('every page stays inside its word budget', () => {
  const problems: string[] = [];
  for (const [url, budget] of Object.entries(BUDGETS)) {
    const count = mainWords(page(url));
    if (count > budget) problems.push(`${url}: ${count} words, budget ${budget}`);
  }
  assert.deepEqual(problems, []);
});

test('paragraphs run to two sentences at most, and FAQs to three', () => {
  const problems: string[] = [];
  for (const p of pages.filter((x) => !isExempt(x))) {
    const main = all(p.root, byTag('main'))[0];
    if (!main) continue;
    const inBlock = (n: Node) => {
      for (let x: Node | undefined = n; x; x = x.parent) if (x.attrs['data-block'] || x.tag === 'form') return true;
      return false;
    };
    for (const para of all(main, byTag('p')).filter((n) => !inBlock(n))) {
      const t = text(para).replace(/\s+/g, ' ').trim().replace(/\be\.g\./g, 'eg');
      const sentences = t.split(/(?<=[.!?])\s+(?=[A-Z"£0-9])/).filter((s) => s.trim());
      if (sentences.length > 2) problems.push(`${p.rel}: ${sentences.length} sentences: "${t.slice(0, 70)}…"`);
    }
    const faqs = all(main, hasClass('faq')).length;
    const cap = p.url === '/special-events/halloween' ? 4 : 3;
    if (faqs > cap) problems.push(`${p.rel}: ${faqs} FAQs`);
  }
  assert.deepEqual(problems, []);
});

/* ---------------------------------------------------------- Halloween */

test('Halloween keeps every offering', () => {
  const p = page('/special-events/halloween');
  const t = text(p.root);
  assert.equal(all(p.root, hasClass('se-service')).length, 9, 'nine services');
  assert.equal(all(p.root, hasClass('se-involve')).length, 3, 'three levels');
  assert.equal(all(p.root, hasClass('se-concept')).length, 5, 'five concepts');
  for (const theme of ['Deadly Games', 'Killer Clown Asylum', 'Ghouls, Ghosts & the Undead', 'The Gates of Hell', 'Classic Halloween', 'Gothic Whimsy', "Witches' Nightmare", 'The Trap Room', 'Skeleton After-Party', 'Monster House']) {
    assert.ok(t.includes(theme), `decor theme ${theme}`);
  }
  assert.ok(/Makeup and SFX/.test(t), 'makeup section');
  const rates = all(p.root, hasClass('se-rate-figure')).map((n) => text(n).trim());
  assert.deepEqual(rates, [PRICING.specialEvents.themedHospitality, PRICING.specialEvents.characterPerformer, PRICING.specialEvents.makeupArtist].map((n) => `£${n}`));
  assert.ok(/Specialist performers, decor and full experiences/.test(t), 'bespoke items');
  assert.ok(/<form[^>]*>/.test(p.html) && /id="build"/.test(p.html), 'the #build form');
});

/* ------------------------------------------------------- prices, terms */

test('every £ amount on a public page comes from config', () => {
  const money = (n: number) => [formatRate(n), `£${n}`, `£${n.toFixed(2)}`];
  const allowed = new Set<string>([
    ...money(PRICING.standardRate),
    ...(PRICING.premiumEnabled ? money(PRICING.premiumRate) : []),
    ...money(PRICING.specialEvents.themedHospitality),
    ...money(PRICING.specialEvents.characterPerformer),
    ...money(PRICING.specialEvents.makeupArtist),
    ...(SITE_TERMS.workerPayLine.match(/£[\d.,]+/g) || []),
  ]);
  const problems: string[] = [];
  for (const p of pages) {
    // The blog post's cost table is worked arithmetic, not a price list.
    if (p.url === '/blog/paye-vs-self-employed-event-staff') continue;
    const visible = text(p.root) + ' ' + [...p.html.matchAll(/content="([^"]*)"/g)].map((m) => m[1]).join(' ');
    for (const amount of decode(visible).match(/£\d+(?:,\d{3})*(?:\.\d+)?/g) || []) {
      if (!allowed.has(amount)) problems.push(`${p.rel}: ${amount}`);
    }
  }
  assert.deepEqual(problems, []);
});

test('Premium is shown only while it is enabled', () => {
  for (const p of pages) {
    if (PRICING.premiumEnabled) continue;
    assert.ok(!/Premium/.test(text(p.root)), `${p.rel} mentions Premium`);
  }
});

test('rate, guarantee and employment wording matches config exactly', () => {
  const ratePages = ['/', '/hire', '/hire/waiting-staff', '/hire/bar-staff', '/hire/kitchen-porters', '/hire/weddings', '/hire/production-catering', '/special-events/christmas'];
  for (const url of ratePages) {
    const p = page(url);
    const blocks = all(p.root, (n) => n.attrs['data-block'] === 'rates');
    assert.equal(blocks.length, 1, `${url}: one rate block`);
    const t = text(blocks[0]).replace(/\s+/g, ' ');
    assert.ok(t.includes(`Standard, ${formatRate(PRICING.standardRate)}.`), `${url}: standard rate`);
    if (PRICING.premiumEnabled) assert.ok(t.includes(`Premium, ${formatRate(PRICING.premiumRate)}.`), `${url}: premium rate`);
    assert.ok(t.includes(SITE_TERMS.paymentTerms) && t.includes(SITE_TERMS.cancellation), `${url}: terms small print`);
  }

  const problems: string[] = [];
  for (const p of pages) {
    const t = text(p.root).replace(/\s+/g, ' ');
    const guarantee = all(p.root, (n) => n.attrs['data-block'] === 'guarantees');
    if (guarantee.length > 1) problems.push(`${p.rel}: ${guarantee.length} guarantee blocks`);
    for (const g of guarantee) {
      const gt = text(g).replace(/\s+/g, ' ');
      if (!gt.includes(SITE_TERMS.confirmationPromise) || !gt.includes(SITE_TERMS.noShowPromise + SITE_TERMS.noShowExtra)) problems.push(`${p.rel}: guarantee block wording`);
    }
    if (all(p.root, (n) => n.attrs['data-block'] === 'rates').length > 1) problems.push(`${p.rel}: more than one rate block`);
    // Any line saying who is employed by us must be one of the two approved
    // lines, word for word.
    for (const el of all(p.root, (n) => /^(p|li|td|dd)$/.test(n.tag))) {
      const s = text(el).replace(/\s+/g, ' ').trim();
      if (!/employed by us/.test(s)) continue;
      if (s !== SITE_TERMS.employmentShort && s !== SITE_TERMS.employmentLine) problems.push(`${p.rel}: employment line "${s}"`);
    }
  }
  assert.deepEqual(problems, []);
});

/* ------------------------------------------------------------- links */

test('every internal link resolves to a page, a file, a redirect or an anchor', () => {
  const urls = new Set(pages.map((p) => p.url));
  const idsOn = (p: Page) => new Set(all(p.root, (n) => 'id' in n.attrs).map((n) => n.attrs.id));
  const problems: string[] = [];
  for (const p of pages) {
    for (const a of all(p.root, byTag('a'))) {
      const href = a.attrs.href;
      if (!href || !href.startsWith('/') || href.startsWith('//')) {
        if (href && href.startsWith('#') && href.length > 1 && href !== '#cookie-settings' && !idsOn(p).has(href.slice(1))) problems.push(`${p.rel}: ${href}`);
        continue;
      }
      const [pathPart, hash] = href.split('#');
      const clean = pathPart.split('?')[0].replace(/\/$/, '') || '/';
      let target: Page | undefined;
      if (urls.has(clean)) target = page(clean);
      else if (LEGACY_REDIRECTS[clean]) target = pages.find((x) => x.url === LEGACY_REDIRECTS[clean]);
      else if (fs.existsSync(path.join(publicDir, clean))) continue;
      else { problems.push(`${p.rel}: ${href}`); continue; }
      if (hash && target && !idsOn(target).has(hash)) problems.push(`${p.rel}: ${href} (no #${hash})`);
    }
  }
  assert.deepEqual(problems, []);
});
