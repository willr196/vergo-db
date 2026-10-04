/**
 * Estimated contribution per Ops booking: what it brings in, what the workers
 * cost, what else it cost, and what is left.
 *
 * Whole pence throughout, like src/lib/money.ts, and the same rules: the
 * minimum applies to the client's charge and the worker's pay alike, holiday
 * pay is 12.07% of wages, and employer NI and pension are included only for
 * workers flagged as liable/enrolled, at the rates in ON_COSTS.
 *
 * These are ESTIMATES. They are not payroll and do not work out anyone's tax.
 * Once payroll has run, an admin can enter the actual wage, holiday and
 * employer-cost figures, which then replace the estimate line by line.
 */

import { ON_COSTS, PRICING } from '../config/pricing';

export interface ProfitAssignment {
  status: string;
  /** Worked hours net of breaks once known, otherwise the planned hours. */
  hours: number;
  /** True when `hours` is what was worked (completed or checked out). */
  hoursAreActual: boolean;
  minimumHours: number | null;
  clientRatePence: number;
  payRatePence: number;
  afterMidnightHours: number;
  afterMidnightMultiplier: number | null;
  niLiable: boolean;
  pensionEnrolled: boolean;
  travelPence: number;
  expensesPence: number;
}

export interface ProfitExtra {
  kind: 'CHARGE' | 'COST';
  category: string;
  amountPence: number;
}

export interface ProfitActuals {
  wagesPence: number | null;
  holidayPayPence: number | null;
  employerCostsPence: number | null;
}

export interface BookingProfit {
  revenuePence: number;
  revenue: { hoursPence: number; afterMidnightPence: number; chargesPence: number };
  workerWagesPence: number;
  holidayPayPence: number;
  employerCostsPence: number;
  employerCosts: { niPence: number; pensionPence: number };
  workerTravelExpensesPence: number;
  otherWorkerCostsPence: number;
  otherDirectCostsPence: number;
  directLabourCostPence: number;
  grossContributionPence: number;
  /** Gross contribution / revenue, or null with no revenue. */
  grossMargin: number | null;
  billableHours: number;
  countedAssignments: number;
  /** True while any figure rests on planned hours or estimated payroll. */
  isEstimate: boolean;
  basis: { wages: 'estimate' | 'actual'; holidayPay: 'estimate' | 'actual'; employerCosts: 'estimate' | 'actual' };
}

/** Statuses whose shift is charged and paid. No-shows are not charged (the guarantee), declines and cancellations never happened. */
export const COUNTED_STATUSES = new Set(['PENDING', 'CONFIRMED', 'COMPLETED']);

/** Categories of booking cost that are a direct cost of the workers. */
export const WORKER_COST_CATEGORIES = new Set(['worker_other']);

const round = Math.round;

export function bookingProfit(
  assignments: ProfitAssignment[],
  extras: ProfitExtra[],
  actuals: ProfitActuals = { wagesPence: null, holidayPayPence: null, employerCostsPence: null }
): BookingProfit {
  let hoursPence = 0;
  let afterMidnightPence = 0;
  let wages = 0;
  let holiday = 0;
  let ni = 0;
  let pension = 0;
  let travel = 0;
  let billableHours = 0;
  let counted = 0;
  let allActual = true;

  for (const a of assignments) {
    if (!COUNTED_STATUSES.has(a.status)) continue;
    counted += 1;
    if (!a.hoursAreActual) allActual = false;

    const minimum = a.minimumHours ?? PRICING.minimumChargeHours;
    const billable = Math.max(a.hours, minimum);
    billableHours += billable;

    hoursPence += round(a.clientRatePence * billable);
    const multiplier = a.afterMidnightMultiplier ?? PRICING.afterMidnightMultiplier;
    afterMidnightPence += round(a.clientRatePence * Math.min(a.afterMidnightHours, billable) * (multiplier - 1));

    const wage = round(a.payRatePence * billable);
    const hol = round(wage * ON_COSTS.holidayAccrualRate);
    wages += wage;
    holiday += hol;
    if (a.niLiable) ni += round((wage + hol) * ON_COSTS.employerNiRate);
    if (a.pensionEnrolled) pension += round((wage + hol) * ON_COSTS.employerPensionRate);
    travel += a.travelPence + a.expensesPence;
  }

  const chargesPence = extras.filter((e) => e.kind === 'CHARGE').reduce((s, e) => s + e.amountPence, 0);
  const costs = extras.filter((e) => e.kind === 'COST');
  const otherWorker = costs.filter((e) => WORKER_COST_CATEGORIES.has(e.category)).reduce((s, e) => s + e.amountPence, 0);
  const otherDirect = costs.filter((e) => !WORKER_COST_CATEGORIES.has(e.category)).reduce((s, e) => s + e.amountPence, 0);

  const workerWagesPence = actuals.wagesPence ?? wages;
  const holidayPayPence = actuals.holidayPayPence ?? holiday;
  const employerCostsPence = actuals.employerCostsPence ?? ni + pension;
  const revenuePence = hoursPence + afterMidnightPence + chargesPence;
  const directLabourCostPence = workerWagesPence + holidayPayPence + employerCostsPence + travel + otherWorker;
  const grossContributionPence = revenuePence - directLabourCostPence - otherDirect;

  const basis = {
    wages: actuals.wagesPence != null ? 'actual' as const : 'estimate' as const,
    holidayPay: actuals.holidayPayPence != null ? 'actual' as const : 'estimate' as const,
    employerCosts: actuals.employerCostsPence != null ? 'actual' as const : 'estimate' as const,
  };

  return {
    revenuePence,
    revenue: { hoursPence, afterMidnightPence, chargesPence },
    workerWagesPence,
    holidayPayPence,
    employerCostsPence,
    employerCosts: actuals.employerCostsPence != null
      ? { niPence: 0, pensionPence: 0 }
      : { niPence: ni, pensionPence: pension },
    workerTravelExpensesPence: travel,
    otherWorkerCostsPence: otherWorker,
    otherDirectCostsPence: otherDirect,
    directLabourCostPence,
    grossContributionPence,
    grossMargin: revenuePence > 0 ? grossContributionPence / revenuePence : null,
    billableHours: Math.round(billableHours * 100) / 100,
    countedAssignments: counted,
    isEstimate: !allActual || basis.wages === 'estimate' || basis.holidayPay === 'estimate' || basis.employerCosts === 'estimate',
    basis,
  };
}
