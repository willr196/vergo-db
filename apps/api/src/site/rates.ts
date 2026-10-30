import { z } from 'zod';
import { PRICING } from '../config/pricing';

/**
 * The rate card as the admin edits it: one Rate row per role, money in whole
 * pence. PRICING stays the one typed way code reads a rate (in pounds, as the
 * calculator and Ops expect); applyRates() lays these rows over it.
 *
 * The core rates are the ones the pages, the quote form and Ops are built
 * around. They're always hourly, public and active, and can't be deleted or
 * renamed; their amounts are edited like any other. Every other rate is the
 * admin's: "santa" at £45/hr, or a quote-only role with no figure.
 */

export type RateUnit = 'hour' | 'day' | 'quote';
export type RateCategory = 'standard' | 'seasonal' | 'specialist';
export type RateVisibility = 'public' | 'quote_only';

export interface RateContent {
  id?: string;
  key: string;
  label: string;
  /** Null when the unit is "quote". */
  amountPence: number | null;
  unit: RateUnit;
  category: RateCategory;
  visibility: RateVisibility;
  active: boolean;
  sortOrder: number;
}

/** The worker pay floor, in pence: an hourly charge rate below it can't be right. */
export const MIN_RATE_PENCE = 1271;
export const MAX_HOURLY_PENCE = 10_000;
export const MAX_DAILY_PENCE = 200_000;

type CoreKey = 'standard' | 'premium' | 'themed_hospitality' | 'character_performer' | 'santa_claus' | 'makeup_artist' | 'face_painting' | 'event_chef';

/** Core rate key -> how it reads and writes PRICING (pounds). */
const CORE: Record<CoreKey, { get: () => number; set: (pounds: number) => void }> = {
  standard: { get: () => PRICING.standardRate, set: (v) => { PRICING.standardRate = v; } },
  premium: { get: () => PRICING.premiumRate, set: (v) => { PRICING.premiumRate = v; } },
  themed_hospitality: { get: () => PRICING.specialEvents.themedHospitality, set: (v) => { PRICING.specialEvents.themedHospitality = v; } },
  character_performer: { get: () => PRICING.specialEvents.characterPerformer, set: (v) => { PRICING.specialEvents.characterPerformer = v; } },
  santa_claus: { get: () => PRICING.specialEvents.santa, set: (v) => { PRICING.specialEvents.santa = v; } },
  makeup_artist: { get: () => PRICING.specialEvents.makeupArtist, set: (v) => { PRICING.specialEvents.makeupArtist = v; } },
  face_painting: { get: () => PRICING.specialEvents.facePainting, set: (v) => { PRICING.specialEvents.facePainting = v; } },
  event_chef: { get: () => PRICING.chefFromRate, set: (v) => { PRICING.chefFromRate = v; } },
};
export const CORE_KEYS = Object.keys(CORE) as CoreKey[];

export function isCoreKey(key: string): key is CoreKey {
  return key in CORE;
}

/** Pounds to whole pence without float drift: 19.5 -> 1950. */
export function toPence(pounds: number): number {
  return Math.round(Number(pounds.toFixed(2)) * 100);
}

// Captured before anything is laid over PRICING.
const DEFAULT_PENCE = Object.fromEntries(CORE_KEYS.map((k) => [k, toPence(CORE[k].get())])) as Record<CoreKey, number>;

/** Today's rate card: what the seed writes and what the site serves before it. */
export function defaultRates(): RateContent[] {
  const row = (key: CoreKey, label: string, category: RateCategory, sortOrder: number): RateContent => ({
    key, label, amountPence: DEFAULT_PENCE[key], unit: 'hour', category, visibility: 'public', active: true, sortOrder,
  });
  return [
    row('standard', 'Standard (waiting, bar, kitchen porters, runners, hosts)', 'standard', 0),
    row('premium', 'Premium (2+ years\' event experience)', 'standard', 1),
    row('themed_hospitality', 'Elves and festive hosts', 'seasonal', 2),
    row('character_performer', 'Carollers (per singer)', 'seasonal', 3),
    row('santa_claus', 'Santa and Mrs Claus', 'seasonal', 4),
    row('makeup_artist', 'Makeup artists', 'specialist', 5),
    row('face_painting', 'Face painting', 'specialist', 6),
    row('event_chef', 'Event chefs (from)', 'specialist', 7),
  ];
}

