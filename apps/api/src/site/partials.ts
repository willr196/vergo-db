import fs from 'node:fs';
import path from 'node:path';
import { PRICING, SITE_TERMS, formatRate, headlineRateText } from '../config/pricing';
import { SITE } from './content';

/**
 * The blocks every public page shares. A page asks for one with a marker
 * comment, <!--#header-->, <!--#rates compact="1"-->, and gets it filled in as
 * it is served (see lib/publicHtml.ts). Nothing here is copied into a page by
 * hand, so a change made here reaches every page at once.
 *
 * No inline <script> in any block: the CSP hashes are computed from the
 * rendered pages, and a block that changed per page would multiply them.
 */

export type PartialAttrs = Record<string, string>;
export interface PageContext {
  /** Clean URL of the page being served: "/", "/hire/quote", "/blog/..." */
  path: string;
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ------------------------------------------------------------------ head */

function head(): string {
  return `<meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="${SITE.themeColor}">
  <link rel="icon" href="/favicon.ico">
  <link rel="preload" href="/fonts/work-sans-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/instrument-serif-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/vergo-site.css">
  <!-- Analytics, gated on cookie consent (see vergo-consent.js) -->
  <script src="/vergo-consent.js" defer></script>`;
}

/* ---------------------------------------------------------------- header */

const NAV = [
  { href: '/hire', label: 'Hire staff', match: (p: string) => p === '/hire' || (p.startsWith('/hire/') && p !== '/hire/quote') },
  { href: '/book-an-event', label: 'Events', match: (p: string) => p === '/book-an-event' },
  { href: '/about', label: 'About', match: (p: string) => p === '/about' },
  { href: '/work', label: 'Work for us', match: (p: string) => p === '/work' || p.startsWith('/work/') },
];

/** Pages that don't sell a booking, so the seasonal banner stays off them. */
function bannerAllowed(path: string): boolean {
  if (path === '/work' || path.startsWith('/work/')) return false;
  if (['/terms', '/privacy', '/legal'].includes(path)) return false;
  if (path === '/blog' || path.startsWith('/blog/')) return false;
  return true;
}

function brand(): string {
  // The V mark is a background image, so the link's only text is the word.
  // aria-label gives it a name that says where it goes.
  return `<a class="brand" href="/" aria-label="VERGO home"><span class="brand-mark" aria-hidden="true"></span><span class="brand-word" aria-hidden="true">VERGO</span></a>`;
}

/**
 * The seasonal banner and header item start hidden and have no link. The
 * script in vergo-site.js fills and shows them by date, so a visitor without
 * JavaScript sees nothing rather than last season's offer.
 */
function seasonBanner(): string {
  return `<div class="season-banner" data-season-banner hidden>
    <div class="season-banner-inner">
      <p class="season-banner-links" data-season-banner-links></p>
      <button type="button" class="season-banner-close" data-season-dismiss aria-label="Dismiss this notice">&times;</button>
    </div>
  </div>`;
}

function fullHeader(ctx: PageContext): string {
  const links = NAV.map((item) => {
    const current = item.match(ctx.path) ? ' aria-current="page"' : '';
    const li = `<li class="nav-item"><a class="nav-link" href="${item.href}"${current}>${item.label}</a></li>`;
    if (item.href !== '/book-an-event') return li;
    return `${li}
          <li class="nav-item nav-item--season" data-season-item hidden><a class="nav-link nav-link--season" data-season-link></a></li>`;
  }).join('\n          ');

  return `${bannerAllowed(ctx.path) ? seasonBanner() : ''}
  <header class="site-header" id="site-header" data-shared-header>
    <div class="site-header-inner">
      ${brand()}
      <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-menu" hidden>
        <span class="menu-toggle-bars" aria-hidden="true"></span><span class="menu-toggle-label">Menu</span>
      </button>
      <nav class="site-nav" id="site-menu" aria-label="Main">
        <ul class="nav-links">
          ${links}
        </ul>
        <div class="nav-actions">
          <a class="nav-call" href="tel:${SITE.phoneE164}"><span class="nav-action-word">Call </span>${SITE.phoneDisplay}</a>
          <a class="nav-whatsapp" href="${SITE.whatsappUrl}" data-whatsapp target="_blank" rel="noopener">WhatsApp</a>
          <a class="btn btn-primary nav-quote" href="/hire/quote">Get a quote</a>
        </div>
      </nav>
    </div>
  </header>`;
}

/** /hire/quote and /work/apply: logo, a way back, and the phone number. */
function focusedHeader(attrs: PartialAttrs): string {
  const back = attrs.back || '/';
  const label = attrs.label || '← Back';
  return `<header class="site-header site-header--focused" id="site-header" data-shared-header>
    <div class="site-header-inner">
      ${brand()}
      <a class="focused-back" href="${esc(back)}">${esc(label)}</a>
      <a class="nav-call" href="tel:${SITE.phoneE164}">${SITE.phoneDisplay}</a>
    </div>
  </header>`;
}

function header(attrs: PartialAttrs, ctx: PageContext): string {
  return attrs.focused ? focusedHeader(attrs) : fullHeader(ctx);
}

/* ---------------------------------------------------------------- footer */

function footer(): string {
  const google = SITE.googleReviewsUrl
    ? `\n          <li><a href="${SITE.googleReviewsUrl}" target="_blank" rel="noopener">Google reviews</a></li>`
    : '';
  return `<footer class="site-footer" role="contentinfo" data-shared-footer>
    <div class="footer-inner">
      <nav class="footer-col" aria-label="Site">
        <ul class="footer-links">
          <li><a href="/hire">Hire staff</a></li>
          <li><a href="/book-an-event">Events</a></li>
          <li><a href="/special-events">Special events</a></li>
          <li><a href="/about">About</a></li>
          <li><a href="/blog">Blog</a></li>
          <li><a href="/work">Work for us</a></li>
        </ul>
      </nav>
      <nav class="footer-col" aria-label="Legal">
        <ul class="footer-links">
          <li><a href="/terms">Terms of business</a></li>
          <li><a href="/privacy">Privacy</a></li>
          <li><a href="/legal">Legal</a></li>
          <li><a href="#cookie-settings" id="vergo-consent-link">Cookie settings</a></li>
        </ul>
      </nav>
      <div class="footer-col">
        <ul class="footer-links">
          <li><a href="mailto:${SITE.publicEmail}">${SITE.publicEmail}</a></li>
          <li><a href="tel:${SITE.phoneE164}">${SITE.phoneDisplay}</a></li>
          <li><a href="${SITE.instagram}" target="_blank" rel="noopener">Instagram</a></li>${google}
        </ul>
      </div>
      <p class="footer-legal">${SITE.legalName}, registered in ${SITE.jurisdiction}, company no. ${SITE.companyNumber}. Registered office: ${SITE.registeredOffice}. Employers' and public liability insured.</p>
    </div>
  </footer>
  <script src="/vergo-site-config.js"></script>
  <script src="/vergo-site.js" defer></script>
  <script src="/vergo-whatsapp.js" defer></script>`;
}

/* ----------------------------------------------------------------- rates */

function rateTerms(): string {
  const items = [
    `${PRICING.minimumChargeHours}-hour minimum`,
    `${PRICING.overrunBlockMinutes}-min overrun blocks`,
    `+${Math.round((PRICING.afterMidnightMultiplier - 1) * 100)}% after midnight`,
    'No booking or uniform fees',
    SITE_TERMS.seniorRolesQuoted,
    SITE_TERMS.paymentTerms,
    `Cancellation: ${SITE_TERMS.cancellation}`,
  ];
  return `<ul class="rate-terms">
        ${items.map((item) => `<li>${esc(item)}</li>`).join('\n        ')}
      </ul>`;
}

/**
 * The rate block, the same everywhere a price is shown. compact="1" is the
 * homepage cut, which adds a link to the full rates on /hire.
 */
function rates(attrs: PartialAttrs): string {
  const compact = Boolean(attrs.compact);
  const id = attrs.id === undefined ? 'rate' : attrs.id;
  const idAttr = id ? ` id="${esc(id)}"` : '';
  const lead = PRICING.premiumEnabled
    ? `<p class="rate-headline"><strong>${headlineRateText()}</strong> per person</p>
      <div class="rate-tiers">
        <div class="rate-tier">
          <p><strong>Standard, ${formatRate(PRICING.standardRate)}.</strong> Waiting, bar, kitchen porters, runners, hosts.</p>
        </div>
        <div class="rate-tier rate-tier--premium">
          <p><strong>Premium, ${formatRate(PRICING.premiumRate)}.</strong> ${esc(SITE_TERMS.premiumDefinition)}</p>
        </div>
      </div>`
    : `<p class="rate-headline"><strong>${formatRate(PRICING.standardRate)}</strong> per hour, per person</p>`;
  const more = compact ? `\n      <p class="rate-more"><a href="/hire#rate">See full rates and terms</a></p>` : '';

  return `<section class="section shell rate-block${compact ? ' rate-block--compact' : ''}"${idAttr} data-block="rates" aria-labelledby="rates-heading">
      <h2 id="rates-heading" class="section-label">Rates</h2>
      ${lead}
      ${rateTerms()}${more}
    </section>`;
}

/* ------------------------------------------------------------ guarantees */

function guarantees(): string {
  const footnote = SITE_TERMS.guaranteeFootnote
    ? `\n      <p class="guarantee-note">${esc(SITE_TERMS.guaranteeFootnote)}</p>`
    : '';
  return `<section class="section shell" data-block="guarantees" aria-labelledby="guarantees-heading">
      <h2 id="guarantees-heading" class="section-label">Our guarantees</h2>
      <div class="guarantees">
        <div class="guarantee-card">
          <h3>Names the same day.</h3>
          <p>${esc(SITE_TERMS.confirmationPromise)}</p>
        </div>
        <div class="guarantee-card">
          <h3>Replacement within the hour.</h3>
          <p>${esc(SITE_TERMS.noShowPromise + SITE_TERMS.noShowExtra)}</p>
        </div>
      </div>${footnote}
    </section>`;
}

/* ------------------------------------------------------- working with us */

function workingWithUs(): string {
  const items = [
    SITE_TERMS.employmentShort,
    'Right to work checked',
    'Insured, certificates on request',
    'Your dress code, not ours',
    SITE_TERMS.favouritesPromise,
  ];
  return `<section class="section shell" data-block="working" aria-labelledby="working-heading">
      <h2 id="working-heading" class="section-label">Working with us</h2>
      <ul class="check-list">
        ${items.map((item) => `<li>${esc(item)}</li>`).join('\n        ')}
      </ul>
    </section>`;
}

/* ------------------------------------------------------------------- cta */

/**
 * The one call to action a page ends on: a short heading, the button, then
 * the phone and WhatsApp. heading="…" button="…" href="…" line="…" (optional).
 */
function cta(attrs: PartialAttrs): string {
  const heading = attrs.heading || 'Got a date in the diary?';
  const button = attrs.button || 'Get a quote';
  const href = attrs.href || '/hire/quote';
  const line = attrs.line ? `\n          <p>${esc(attrs.line)}</p>` : '';
  return `<section class="section-band" data-block="cta" aria-labelledby="cta-heading">
      <div class="cta-band shell">
        <div>
          <h2 id="cta-heading">${esc(heading)}</h2>${line}
        </div>
        <div class="cta-actions">
          <a href="${esc(href)}" class="btn btn-primary">${esc(button)}</a>
          <p class="cta-contact"><a href="tel:${SITE.phoneE164}">Call ${SITE.phoneDisplay}</a> · <a href="${SITE.whatsappUrl}" data-whatsapp target="_blank" rel="noopener">WhatsApp us</a></p>
        </div>
      </div>
    </section>`;
}

/* --------------------------------------------------------- service level */

/** The Standard/Premium choice on the quote form. Nothing at all when Premium is off. */
function serviceLevel(): string {
  if (!PRICING.premiumEnabled) return '';
  return `<fieldset class="form-field" id="serviceLevelField">
          <legend>Service level</legend>
          <div class="checkbox-grid">
            <div class="checkbox-item">
              <input type="radio" id="levelStandard" name="serviceLevel" value="standard" checked>
              <label for="levelStandard">Standard, ${formatRate(PRICING.standardRate)}/hr</label>
            </div>
            <div class="checkbox-item">
              <input type="radio" id="levelPremium" name="serviceLevel" value="premium" aria-describedby="premiumHint">
              <label for="levelPremium">Premium, ${formatRate(PRICING.premiumRate)}/hr</label>
            </div>
          </div>
          <p class="form-hint" id="premiumHint">Premium: ${esc(SITE_TERMS.premiumDefinition)}</p>
        </fieldset>`;
}

/* ----------------------------------------------------------------- proof */

interface Testimonial {
  quote: string;
  name: string;
  context: string;
  source?: string;
  stars?: number;
  url?: string;
  featured?: boolean;
}
interface Proof {
  testimonials: Testimonial[];
  recentWork: Array<{ title: string; detail: string }>;
}

/** public/data/proof.json: the reviews and recent work, one entry each. */
function loadProof(): Proof {
  try {
    const file = path.join(process.cwd(), 'public', 'data', 'proof.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { testimonials: data.testimonials || [], recentWork: data.recentWork || [] };
  } catch {
    return { testimonials: [], recentWork: [] };
  }
}

function testimonialFigure(t: Testimonial): string {
  const stars = t.stars
    ? `\n          <p class="testimonial-stars" role="img" aria-label="Rated ${t.stars} out of 5 stars">${'&#9733;'.repeat(t.stars)}</p>`
    : '';
  return `<figure class="testimonial">${stars}
          <blockquote><p>${esc(t.quote)}</p></blockquote>
          <figcaption>${esc(t.name)}, ${esc(t.context)}</figcaption>
        </figure>`;
}

/** featured="1" shows only the featured review (the homepage); otherwise all of them. */
function testimonials(attrs: PartialAttrs): string {
  const all = loadProof().testimonials;
  const list = attrs.featured ? all.filter((t) => t.featured).slice(0, 1) : all;
  if (!list.length) return '';
  const google = SITE.googleReviewsUrl
    ? `\n      <a class="testimonials-more" href="${SITE.googleReviewsUrl}" target="_blank" rel="noopener">Read our Google reviews &rarr;</a>`
    : '';
  return `<section class="section shell" aria-labelledby="testimonials-heading">
      <h2 id="testimonials-heading" class="section-label">What clients say</h2>
      <div class="testimonials">
        ${list.map(testimonialFigure).join('\n        ')}
      </div>${google}
    </section>`;
}

function recentWork(): string {
  const items = loadProof().recentWork;
  if (!items.length) return '';
  return `<section class="section shell" aria-labelledby="recentwork-heading">
      <h2 id="recentwork-heading" class="section-label">Recent work</h2>
      <ul class="fact-list">
        ${items.map((w) => `<li><strong>${esc(w.title)}</strong>: ${esc(w.detail)}</li>`).join('\n        ')}
      </ul>
    </section>`;
}

/* ----------------------------------------------------------------- legal */

/** "Registered with the ICO…", only once the number is in content.ts. */
function legalIco(): string {
  const n = SITE.legal.icoRegistrationNumber;
  return n ? `<p>Vergo Ltd is registered with the Information Commissioner's Office, registration number ${esc(n)}.</p>` : '';
}

/** Insurer and policy lines, only once they are in content.ts. */
function legalInsurers(): string {
  const lines = [
    SITE.legal.employersLiabilityInsurer && `Employers' liability: ${SITE.legal.employersLiabilityInsurer}`,
    SITE.legal.publicLiabilityInsurer && `Public liability: ${SITE.legal.publicLiabilityInsurer}`,
  ].filter(Boolean) as string[];
  return lines.length ? `<ul class="check-list">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : '';
}

export const PARTIALS: Record<string, (attrs: PartialAttrs, ctx: PageContext) => string> = {
  testimonials,
  'recent-work': recentWork,
  'legal-ico': legalIco,
  'legal-insurers': legalInsurers,
  'service-level': serviceLevel,
  head,
  header,
  footer,
  rates,
  guarantees,
  'working-with-us': workingWithUs,
  cta,
};
