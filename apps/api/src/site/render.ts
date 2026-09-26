import { PRICING, SITE_TERMS, headlineRateText } from '../config/pricing';
import { SITE, jobsEmail, siteTokens } from './content';
import { PARTIALS, PageContext, PartialAttrs } from './partials';

const MARKER = /<!--#([\w-]+)((?:\s+[\w-]+="[^"]*")*)\s*-->/g;
const ATTR = /([\w-]+)="([^"]*)"/g;
const TOKEN = /\{\{([A-Z0-9_]+)\}\}/g;

/** The clean URL a file in public/ is served at: "hire/quote.html" -> "/hire/quote". */
export function pagePathFor(relFile: string): string {
  const clean = relFile.split('\\').join('/').replace(/\.html$/, '').replace(/(^|\/)index$/, '');
  return '/' + clean.replace(/^\/+/, '');
}

/**
 * Fills a page's shared blocks and {{TOKENS}}. Blocks go first, because a
 * block may itself carry tokens. A token with no value is left in place so the
 * consistency test can find it, rather than silently printing nothing.
 */
export function renderSiteHtml(source: string, ctx: PageContext): string {
  const tokens = siteTokens();
  return source
    .replace(MARKER, (match, name: string, rawAttrs: string) => {
      const partial = PARTIALS[name];
      if (!partial) return match;
      const attrs: PartialAttrs = {};
      for (const m of rawAttrs.matchAll(ATTR)) attrs[m[1]] = m[2];
      return partial(attrs, ctx);
    })
    .replace(TOKEN, (match, key: string) => (key in tokens ? tokens[key] : match));
}

/**
 * The browser's copy of the rate card and contact details, built from the
 * same config the pages are rendered from. Served at /vergo-site-config.js, so
 * there is no second hand-edited copy to fall out of step.
 */
export function siteConfigScript(): string {
  const config = {
    company: {
      legalName: SITE.legalName,
      number: SITE.companyNumber,
      jurisdiction: SITE.jurisdiction,
      registeredOffice: SITE.registeredOffice,
    },
    contact: {
      phone: SITE.phoneE164,
      phoneDisplay: SITE.phoneDisplay,
      email: SITE.publicEmail,
      jobsEmail: jobsEmail(),
      whatsappUrl: SITE.whatsappUrl,
    },
    social: { instagram: SITE.instagram, instagramHandle: SITE.instagramHandle },
    reviews: { google: SITE.googleReviewsUrl },
    rates: {
      standardRate: PRICING.standardRate,
      premiumEnabled: PRICING.premiumEnabled,
      premiumRate: PRICING.premiumEnabled ? PRICING.premiumRate : null,
      premiumDefinition: SITE_TERMS.premiumDefinition,
      headlineRateText: headlineRateText(),
      minimumHours: PRICING.minimumChargeHours,
      overrunBlockMinutes: PRICING.overrunBlockMinutes,
      afterMidnightMultiplier: PRICING.afterMidnightMultiplier,
    },
    specialEvents: {
      themedHospitality: PRICING.specialEvents.themedHospitality,
      characterPerformer: PRICING.specialEvents.characterPerformer,
      makeupArtist: PRICING.specialEvents.makeupArtist,
      minimumHours: PRICING.specialEvents.minimumChargeHours,
    },
    terms: {
      confirmationPromise: SITE_TERMS.confirmationPromise,
      paymentTerms: SITE_TERMS.paymentTerms,
    },
    forms: {
      quoteEndpoint: '/api/v1/quotes',
      applicationsEndpoint: '/api/v1/applications',
      applicationsPresignEndpoint: '/api/v1/applications/presign',
      applicationsVerifyUploadEndpoint: '/api/v1/applications/verify-upload',
      applicationsDirectUploadEndpoint: '/api/v1/applications/direct-upload',
    },
  };

  return `/* Generated from apps/api/src/config/pricing.ts and src/site/content.ts. Do not edit. */
(function () {
  'use strict';
  window.VERGO_CONFIG = ${JSON.stringify(config, null, 2)};
})();
`;
}
