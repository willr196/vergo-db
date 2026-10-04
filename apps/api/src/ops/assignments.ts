/**
 * Checks run before a worker is put on, or confirmed for, an assignment.
 *
 * A right-to-work problem blocks outright: employing someone without a valid
 * check is unlawful, so no reason makes it appropriate. Everything else is a
 * warning an admin can confirm through with a written reason, which is kept
 * on the assignment and in the audit log.
 */

import type { Interval } from './time';
import type { OpsRtwStatus, ContractStatus, KidStatus } from './compliance';

export interface ExistingShift extends Interval {
  id: string;
  label: string;
}

/** Shifts that overlap the candidate. Touching end-to-start is not an overlap. */
export function findOverlaps(candidate: Interval, others: ExistingShift[]): ExistingShift[] {
  return others.filter((other) =>
    candidate.start.getTime() < other.end.getTime() && other.start.getTime() < candidate.end.getTime()
  );
}

export interface AssignmentCheckInput {
  rtwStatus: OpsRtwStatus;
  contractStatus: ContractStatus;
  kidStatus: KidStatus;
  activeStatus: 'ACTIVE' | 'INACTIVE' | 'LEFT';
  /** The app's availability switch; null when the worker has never used the app, so it is only a default. */
  availabilityStatus: 'AVAILABLE' | 'LIMITED' | 'UNAVAILABLE' | null;
  /** Availability windows the worker has entered, as London dates. */
  availabilityWindows: Array<{ from: string; to: string }>;
  shiftDate: string;
  overlaps: ExistingShift[];
  requiredRole: string | null;
  workerRoles: string[];
  requiredQualifications: string[];
  workerQualifications: string[];
  /** Hourly rates for the shift, when known. */
  payRate?: number | null;
  chargeRate?: number | null;
  /** The National Living Wage the site quotes (21 and over). */
  payFloor?: number;
  /** Readiness items not covered by the checks above (contact details, payroll). */
  otherMissing?: string[];
}

export interface AssignmentWarning {
  code: 'rtw' | 'documents' | 'inactive' | 'unavailable' | 'overlap' | 'role' | 'qualification' | 'not_ready' | 'pay_rate' | 'charge_rate';
  message: string;
  /** Blocking warnings cannot be overridden. */
  blocking: boolean;
}

const norm = (value: string) => value.trim().toLowerCase();

export function assignmentWarnings(input: AssignmentCheckInput): AssignmentWarning[] {
  const warnings: AssignmentWarning[] = [];

  if (input.rtwStatus !== 'valid') {
    warnings.push({
      code: 'rtw',
      blocking: true,
      message: `Right to work is ${input.rtwStatus.replace(/_/g, ' ')}. A valid check must be recorded before this worker can be assigned.`,
    });
  }

  const docProblems: string[] = [];
  if (input.contractStatus !== 'accepted') docProblems.push('zero-hours agreement not accepted');
  if (input.kidStatus !== 'issued') docProblems.push('Key Information Document not issued');
  if (docProblems.length) {
    warnings.push({
      code: 'documents',
      blocking: false,
      message: `Worker documents incomplete: ${docProblems.join('; ')}. Terms must be agreed before work is supplied.`,
    });
  }

  if (input.activeStatus !== 'ACTIVE') {
    warnings.push({ code: 'inactive', blocking: false, message: `Worker is marked ${input.activeStatus.toLowerCase()}.` });
  }

  const inWindow = input.availabilityWindows.some((w) => w.from <= input.shiftDate && input.shiftDate <= w.to);
  if (input.availabilityStatus === 'UNAVAILABLE') {
    warnings.push({ code: 'unavailable', blocking: false, message: 'Worker has set themselves as unavailable.' });
  } else if (input.availabilityWindows.length > 0 && !inWindow) {
    warnings.push({ code: 'unavailable', blocking: false, message: 'The shift date is outside every availability window the worker has entered.' });
  }

  for (const overlap of input.overlaps) {
    warnings.push({ code: 'overlap', blocking: false, message: `Overlaps another shift: ${overlap.label}.` });
  }

  if (input.requiredRole && !input.workerRoles.map(norm).includes(norm(input.requiredRole))) {
    warnings.push({ code: 'role', blocking: false, message: `Worker is not recorded as a ${input.requiredRole}.` });
  }

  const have = new Set(input.workerQualifications.map(norm));
  const lacking = input.requiredQualifications.filter((q) => !have.has(norm(q)));
  if (lacking.length) {
    warnings.push({ code: 'qualification', blocking: false, message: `Missing required qualification: ${lacking.join(', ')}.` });
  }

  if (input.otherMissing?.length) {
    warnings.push({ code: 'not_ready', blocking: false, message: `Worker is not Ready for Work: ${input.otherMissing.join('; ')}.` });
  }

  // Soft, not blocking: workers under 21 have a lower legal minimum, and the
  // age band is a judgement for the office.
  if (input.payRate != null && input.payFloor != null && input.payRate < input.payFloor) {
    warnings.push({ code: 'pay_rate', blocking: false, message: `Pay of £${input.payRate.toFixed(2)}/h is below the National Living Wage of £${input.payFloor.toFixed(2)}/h. Only lawful for a worker under 21 at their age-band rate.` });
  }
  if (input.payRate != null && input.chargeRate != null && input.chargeRate < input.payRate) {
    warnings.push({ code: 'charge_rate', blocking: false, message: `The client charge of £${input.chargeRate.toFixed(2)}/h is below the worker's pay of £${input.payRate.toFixed(2)}/h.` });
  }

  return warnings;
}

/**
 * Whether a set of warnings can go ahead. Blocking warnings never can; the
 * rest need a reason of at least a few words.
 */
export function canProceed(warnings: AssignmentWarning[], overrideReason: string | null | undefined) {
  if (warnings.some((w) => w.blocking)) return { ok: false, needsReason: false };
  if (warnings.length === 0) return { ok: true, needsReason: false };
  const ok = overrideReason != null && overrideReason.trim().length >= 5;
  return { ok, needsReason: !ok };
}