/** What a save must satisfy. Core rows get the extra checks in coreProblems(). */
export const rateBody = z
  .object({
    key: z.string().trim().regex(/^[a-z][a-z0-9_]{1,49}$/, 'lowercase letters, numbers and underscores, e.g. santa'),
    label: z.string().trim().min(1).max(120),
    amountPence: z.number().int().nullable().optional(),
    unit: z.enum(['hour', 'day', 'quote']),
    category: z.enum(['standard', 'seasonal', 'specialist']),
    visibility: z.enum(['public', 'quote_only']),
    active: z.boolean().default(true),
  })
  .superRefine((r, ctx) => {
    const amount = r.amountPence ?? null;
    if (r.unit === 'quote') {
      if (amount !== null) ctx.addIssue({ code: 'custom', path: ['amountPence'], message: 'a quoted role has no amount' });
      return;
    }
    const max = r.unit === 'day' ? MAX_DAILY_PENCE : MAX_HOURLY_PENCE;
    if (amount === null) ctx.addIssue({ code: 'custom', path: ['amountPence'], message: 'is required' });
    else if (amount < MIN_RATE_PENCE || amount > max) {
      ctx.addIssue({ code: 'custom', path: ['amountPence'], message: `must be between £${(MIN_RATE_PENCE / 100).toFixed(2)} and £${(max / 100).toFixed(2)}` });
    }
  });

/** Why a save to a core rate is refused, if it is. */
export function coreProblems(key: string, r: z.infer<typeof rateBody>): string | null {
  if (!isCoreKey(key)) return null;
  if (r.key !== key) return 'This rate is used across the site, so its key can\'t change.';
  if (r.unit !== 'hour' || r.visibility !== 'public' || !r.active) {
    return 'This rate is used across the site: it stays hourly, public and active. Change its amount instead.';
  }
  return null;
}

let applied: RateContent[] = defaultRates();

/**
 * Lays the rate card over PRICING in place. A core rate missing from the rows,
 * or one without a valid amount, keeps its default, so a bad row can't take a
 * price off the site.
 */
export function applyRates(rows: RateContent[]): void {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  for (const key of CORE_KEYS) {
    const r = byKey.get(key);
    const pence = r && r.unit === 'hour' && typeof r.amountPence === 'number' && r.amountPence >= MIN_RATE_PENCE && r.amountPence <= MAX_HOURLY_PENCE
      ? r.amountPence
      : DEFAULT_PENCE[key];
    CORE[key].set(pence / 100);
  }
  applied = [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Active, public rates with a figure, in order: what the site and the public API may show. */
export function publicRates(): RateContent[] {
  return applied.filter((r) => r.active && r.visibility === 'public' && r.unit !== 'quote' && r.amountPence !== null);
}

function wholePounds(pence: number): string {
  return pence % 100 === 0 ? `£${pence / 100}` : `£${(pence / 100).toFixed(2)}`;
}

/** {{RATE_SANTA}} -> "£45", {{RATE_SANTA_NUMBER}} -> "45.00", one pair per public rate. */
export function rateTokens(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of publicRates()) {
    const name = `RATE_${r.key.toUpperCase()}`;
    out[name] = wholePounds(r.amountPence as number) + (r.unit === 'day' ? ' a day' : '');
    out[`${name}_NUMBER`] = ((r.amountPence as number) / 100).toFixed(2);
  }
  return out;
}

/** The public API's list: never a quote-only or inactive rate. */
export function publicRateList() {
  return publicRates().map((r) => ({
    key: r.key,
    label: r.label,
    amountPence: r.amountPence,
    amount: (r.amountPence as number) / 100,
    unit: r.unit,
    category: r.category,
  }));
}
