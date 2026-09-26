/**
 * Sole source of truth for VERGO's rates, booking terms and guarantees.
 * No rate, VAT figure, promise or term should be hardcoded outside this module:
 * the public pages get them through src/site/content.ts, which fills the
 * {{TOKENS}} and shared blocks in every page as it is served, and the browser
 * gets them through the generated /vergo-site-config.js.
 */

export const PRICING = {
  /** Waiting staff, bar staff, kitchen porters, runners, hosts and front of house. */
  standardRate: 18.50,
  /**
   * The Premium pool: staff with 2+ years' event experience. Chosen for the
   * whole booking on the quote form. Set premiumEnabled to false to drop the
   * Premium line, card and calculator choice from every page at once.
   */
  premiumEnabled: true,
  premiumRate: 24.00,
  minimumChargeHours: 4,
  /** Time past the booked hours is billed in blocks of this many minutes. */
  overrunBlockMinutes: 30,
  /** Applies to the hours worked after midnight, not to the whole shift. */
  afterMidnightMultiplier: 1.25,
  /** Internal only — never render this on any public page. */
  accountRate: 18.50,
  vatRegistered: false,
  vatRate: 0.20,

  /**
   * Special Events charge rates, in £/hour per person. These are separate roles
   * rather than a premium on standardRate: a scare actor is cast for the booking,
   * not rostered onto it, and is paid against a different market. Everything
   * beyond these three — specialist acts, decor, a whole experience — is quoted
   * per brief and deliberately has no figure here.
   *
   * Rendered on /special-events/halloween via VERGO_CONFIG.specialEvents, which
   * hydrates from /api/v1/rates. The page carries the same figures as static
   * fallbacks so the rates are in the HTML for search engines and for anyone
   * without JavaScript — change a rate here and change it there in the same commit.
   */
  specialEvents: {
    themedHospitality: 22.00,
    characterPerformer: 30.00,
    makeupArtist: 40.00,
    /** Hourly special-events roles carry the site-wide four-hour minimum. */
    minimumChargeHours: 4,
  },
} as const;

/**
 * Employer on-costs used by src/lib/money.ts booking margin calculations.
 * All staff are PAYE — there is no self-employed engagement type.
 */
export const ON_COSTS = {
  /** Statutory holiday accrual — exact, applies to every booking's wage. */
  holidayAccrualRate: 0.1207,
  /**
   * Employer NI rate above the secondary threshold, gated per-person via
   * User.niLiable since threshold status depends on a person's total
   * earnings across the pay period, which isn't tracked here.
   * NOT VERIFIED — confirm against HMRC rates for the current tax year
   * before relying on this for real invoicing.
   */
  employerNiRate: 0.138,
  /**
   * Employer minimum auto-enrolment pension contribution on qualifying
   * earnings, gated per-person via User.pensionEnrolled.
   * NOT VERIFIED — confirm against the current scheme rules before relying
   * on this for real invoicing.
   */
  employerPensionRate: 0.03,
} as const;

/**
 * The wording that has to read the same on every page, in the Terms, the blog
 * and the calculator. Pages pull these through {{TOKENS}}; the consistency test
 * fails any page that carries its own copy.
 */
export const SITE_TERMS = {
  premiumDefinition: "2+ years' event experience. Silver service, cocktails, weddings, high-end corporate.",
  seniorRolesQuoted: 'Chefs and managers quoted separately.',
  paymentTerms: 'First booking paid upfront, then 14 days.',
  cancellation: 'Free 48h+ before. 10% within 48h, 25% within 24h.',
  confirmationPromise: 'Enquire by 6pm, get confirmed names the same day. After 6pm, by 10am.',
  noShowPromise: 'Replacement on site within an hour. You never pay for time nobody worked. No replacement, no charge for that shift.',
  /** Appended to noShowPromise, e.g. " Plus 10% off the booking." Empty for none. */
  noShowExtra: '',
  /** A line under the guarantee block. Empty for none. */
  guaranteeFootnote: '',
  favouritesPromise: "Ask for staff you liked by name. Anyone who wasn't right won't be sent again.",
  /** Marketing pages. */
  employmentShort: 'Hospitality staff employed by us on PAYE.',
  /** Terms §6 and the blog FAQ only. */
  employmentLine: 'Our hospitality staff are employed by us on PAYE, with payslips, holiday pay and a pension where it applies. Some specialist roles (chefs, cooks, performers and makeup artists) may be self-employed, and we confirm this in writing when you book.',
  workerPayLine: 'From £12.71/hr plus 12.07% holiday pay. More with experience.',
} as const;

/** "£18.50" — rates always show pence, so £24.00 and £18.50 line up. */
export function formatRate(value: number): string {
  return `£${value.toFixed(2)}`;
}

/** "From £18.50/hr" while there is a Premium rate above it, "£18.50/hr" otherwise. */
export function headlineRateText(): string {
  const rate = `${formatRate(PRICING.standardRate)}/hr`;
  return PRICING.premiumEnabled ? `From ${rate}` : rate;
}

export type ServiceLevel = 'standard' | 'premium';

export interface ShiftQuoteInput {
  /** "HH:MM", 24-hour. */
  start: string;
  end: string;
  /** The shift finishes the day after it starts. */
  finishesNextDay?: boolean;
  level?: ServiceLevel;
  /** People per role. Senior roles are listed but priced outside the total. */
  staff: Array<{ role: string; count: number; senior?: boolean }>;
}

