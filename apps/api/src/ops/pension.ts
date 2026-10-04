/**
 * Workplace pension review alerts. VERGO Ops never assesses, enrols, opts
 * anyone out or submits a declaration: it compares age and estimated pay with
 * the thresholds stored in Ops settings (by tax year) and tells the office who
 * needs looking at. The payroll/pension provider does the statutory work, and
 * a worker's opt-out is recorded only when the worker has actually opted out.
 */

import { ageOn, taxYearOf } from './time';

export interface PensionThresholds {
  /** Annual figures in pounds. */
  lowerQualifyingAnnual: number;
  earningsTriggerAnnual: number;
  upperQualifyingAnnual: number;
  /** Set true once someone has checked the figures against The Pensions Regulator. */
  verified: boolean;
}

export type PayFrequency = 'weekly' | 'fortnightly' | 'four_weekly' | 'monthly';

const PERIODS_PER_YEAR: Record<PayFrequency, number> = { weekly: 52, fortnightly: 26, four_weekly: 13, monthly: 12 };

/** Annual threshold to a pay-period figure in pence, the way the regulator's tables round them (to the pound). */
export function periodThresholdPence(annualPounds: number, frequency: PayFrequency): number {
  return Math.round(annualPounds / PERIODS_PER_YEAR[frequency]) * 100;
}

/**
 * The thresholds for a tax year, or the latest earlier year on file with a
 * note saying so. Null if nothing is on file at all.
 */
export function thresholdsFor(
  table: Record<string, PensionThresholds>,
  taxYear: string
): { year: string; thresholds: PensionThresholds; exact: boolean } | null {
  if (table[taxYear]) return { year: taxYear, thresholds: table[taxYear], exact: true };
  const earlier = Object.keys(table).filter((y) => y < taxYear).sort().pop();
  return earlier ? { year: earlier, thresholds: table[earlier], exact: false } : null;
}

export interface PensionAlertInput {
  pensionStatus: string;
  dateOfBirth: Date | null;
  /** Estimated pay (wages + holiday) in the highest recent pay period, pence. */
  recentPeriodEarningsPence: number;
  today: string;
  frequency: PayFrequency;
  statePensionAge: number;
  table: Record<string, PensionThresholds>;
  dutiesStartDate: string | null;
}

export interface PensionAlert {
  level: 'info' | 'warning';
  message: string;
}

const SETTLED = new Set(['ENROLLED', 'OPTED_IN', 'OPTED_OUT', 'POSTPONED']);

export function pensionAlerts(input: PensionAlertInput): PensionAlert[] {
  const alerts: PensionAlert[] = [];
  if (input.pensionStatus === 'NOT_ASSESSED') {
    alerts.push({ level: 'warning', message: 'No pension status recorded.' });
  }
  if (input.pensionStatus === 'REVIEW_REQUIRED') {
    alerts.push({ level: 'warning', message: 'Pension status marked for review.' });
  }
  if (!input.dutiesStartDate || input.today < input.dutiesStartDate) return alerts;
  if (!input.dateOfBirth) {
    alerts.push({ level: 'warning', message: 'Date of birth missing, so age-based pension checks cannot run.' });
    return alerts;
  }

  const found = thresholdsFor(input.table, taxYearOf(input.today));
  if (!found) {
    alerts.push({ level: 'warning', message: 'No pension thresholds on file. Add them in Ops settings.' });
    return alerts;
  }

  const age = ageOn(input.dateOfBirth, input.today);
  const trigger = periodThresholdPence(found.thresholds.earningsTriggerAnnual, input.frequency);
  const lower = periodThresholdPence(found.thresholds.lowerQualifyingAnnual, input.frequency);
  const pay = input.recentPeriodEarningsPence;
  const basis = found.exact ? '' : ` (using ${found.year} thresholds; ${taxYearOf(input.today)} not on file)`;

  if (age >= 22 && age < input.statePensionAge && pay > trigger && !SETTLED.has(input.pensionStatus)) {
    alerts.push({
      level: 'warning',
      message: `Recent pay is above the earnings trigger and the worker is ${age}: may be an eligible jobholder. Review with the pension provider${basis}.`,
    });
  } else if (age >= 16 && age <= 74 && pay > lower && (input.pensionStatus === 'NOT_ASSESSED' || input.pensionStatus === 'NOT_ELIGIBLE_CURRENTLY')) {
    alerts.push({
      level: 'info',
      message: `Recent pay is above the lower qualifying earnings: the worker may be able to opt in. Review${basis}.`,
    });
  }
  return alerts;
}
