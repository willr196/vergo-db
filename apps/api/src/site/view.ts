import crypto from 'node:crypto';
import path from 'node:path';
import { Eta } from 'eta';
import type { Response } from 'express';
import { PRICING, SITE_TERMS, formatRate, headlineRateText } from '../config/pricing';
import { SITE, siteTokens } from './content';
import { siteContent } from './store';

/**
 * Server-rendered public pages (Eta). Templates live in apps/api/views/:
 *   layouts/base.eta  the <head>, header, <main> and footer every page shares
 *   partials/*.eta    the shared blocks (header, footer, rates, guarantees, cta...)
 *   pages/*.eta       one per page, holding only what that page says
 *
 * The same partials also fill the <!--#marker--> comments in the pages still
 * served from public/*.html (see partials.ts), so a migrated page and one not
 * yet migrated can never show two versions of the header or the rate block.
 */

export type PartialAttrs = Record<string, string>;
export interface PageContext {
  /** Clean URL of the page being served: "/", "/hire/quote", "/blog/..." */
  path: string;
}

const VIEWS_DIR = path.join(process.cwd(), 'views');

const eta = new Eta({
  views: VIEWS_DIR,
  // Templates are read once in production; in dev an edit shows on the next request.
  cache: process.env.NODE_ENV === 'production',
  // The site's escaper, which leaves apostrophes alone: copy is full of them,
  // and the consistency test compares served text with config byte for byte.
  escapeFunction: esc,
});

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** JSON for a <script type="application/ld+json"> block. "<" is escaped so no value can close the tag. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data, null, 2).replace(/</g, '\\u003c');
}

/* ------------------------------------------------------------- shared data */

const NAV = [
  { href: '/hire', label: 'Hire staff', match: (p: string) => p === '/hire' || (p.startsWith('/hire/') && p !== '/hire/quote') },
  { href: '/book-an-event', label: 'Events', match: (p: string) => p === '/book-an-event' },
  { href: '/about', label: 'About', match: (p: string) => p === '/about' },
  { href: '/work', label: 'Work for us', match: (p: string) => p === '/work' || p.startsWith('/work/') },
];

/** Pages that don't sell a booking, so the seasonal banner stays off them. */
function bannerAllowed(pagePath: string): boolean {
  if (pagePath === '/work' || pagePath.startsWith('/work/')) return false;
  if (['/terms', '/privacy', '/legal'].includes(pagePath)) return false;
  if (pagePath === '/blog' || pagePath.startsWith('/blog/')) return false;
  return true;
}

function rateTerms(): string[] {
  return [
    `${PRICING.minimumChargeHours}-hour minimum`,
    `${PRICING.overrunBlockMinutes}-min overrun blocks`,
    `+${Math.round((PRICING.afterMidnightMultiplier - 1) * 100)}% after midnight`,
    'No booking or uniform fees',
    SITE_TERMS.seniorRolesQuoted,
    SITE_TERMS.paymentTerms,
    `Cancellation: ${SITE_TERMS.cancellation}`,
  ];
}

/** Stored HTML (an FAQ answer with a link) as the plain text structured data wants. */
export function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Fills {{TOKENS}} in stored text (FAQ answers, promo lines). Unknown tokens stay, for the consistency test to find. */
export function fillTokens(text: string, tokens: Record<string, string> = siteTokens()): string {
  return text.replace(/{{([A-Z0-9_]+)}}/g, (match, key: string) => (key in tokens ? tokens[key] : match));
}

/** The partials a marker or a template can ask for, by name. */
const BLOCKS: Record<string, string> = {
  head: 'head',
  header: 'header',
  footer: 'footer',
  rates: 'rate-block',
  guarantees: 'guarantee-block',
  'working-with-us': 'working-with-us',
  cta: 'cta',
  'service-level': 'service-level',
  testimonials: 'testimonials',
  'recent-work': 'recent-work',
  'trust-strip': 'trust-strip',
  'legal-ico': 'legal-ico',
  'legal-insurers': 'legal-insurers',
};

type BlockFn = (attrs?: PartialAttrs) => string;