export interface ShiftQuote {
  rate: number;
  workedMinutes: number;
  /** Per person, after the minimum and the overrun blocks. */
  billedMinutes: number;
  /** Of billedMinutes, how many fall after midnight and carry the uplift. */
  afterMidnightMinutes: number;
  pricedPeople: number;
  seniorPeople: number;
  /** people × billed hours × rate, before the uplift. */
  base: number;
  /** The extra 25% on the after-midnight hours. */
  uplift: number;
  total: number;
}

function clockMinutes(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return minutes >= 0 && minutes < 24 * 60 ? minutes : null;
}

/**
 * Prices one shift the way the quote form shows it. Per person: the shift is
 * billed for at least minimumChargeHours, otherwise rounded up to the next
 * overrun block. Hours worked after midnight carry the uplift; the minimum's
 * padding does not. Senior roles are left out of the figure.
 *
 * public/pages/js/quote-calc.js is the browser copy of this function; the
 * pricing tests run both over the same cases so they cannot drift.
 */
export function quoteShift(input: ShiftQuoteInput): ShiftQuote | null {
  const start = clockMinutes(input.start);
  const endClock = clockMinutes(input.end);
  if (start === null || endClock === null) return null;
  const end = endClock + (input.finishesNextDay ? 24 * 60 : 0);
  const workedMinutes = end - start;
  if (workedMinutes <= 0) return null;

  const block = PRICING.overrunBlockMinutes;
  const roundUp = (minutes: number) => Math.ceil(minutes / block) * block;
  const billedMinutes = Math.max(PRICING.minimumChargeHours * 60, roundUp(workedMinutes));
  const afterMidnightMinutes = Math.min(billedMinutes, roundUp(Math.max(0, end - 24 * 60)));

  const level = PRICING.premiumEnabled && input.level === 'premium' ? 'premium' : 'standard';
  const rate = level === 'premium' ? PRICING.premiumRate : PRICING.standardRate;
  const pricedPeople = input.staff.filter((s) => !s.senior).reduce((n, s) => n + Math.max(0, s.count), 0);
  const seniorPeople = input.staff.filter((s) => s.senior).reduce((n, s) => n + Math.max(0, s.count), 0);

  const base = round2(pricedPeople * (billedMinutes / 60) * rate);
  const uplift = round2(pricedPeople * (afterMidnightMinutes / 60) * rate * (PRICING.afterMidnightMultiplier - 1));
  return {
    rate,
    workedMinutes,
    billedMinutes,
    afterMidnightMinutes,
    pricedPeople,
    seniorPeople,
    base,
    uplift,
    total: round2(base + uplift),
  };
}

export interface VatBreakdown {
  net: number;
  vat: number;
  gross: number;
}

/** Rounds to pence to avoid floating-point drift in displayed money values. */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface ChargeInput {
  headcount: number;
  hoursPerPerson: number;
  afterMidnight?: boolean;
}

export interface ChargeResult {
  hourlyRate: number;
  billedHoursPerPerson: number;
  net: VatBreakdown;
}

/**
 * Computes the charge for a booking: applies the minimum-hours floor per person
 * and the after-midnight multiplier, then the VAT breakdown driven by vatRegistered.
 */
export function calculateCharge({ headcount, hoursPerPerson, afterMidnight = false }: ChargeInput): ChargeResult {
  const hourlyRate = PRICING.standardRate;
  const billedHoursPerPerson = Math.max(hoursPerPerson, PRICING.minimumChargeHours);
  const effectiveRate = afterMidnight ? hourlyRate * PRICING.afterMidnightMultiplier : hourlyRate;
  const netTotal = round2(effectiveRate * billedHoursPerPerson * headcount);

  return {
    hourlyRate,
    billedHoursPerPerson,
    net: getVatBreakdown(netTotal),
  };
}

/**
 * VAT is driven entirely by PRICING.vatRegistered. Flipping that flag is the
 * only change needed to switch every quote/invoice between net-only and
 * net+VAT+gross display.
 */
export function getVatBreakdown(net: number): VatBreakdown {
  const roundedNet = round2(net);
  if (!PRICING.vatRegistered) {
    return { net: roundedNet, vat: 0, gross: roundedNet };
  }
  const vat = round2(roundedNet * PRICING.vatRate);
  return { net: roundedNet, vat, gross: round2(roundedNet + vat) };
}

/** Formats a net amount as a display string, appending "+ VAT" only when registered. */
export function formatPriceLine(net: number, currency = '£'): string {
  const amount = round2(net).toFixed(2).replace(/\.00$/, '');
  return PRICING.vatRegistered ? `${currency}${amount} + VAT` : `${currency}${amount}`;
}

/** Public-safe view of the rate card — never includes accountRate. */
export function getPublicRateCard() {
  return {
    standardRate: PRICING.standardRate,
    premiumEnabled: PRICING.premiumEnabled,
    premiumRate: PRICING.premiumEnabled ? PRICING.premiumRate : null,
    minimumChargeHours: PRICING.minimumChargeHours,
    overrunBlockMinutes: PRICING.overrunBlockMinutes,
    afterMidnightMultiplier: PRICING.afterMidnightMultiplier,
    vatRegistered: PRICING.vatRegistered,
    vatRate: PRICING.vatRate,
    holidayPayPercent: round2(ON_COSTS.holidayAccrualRate * 100),
    // Spread, not the frozen object itself, so callers cannot reach back into
    // PRICING through the returned card.
    specialEvents: { ...PRICING.specialEvents },
  };
}
