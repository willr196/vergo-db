import { PRICING, SITE_TERMS, formatRate, headlineRateText } from '../config/pricing';

/**
 * Who we are and how to reach us. Rates and terms live in config/pricing.ts;
 * this holds everything else a public page repeats. Leave a value empty and
 * the sentence that would carry it is dropped, never printed as a gap.
 */
export const SITE = {
  brand: 'VERGO Staffing',
  legalName: 'Vergo Ltd',
  companyNumber: '16627585',
  jurisdiction: 'England and Wales',
  registeredOffice: '96 Sulivan Court, London, SW6 3DB',
  founderName: 'Will Robb',
  /** Switch to hello@vergoltd.com once that mailbox exists. */
  publicEmail: 'wrobb@vergoltd.com',
  /** jobs@vergoltd.com once it exists; empty means applicants use publicEmail. */
  jobsEmail: '',
  phoneDisplay: '07944 505783',
  phoneE164: '+447944505783',
  whatsappUrl: 'https://wa.me/447944505783',
  instagram: 'https://www.instagram.com/vergo.ltd/',
  instagramHandle: '@vergo.ltd',
  /** The Google Business Profile review link. Empty hides every Google link. */
  googleReviewsUrl: 'https://share.google/ej5Ce91xOfUCqbyfp',
  slogan: 'Whatever the job, we get it done.',
  themeColor: '#FAF8F4',
  canonicalRoles: [
    'Waiting staff',
    'Bar staff',
    'Kitchen porters',
    'Runners',
    'Hosts and front of house',
    'Chefs and cooks',
  ],
  legal: {
    /** Empty removes the "registered with the ICO" sentence. */
    icoRegistrationNumber: '',
    employersLiabilityInsurer: '',
    publicLiabilityInsurer: '',
    transferExtendedHireWeeks: 8,
    transferFee: "15% of the worker's gross pay for their first year with you",
    liabilityCap: 'the total charges for the booking concerned',
  },
} as const;

export function jobsEmail(): string {
  return SITE.jobsEmail || SITE.publicEmail;
}

function wholePounds(value: number): string {
  return Number.isInteger(value) ? `£${value}` : formatRate(value);
}

/**
 * Every {{TOKEN}} a page may use, and what it becomes. The HTML on disk
 * carries the token; the page that ships carries the value, so search engines
 * and visitors without JavaScript see the real figure.
 */
export function siteTokens(): Record<string, string> {
  const upliftPct = Math.round((PRICING.afterMidnightMultiplier - 1) * 100);
  return {
    STANDARD_RATE: formatRate(PRICING.standardRate),
    PREMIUM_RATE: formatRate(PRICING.premiumRate),
    HEADLINE_RATE: headlineRateText(),
    HEADLINE_RATE_LOWER: headlineRateText().replace(/^From/, 'from'),
    PREMIUM_DEFINITION: SITE_TERMS.premiumDefinition,
    MIN_HOURS: String(PRICING.minimumChargeHours),
    OVERRUN_MINUTES: String(PRICING.overrunBlockMinutes),
    UPLIFT_PCT: String(upliftPct),
    SENIOR_ROLES: SITE_TERMS.seniorRolesQuoted,
    PAYMENT_TERMS: SITE_TERMS.paymentTerms,
    CANCELLATION: SITE_TERMS.cancellation,
    CONFIRMATION_PROMISE: SITE_TERMS.confirmationPromise,
    NO_SHOW_PROMISE: SITE_TERMS.noShowPromise + SITE_TERMS.noShowExtra,
    FAVOURITES_PROMISE: SITE_TERMS.favouritesPromise,
    EMPLOYMENT_SHORT: SITE_TERMS.employmentShort,
    EMPLOYMENT_LINE: SITE_TERMS.employmentLine,
    WORKER_PAY_LINE: SITE_TERMS.workerPayLine,
    THEMED_RATE: wholePounds(PRICING.specialEvents.themedHospitality),
    PERFORMER_RATE: wholePounds(PRICING.specialEvents.characterPerformer),
    MAKEUP_RATE: wholePounds(PRICING.specialEvents.makeupArtist),
    PHONE: SITE.phoneDisplay,
    PHONE_TEL: `tel:${SITE.phoneE164}`,
    PHONE_E164: SITE.phoneE164,
    WHATSAPP_URL: SITE.whatsappUrl,
    EMAIL: SITE.publicEmail,
    JOBS_EMAIL: jobsEmail(),
    SLOGAN: SITE.slogan,
    FOUNDER_NAME: SITE.founderName,
    LEGAL_NAME: SITE.legalName,
    COMPANY_NUMBER: SITE.companyNumber,
    REGISTERED_OFFICE: SITE.registeredOffice,
    INSTAGRAM_URL: SITE.instagram,
    THEME_COLOR: SITE.themeColor,
    TRANSFER_WEEKS: String(SITE.legal.transferExtendedHireWeeks),
    TRANSFER_FEE: SITE.legal.transferFee,
    LIABILITY_CAP: SITE.legal.liabilityCap,
  };
}