/** Everything a template or partial can read, for the page at ctx.path. */
export function pageData(ctx: PageContext) {
  const content = siteContent();
  const tokens = siteTokens();
  const data: Record<string, unknown> = {
    path: ctx.path,
    site: SITE,
    pricing: PRICING,
    terms: SITE_TERMS,
    t: tokens,
    fmt: formatRate,
    headlineRateText: headlineRateText(),
    rateTerms: rateTerms(),
    proof: {
      testimonials: content.testimonials,
      recentWork: content.recentWork,
    },
    /** A page's FAQs, tokens filled. pageKey is the path without its leading slash. */
    faqs: (pageKey: string) =>
      (content.faqs[pageKey] || []).map((f) => ({ question: fillTokens(f.question, tokens), answer: fillTokens(f.answer, tokens) })),
    /** FAQPage structured data from the same FAQs the page shows, answers as plain text. */
    faqJsonLd: (pageKey: string) => ({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: (content.faqs[pageKey] || []).map((f) => ({
        '@type': 'Question',
        name: fillTokens(f.question, tokens),
        acceptedAnswer: { '@type': 'Answer', text: plainText(fillTokens(f.answer, tokens)) },
      })),
    }),
    /** Published photos carrying a tag, in order. */
    photos: (tag: string) => content.photos.filter((ph) => ph.tags.includes(tag)),
    fillTokens: (text: string) => fillTokens(text, tokens),
    nav: NAV.map((item) => ({ href: item.href, label: item.label, current: item.match(ctx.path) })),
    bannerAllowed: bannerAllowed(ctx.path),
    esc,
    jsonLdString,
  };
  const blocks: Record<string, BlockFn> = {};
  for (const [name, file] of Object.entries(BLOCKS)) {
    blocks[name] = (attrs = {}) => eta.render(`/partials/${file}`, { ...data, attrs }).trim();
  }
  data.blocks = blocks;
  return data as typeof data & { blocks: Record<string, BlockFn> };
}

/** One shared block, as the <!--#marker--> renderer asks for it. */
export function renderBlock(name: string, attrs: PartialAttrs, ctx: PageContext): string | null {
  if (!BLOCKS[name]) return null;
  return pageData(ctx).blocks[name](attrs);
}

/* ------------------------------------------------------------ page routes */

/** A page rendered from views/pages/<view>.eta, served at `path`. */
export interface ViewRoute {
  path: string;
  view: string;
}

/**
 * Every page that has moved from public/*.html to a template. Order doesn't
 * matter; paths are exact. A page listed here must have its .html deleted, or
 * the old file would still answer at /<page>.html.
 */
export const VIEW_ROUTES: ViewRoute[] = [
  { path: '/terms', view: 'terms' },
  { path: '/privacy', view: 'privacy' },
  { path: '/legal', view: 'legal' },
  { path: '/about', view: 'about' },
  { path: '/work', view: 'work' },
  { path: '/hire/waiting-staff', view: 'hire/waiting-staff' },
  { path: '/hire/bar-staff', view: 'hire/bar-staff' },
  { path: '/hire/kitchen-porters', view: 'hire/kitchen-porters' },
  { path: '/hire/weddings', view: 'hire/weddings' },
  { path: '/hire/production-catering', view: 'hire/production-catering' },
];

export function viewRouteFor(pagePath: string): ViewRoute | undefined {
  return VIEW_ROUTES.find((r) => r.path === pagePath);
}

/** A page as HTML, before asset stamping. Also what the tests read. */
export function renderView(view: string, ctx: PageContext, extra: Record<string, unknown> = {}): string {
  return eta.render(`/pages/${view}`, { ...pageData(ctx), ...extra });
}

/* -------------------------------------------------------------------- CSP */

const INLINE_SCRIPT = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi;

/** sha256 sources for every inline script in a rendered page. */
export function inlineScriptHashes(html: string): string[] {
  const hashes = new Set<string>();
  for (const match of html.matchAll(INLINE_SCRIPT)) {
    const body = match[1];
    if (!body.trim()) continue;
    hashes.add(`'sha256-${crypto.createHash('sha256').update(body, 'utf8').digest('base64')}'`);
  }
  return [...hashes];
}

/**
 * Adds a rendered page's own inline-script hashes to the CSP helmet already
 * set. The boot-time list only covers pages on disk; a template's JSON-LD can
 * carry database content, so it is hashed as it is sent. Hashes rather than a
 * nonce, because the page is cached by the CDN and a hash stays true for every
 * copy of the same bytes.
 */
export function withPageScriptHashes(res: Response, html: string): void {
  const csp = res.getHeader('Content-Security-Policy');
  const hashes = inlineScriptHashes(html);
  if (typeof csp !== 'string' || !hashes.length) return;
  res.setHeader('Content-Security-Policy', csp.replace(/script-src ([^;]*)/, (_m, list: string) => `script-src ${list} ${hashes.join(' ')}`));
}
