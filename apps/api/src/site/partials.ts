import { PageContext, PartialAttrs, renderBlock } from './view';

/**
 * The blocks every public page shares. A page still served from public/*.html
 * asks for one with a marker comment, <!--#header-->, <!--#rates compact="1"-->,
 * and gets it filled in as it is served (see lib/publicHtml.ts).
 *
 * The markup lives in views/partials/*.eta, the same files the server-rendered
 * pages include, so a change there reaches every page at once, migrated or not.
 *
 * No inline <script> in any block: the CSP hashes for the pages on disk are
 * computed at boot from the rendered pages, and a block that changed per page
 * would multiply them.
 */

export type { PageContext, PartialAttrs };

const NAMES = [
  'testimonials',
  'trust-strip',
  'recent-work',
  'legal-ico',
  'legal-insurers',
  'service-level',
  'head',
  'header',
  'footer',
  'rates',
  'guarantees',
  'working-with-us',
  'cta',
];

export const PARTIALS: Record<string, (attrs: PartialAttrs, ctx: PageContext) => string> = Object.fromEntries(
  NAMES.map((name) => [name, (attrs: PartialAttrs, ctx: PageContext) => renderBlock(name, attrs, ctx) ?? '']),
);
