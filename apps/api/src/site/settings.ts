import { z } from 'zod';
import { PRICING, SITE_TERMS } from '../config/pricing';
import { SITE } from './content';

/**
 * The site settings an admin can change, one SiteSetting row per key. Each
 * key's value is validated here on write and again on read, and laid over the
 * built-in values in config/pricing.ts and site/content.ts. So pricing.ts
 * stays the one typed way to read a price: the quote calculator, the quote
 * endpoint, the pages and the tests all read PRICING, whatever set it.
 */

/** The worker pay floor the site quotes; a charge rate below it can't be right. */
export const MIN_RATE = 12.71;
const rate = z.number().min(MIN_RATE).max(100);
const line = (max: number) => z.string().trim().max(max);

export const SETTING_SCHEMAS = {
  rates: z.object({
    standardRate: rate,
    premiumEnabled: z.boolean(),
    premiumRate: rate,
    /** The after-midnight uplift, as a percentage: 25 means +25%. */
    afterMidnightUpliftPct: z.number().min(0).max(100),
    /** The New Year's Eve surcharge from 7pm, as a percentage. Defaulted so rows saved before it existed still parse. */
    newYearsEveUpliftPct: z.number().min(0).max(100).default(Math.round((PRICING.newYearsEveMultiplier - 1) * 100)),
    themedHospitality: rate,
    characterPerformer: rate,
    makeupArtist: rate,
  }).strict(),
  promises: z.object({
    confirmationPromise: line(200).min(1),
    noShowPromise: line(200).min(1),
    noShowExtra: line(120),
    guaranteeFootnote: line(200),
    favouritesPromise: line(200).min(1),
    premiumDefinition: line(200).min(1),
  }).strict(),
  contact: z.object({
    publicEmail: z.string().trim().email().max(200),
    jobsEmail: z.union([z.literal(''), z.string().trim().email().max(200)]),
    phoneDisplay: line(30).min(5),
    phoneE164: z.string().trim().regex(/^\+\d{8,15}$/),
    whatsappUrl: z.string().trim().url().max(200),
    instagram: z.union([z.literal(''), z.string().trim().url().max(200)]),
    instagramHandle: line(60),
  }).strict(),
  terms: z.object({
    /** Also the minimum on booking charges in Ops, not only on the site. */
    minimumChargeHours: z.number().int().min(1).max(10),
    overrunBlockMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
    /** The hour (24-hour clock) on 31 December the New Year's Eve surcharge starts. */
    newYearsEveFromHour: z.number().int().min(12).max(23),
    cancellation: line(200).min(1),
    paymentTerms: line(200).min(1),
    seniorRolesQuoted: line(200).min(1),
  }).strict(),
  company: z.object({
    legalName: line(120).min(1),
    companyNumber: z.string().trim().regex(/^([0-9]{8}|[A-Z]{2}[0-9]{6})$/, 'eight digits, or two letters and six digits'),
    /** "Street, Town, Postcode": the structured data splits it on the commas. */
    registeredOffice: line(200).regex(/^[^,]+(,[^,]+){2,}$/, 'street, town and postcode, separated by commas'),
  }).strict(),
  brand: z.object({
    slogan: line(120).min(1),
    /** Empty hides every Google link. */
    googleReviewsUrl: z.union([z.literal(''), z.string().trim().url().max(300)]),
  }).strict(),
};

export type SettingKey = keyof typeof SETTING_SCHEMAS;
export type SiteSettings = { [K in SettingKey]: z.infer<(typeof SETTING_SCHEMAS)[K]> };
export const SETTING_KEYS = Object.keys(SETTING_SCHEMAS) as SettingKey[];

// The built-in values, captured before anything is laid over them.
const DEFAULT_PRICING = structuredClone(PRICING);
const DEFAULT_TERMS = structuredClone(SITE_TERMS);
const DEFAULT_SITE = structuredClone(SITE);

