/**
 * Booking money math. Pure functions, no database access, so the same
 * numbers come out everywhere they're needed and there's exactly one place
 * to fix if the arithmetic is ever wrong.
 *
 * All money in and out of this module is whole pence (Int). Convert once at
 * the boundary (Prisma Decimal -> pence) and never do float arithmetic on
 * money in between.
 */

import { ON_COSTS, PRICING } from '../config/pricing';

const CLOCK_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "07:00" -> 420 (minutes since midnight). Throws on anything not HH:MM, 24h clock. */
export function parseClock(value: string): number {
  const match = CLOCK_PATTERN.exec(value);
  if (!match) {
    throw new Error(`Invalid time "${value}" — expected 24-hour HH:MM`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Paid hours for one head. Handles shifts crossing midnight (end <= start
 * rolls over by 24h) and throws if the break is longer than the shift.
 */
export function shiftHours(startTime: string, endTime: string, breakMins = 0): number {
  const startMins = parseClock(startTime);
  let endMins = parseClock(endTime);
  if (endMins <= startMins) endMins += 24 * 60;

  const grossMins = endMins - startMins;
  if (breakMins < 0) {
    throw new Error('breakMins cannot be negative');
  }
  if (breakMins > grossMins) {
    throw new Error(`Break (${breakMins}m) cannot be longer than the shift (${grossMins}m)`);
  }

  return (grossMins - breakMins) / 60;
}

function roundPence(value: number): number {
  return Math.round(value);
}

export interface OnCostBreakdown {
  holidayPence: number;
  employerNiPence: number;
  pensionPence: number;
}

export interface BookingMoneyInput {
  /** Hours to bill/pay for. Use the final worked figure once known. */
  hours: number;
  hourlyRateChargedPence: number;
  /** Null if no staff pay rate has been set yet (e.g. unstaffed). */
  staffPayRatePence: number | null;
  /** From User.niLiable for the assigned staff member. */
  niLiable: boolean;
  /** From User.pensionEnrolled for the assigned staff member. */
  pensionEnrolled: boolean;
  /**
   * True while the figures are still an estimate — i.e. the booking hasn't
   * reached COMPLETED yet, so `hours` is the scheduled figure, not what was
   * actually worked. Drives BookingMoney.provisional so the UI can mark
   * these figures as estimates rather than presenting them as final.
   */
  provisional: boolean;
}

export interface BookingMoney {
  /** What was actually worked, or scheduled while provisional. */
  hours: number;
  /**
   * What both sides are settled on: `hours` floored at the four-hour minimum.
   * The minimum always applies, to the client's invoice and to the worker's
   * pay alike, so a three-hour shift is charged and paid as four.
   */
  billableHours: number;
  revenuePence: number;
  wagePence: number;
  onCostsPence: number;
  onCostBreakdown: OnCostBreakdown;
  grossMarginPence: number;
  netMarginPence: number;
  /** netMarginPence / revenuePence, or 0 when there's no revenue to divide by. */
  netMarginRate: number;
  provisional: boolean;
}

/**
 * On-costs are computed per assigned person, not as a flat percentage of
 * wage. Holiday accrual applies to every booking, always. Employer NI and
 * pension only bite once a person's earnings cross a threshold in the pay
 * period — casual staff doing one shift a month are nowhere near either —
 * so both are gated on that person's niLiable/pensionEnrolled flags rather
 * than computed from this booking's numbers alone. Where they apply, NI and
 * pension are charged on wage plus holiday pay, not wage alone.
 */
export function bookingMoney(input: BookingMoneyInput): BookingMoney {
  // The four-hour minimum applies to both sides. Charging it and not paying it
  // would mean billing for hours nobody is paid for, so the same floored figure
  // drives revenue and wage.
  const billableHours = Math.max(input.hours, PRICING.minimumChargeHours);
  const revenuePence = roundPence(input.hourlyRateChargedPence * billableHours);
  const wagePence = input.staffPayRatePence != null
    ? roundPence(input.staffPayRatePence * billableHours)
    : 0;

  const holidayPence = roundPence(wagePence * ON_COSTS.holidayAccrualRate);
  const niAndPensionBasePence = wagePence + holidayPence;
  const employerNiPence = input.niLiable
    ? roundPence(niAndPensionBasePence * ON_COSTS.employerNiRate)
    : 0;
  const pensionPence = input.pensionEnrolled
    ? roundPence(niAndPensionBasePence * ON_COSTS.employerPensionRate)
    : 0;
  const onCostsPence = holidayPence + employerNiPence + pensionPence;

  const grossMarginPence = revenuePence - wagePence;
  const netMarginPence = revenuePence - wagePence - onCostsPence;
  const netMarginRate = revenuePence > 0 ? netMarginPence / revenuePence : 0;

  return {
    hours: input.hours,
    billableHours,
    revenuePence,
    wagePence,
    onCostsPence,
    onCostBreakdown: { holidayPence, employerNiPence, pensionPence },
    grossMarginPence,
    netMarginPence,
    netMarginRate,
    provisional: input.provisional,
  };
}

export interface FloatRow {
  id: string;
  revenuePence: number;
  wagePence: number;
  onCostsPence: number;
  clientPaidAt: Date | null;
  staffPaidAt: Date | null;
  staffPayDueAt: Date | null;
}

export interface FloatPosition {
  /** Money in the bank from client payments not yet paid out to staff. */
  heldPence: number;
  /** The slice of heldPence already committed to wage + on-costs. */
  committedPence: number;
  /** heldPence - committedPence — what's genuinely free to spend. */
  freePence: number;
  /** Earliest staffPayDueAt among held bookings — when the float starts unwinding. */
  unwindsFrom: Date | null;
  /** Days from `now` to unwindsFrom. Null when nothing is held. Can be negative if overdue. */
  daysToUnwind: number | null;
}

/**
 * Bookings the client has paid for but staff haven't been paid for yet.
 * Bank balance overstates the real position by exactly this amount.
 */
export function floatPosition(rows: FloatRow[], now: Date = new Date()): FloatPosition {
  const held = rows.filter((row) => row.clientPaidAt != null && row.staffPaidAt == null);

  const heldPence = held.reduce((sum, row) => sum + row.revenuePence, 0);
  const committedPence = held.reduce((sum, row) => sum + row.wagePence + row.onCostsPence, 0);

  const dueDates = held
    .map((row) => row.staffPayDueAt)
    .filter((date): date is Date => date != null)
    .sort((a, b) => a.getTime() - b.getTime());
  const unwindsFrom = dueDates[0] ?? null;
  const daysToUnwind = unwindsFrom
    ? Math.ceil((unwindsFrom.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    : null;

  return {
    heldPence,
    committedPence,
    freePence: heldPence - committedPence,
    unwindsFrom,
    daysToUnwind,
  };
}
