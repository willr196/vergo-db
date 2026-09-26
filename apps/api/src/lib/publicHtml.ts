import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Response } from 'express';

/**
 * Serves the static HTML pages with every local stylesheet, script and image
 * URL stamped with a hash of that file's contents: /vergo-site.css becomes
 * /vergo-site.css?v=3f9a1c02de. srcset lists are stamped entry by entry.
 *
 * Without the stamp, CSS and JS had to be sent as `no-cache`, so every page
 * view cost a revalidation round trip per file before first paint (a long
 * max-age once left phones pairing last week's stylesheet with this week's
 * HTML). With it, a stamped URL can be cached for a year, because an edited
 * file gets a new hash and so a new URL. See the static setHeaders in index.ts.
 *
 * Hashes and page sources are cached against each file's mtime, so a
 * production machine reads each file once and `npm run dev` still picks up
 * edits on the next request.
 */

// Fonts are left out on purpose: the preload in each <head> has to match the
// unversioned URL in the @font-face rules, or the browser fetches the font twice.
// They are cached for a year by path instead (see index.ts).
const ASSET_REF = /\b(href|src)="(\/[^"?#]+\.(?:css|js|webp|png|jpe?g|svg|avif|gif))"/g;
const SRCSET_REF = /\bsrcset="([^"]+)"/g;
const SRCSET_URL = /(^|,\s*)(\/[^\s,?#]+\.(?:webp|png|jpe?g|svg|avif|gif))(?=[\s,]|$)/g;

/**
 * Cache-Control for every public HTML page. Browsers revalidate on each view
 * (max-age=0, answered with a 304 from the ETag), while a shared cache may hold
 * a copy for a minute and serve it stale for 30 seconds while it refetches.
 * Nothing in the pages is per-visitor, so a shared copy is safe.
 */
export const PUBLIC_HTML_CACHE_CONTROL = 'public, max-age=0, s-maxage=60, stale-while-revalidate=30';

type Cached<T> = { mtimeMs: number; value: T };
const hashCache = new Map<string, Cached<string | null>>();
const sourceCache = new Map<string, Cached<string>>();

function mtimeOf(filePath: string): number | null {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}

function assetHash(publicDir: string, urlPath: string): string | null {
  const filePath = path.resolve(publicDir, '.' + urlPath);
  if (!filePath.startsWith(path.resolve(publicDir) + path.sep)) return null;
  const mtimeMs = mtimeOf(filePath);
  if (mtimeMs === null) return null;

  const cached = hashCache.get(filePath);
  if (cached && cached.mtimeMs === mtimeMs) return cached.value;

  const value = crypto.createHash('sha1').update(fs.readFileSync(filePath)).digest('hex').slice(0, 10);
  hashCache.set(filePath, { mtimeMs, value });
  return value;
}

export function versionAssetUrls(html: string, publicDir: string): string {
  return html
    .replace(ASSET_REF, (match, attr: string, urlPath: string) => {
      const hash = assetHash(publicDir, urlPath);
      return hash ? `${attr}="${urlPath}?v=${hash}"` : match;
    })
    .replace(SRCSET_REF, (_match, list: string) => {
      const stamped = list.replace(SRCSET_URL, (m, lead: string, urlPath: string) => {
        const hash = assetHash(publicDir, urlPath);
        return hash ? `${lead}${urlPath}?v=${hash}` : m;
      });
      return `srcset="${stamped}"`;
    });
}

function renderPage(filePath: string, publicDir: string): string | null {
  const mtimeMs = mtimeOf(filePath);
  if (mtimeMs === null) return null;

  let cached = sourceCache.get(filePath);
  if (!cached || cached.mtimeMs !== mtimeMs) {
    cached = { mtimeMs, value: fs.readFileSync(filePath, 'utf8') };
    sourceCache.set(filePath, cached);
  }
  // Stamped on every request rather than cached whole: a page can be unchanged
  // while a stylesheet it links to has been edited.
  return versionAssetUrls(cached.value, publicDir);
}

/** Sends an HTML page from public/ with versioned asset URLs. Returns false if the file is missing. */
export function sendPublicHtml(res: Response, filePath: string, publicDir: string): boolean {
  const html = renderPage(filePath, publicDir);
  if (html === null) return false;
  res.setHeader('Cache-Control', PUBLIC_HTML_CACHE_CONTROL);
  res.type('html').send(html);
  return true;
}
