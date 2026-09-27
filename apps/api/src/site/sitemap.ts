import fs from 'node:fs';
import path from 'node:path';
import { siteContent } from './store';

/**
 * sitemap.xml, built on request from the page list below and the blog posts
 * on disk, so a new page or post can't be left out of it.
 *
 * lastmod is the later of:
 *   - the date the page's own source last changed, written into PAGES by
 *     tools/sitemap-lastmod.mjs from git history;
 *   - the last database change to content the page shows (its FAQs, the
 *     reviews, the seasonal promos, the rates and contact settings).
 */

const ORIGIN = 'https://vergoltd.com';

interface SitemapPage {
  path: string;
  /** YYYY-MM-DD the page's source last changed (tools/sitemap-lastmod.mjs). */
  lastmod: string;
  changefreq: 'weekly' | 'monthly';
  priority: string;
  /** Database content the page shows, besides the settings every page shows. */
  shows?: Array<'testimonials' | 'recentWork' | 'photos' | 'promos' | `faqs:${string}`>;
}

// PAGES:START (tools/sitemap-lastmod.mjs rewrites the lastmod values)
const PAGES: SitemapPage[] = [
  { path: '/', lastmod: '2026-09-26', changefreq: 'weekly', priority: '1.0', shows: ['testimonials', 'recentWork', 'photos', 'promos'] },
  { path: '/hire', lastmod: '2026-09-26', changefreq: 'monthly', priority: '0.9', shows: ['testimonials', 'recentWork'] },
  { path: '/book-an-event', lastmod: '2026-09-26', changefreq: 'monthly', priority: '0.8' },
  { path: '/hire/waiting-staff', lastmod: '2026-09-26', changefreq: 'monthly', priority: '0.8', shows: ['faqs:hire/waiting-staff'] },
  { path: '/hire/bar-staff', lastmod: '2026-09-26', changefreq: 'monthly', priority: '0.8', shows: ['faqs:hire/bar-staff'] },
  { path: '/hire/kitchen-porters', lastmod: '2026-09-26', changefreq: 'monthly', priority: '0.8', shows: ['faqs:hire/kitchen-porters'] },
  { path: '/hire/weddings', lastmod: '2026-09-26', changefreq: 'monthly', priority: '0.8', shows: ['faqs:hire/weddings'] },
  { path: '/hire/production-catering', lastmod: '2026-09-26', changefreq: 'monthly', priority: '0.8', shows: ['faqs:hire/production-catering'] },
  { path: '/work', lastmod: '2026-09-26', changefreq: 'monthly', priority: '0.9', shows: ['faqs:work'] },
  { path: '/about', lastmod: '2026-09-26', changefreq: 'monthly', priority: '0.6' },
  { path: '/special-events', lastmod: '2026-09-26', changefreq: 'monthly', priority: '0.8', shows: ['promos'] },
  { path: '/special-events/halloween', lastmod: '2026-09-26', changefreq: 'weekly', priority: '0.9', shows: ['faqs:special-events/halloween', 'promos'] },
  { path: '/special-events/christmas', lastmod: '2026-09-26', changefreq: 'weekly', priority: '0.9', shows: ['faqs:special-events/christmas', 'promos'] },
  { path: '/terms', lastmod: '2026-09-26', changefreq: 'monthly', priority: '0.3' },
  { path: '/privacy', lastmod: '2026-09-26', changefreq: 'monthly', priority: '0.3' },
  { path: '/legal', lastmod: '2026-09-26', changefreq: 'monthly', priority: '0.3' },
  { path: '/blog', lastmod: '2026-09-26', changefreq: 'weekly', priority: '0.7' },
];
// PAGES:END

/** Every post in public/blog/, dated by the dateModified in its structured data. */
function blogPosts(): Array<{ path: string; lastmod: string }> {
  const dir = path.join(process.cwd(), 'public', 'blog');
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.html'));
  } catch {
    return [];
  }
  return files.sort().map((file) => {
    const html = fs.readFileSync(path.join(dir, file), 'utf8');
    const m = /"dateModified":\s*"(\d{4}-\d{2}-\d{2})/.exec(html) || /"datePublished":\s*"(\d{4}-\d{2}-\d{2})/.exec(html);
    return { path: `/blog/${file.replace(/\.html$/, '')}`, lastmod: m ? m[1] : '' };
  });
}

function day(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The later of two YYYY-MM-DD dates (the empty string loses). */
function later(a: string, b: string): string {
  return a > b ? a : b;
}

export function lastmodFor(page: SitemapPage): string {
  const { updated } = siteContent();
  let lastmod = page.lastmod;
  if (updated.settings) lastmod = later(lastmod, day(updated.settings));
  for (const kind of page.shows || []) {
    const date = kind.startsWith('faqs:') ? updated.faqs[kind.slice(5)] : updated[kind as 'testimonials' | 'recentWork' | 'photos' | 'promos'];
    if (date) lastmod = later(lastmod, day(date));
  }
  return lastmod;
}

export function sitemapXml(): string {
  const url = (loc: string, lastmod: string, changefreq: string, priority: string) =>
    `  <url>\n    <loc>${ORIGIN}${loc}</loc>\n${lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : ''}    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
  const entries = [
    ...PAGES.map((p) => url(p.path, lastmodFor(p), p.changefreq, p.priority)),
    ...blogPosts().map((p) => url(p.path, p.lastmod, 'monthly', '0.6')),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
}

/** The paths the sitemap lists, for tests. */
export function sitemapPaths(): string[] {
  return [...PAGES.map((p) => p.path), ...blogPosts().map((p) => p.path)];
}
