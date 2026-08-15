/**
 * Sole source of truth for VERGO's PAYE staffing rates and VAT treatment.
 * No rate or VAT figure should be hardcoded outside this module.
 */

export const PRICING = {
  standardRate: 19.00,
  minimumChargeHours: 4,
  afterMidnightMultiplier: 1.25,
  /** Internal only — never render this on any public page. */
  accountRate: 19.00,
  vatRegistered: false,
  vatRate: 0.20,
} as const;

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
    minimumChargeHours: PRICING.minimumChargeHours,
    afterMidnightMultiplier: PRICING.afterMidnightMultiplier,
    vatRegistered: PRICING.vatRegistered,
    vatRate: PRICING.vatRate,
  };
}