/** Today's values, as settings: what the seed writes and what a missing or bad row falls back to. */
export function defaultSettings(): SiteSettings {
  return {
    rates: {
      standardRate: DEFAULT_PRICING.standardRate,
      premiumEnabled: DEFAULT_PRICING.premiumEnabled,
      premiumRate: DEFAULT_PRICING.premiumRate,
      afterMidnightUpliftPct: Math.round((DEFAULT_PRICING.afterMidnightMultiplier - 1) * 100),
      newYearsEveUpliftPct: Math.round((DEFAULT_PRICING.newYearsEveMultiplier - 1) * 100),
      themedHospitality: DEFAULT_PRICING.specialEvents.themedHospitality,
      characterPerformer: DEFAULT_PRICING.specialEvents.characterPerformer,
      makeupArtist: DEFAULT_PRICING.specialEvents.makeupArtist,
    },
    promises: {
      confirmationPromise: DEFAULT_TERMS.confirmationPromise,
      noShowPromise: DEFAULT_TERMS.noShowPromise,
      noShowExtra: DEFAULT_TERMS.noShowExtra,
      guaranteeFootnote: DEFAULT_TERMS.guaranteeFootnote,
      favouritesPromise: DEFAULT_TERMS.favouritesPromise,
      premiumDefinition: DEFAULT_TERMS.premiumDefinition,
    },
    contact: {
      publicEmail: DEFAULT_SITE.publicEmail,
      jobsEmail: DEFAULT_SITE.jobsEmail,
      phoneDisplay: DEFAULT_SITE.phoneDisplay,
      phoneE164: DEFAULT_SITE.phoneE164,
      whatsappUrl: DEFAULT_SITE.whatsappUrl,
      instagram: DEFAULT_SITE.instagram,
      instagramHandle: DEFAULT_SITE.instagramHandle,
    },
    terms: {
      minimumChargeHours: DEFAULT_PRICING.minimumChargeHours,
      overrunBlockMinutes: DEFAULT_PRICING.overrunBlockMinutes as 15 | 30 | 60,
      newYearsEveFromHour: DEFAULT_PRICING.newYearsEveFromHour,
      cancellation: DEFAULT_TERMS.cancellation,
      paymentTerms: DEFAULT_TERMS.paymentTerms,
      seniorRolesQuoted: DEFAULT_TERMS.seniorRolesQuoted,
    },
    company: {
      legalName: DEFAULT_SITE.legalName,
      companyNumber: DEFAULT_SITE.companyNumber,
      registeredOffice: DEFAULT_SITE.registeredOffice,
    },
    brand: {
      slogan: DEFAULT_SITE.slogan,
      googleReviewsUrl: DEFAULT_SITE.googleReviewsUrl,
    },
  };
}

/**
 * Settings from the database, one row per key. A key that is missing or fails
 * validation keeps its default, so one bad row can't take a price off the site.
 */
export function parseSettings(rows: Array<{ key: string; value: unknown }>): SiteSettings {
  const settings = defaultSettings();
  for (const row of rows) {
    if (!(row.key in SETTING_SCHEMAS)) continue;
    const key = row.key as SettingKey;
    const parsed = SETTING_SCHEMAS[key].safeParse(row.value);
    if (parsed.success) (settings as Record<SettingKey, unknown>)[key] = parsed.data;
  }
  return settings;
}

/** Lays settings over PRICING, SITE_TERMS and SITE in place, so every reader sees them at once. */
export function applySettings(s: SiteSettings): void {
  PRICING.standardRate = s.rates.standardRate;
  PRICING.premiumEnabled = s.rates.premiumEnabled;
  PRICING.premiumRate = s.rates.premiumRate;
  PRICING.afterMidnightMultiplier = 1 + s.rates.afterMidnightUpliftPct / 100;
  PRICING.newYearsEveMultiplier = 1 + s.rates.newYearsEveUpliftPct / 100;
  PRICING.specialEvents.themedHospitality = s.rates.themedHospitality;
  PRICING.specialEvents.characterPerformer = s.rates.characterPerformer;
  PRICING.specialEvents.makeupArtist = s.rates.makeupArtist;

  PRICING.minimumChargeHours = s.terms.minimumChargeHours;
  // Hourly special-events roles carry the site-wide minimum.
  PRICING.specialEvents.minimumChargeHours = s.terms.minimumChargeHours;
  PRICING.overrunBlockMinutes = s.terms.overrunBlockMinutes;
  PRICING.newYearsEveFromHour = s.terms.newYearsEveFromHour;

  Object.assign(SITE_TERMS, s.promises, {
    cancellation: s.terms.cancellation,
    paymentTerms: s.terms.paymentTerms,
    seniorRolesQuoted: s.terms.seniorRolesQuoted,
  });
  Object.assign(SITE, s.contact, s.company, s.brand);
}
