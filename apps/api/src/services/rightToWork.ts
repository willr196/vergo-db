// Right-to-work check evaluation.
//
// A worker may only be placed on a paid shift while a passed check is current.
// Checks with no expiry represent permanent right to work (List A documents such
// as a UK/Irish passport). Checks with an expiry represent time-limited
// permission (List B), which must be re-checked before it lapses — once expired,
// the statutory excuse is lost and the worker must be blocked until re-checked.

import { prisma } from '../prisma';

export type RtwSummary = {
  status: 'PASSED' | 'EXPIRED' | 'FAILED' | 'PENDING' | 'NOT_CHECKED';
  label: string;
  /** True only when a passed, in-date check exists. */
  clearedToWork: boolean;
  expiresAt: Date | null;
  checkedAt: Date | null;
  checkedBy: string | null;
};

type CheckRecord = {
  outcome: string;
  expiresAt: Date | null;
  checkedAt: Date;
  checkedBy: string;
};

const NOT_CHECKED: RtwSummary = {
  status: 'NOT_CHECKED',
  label: 'No right-to-work check on file',
  clearedToWork: false,
  expiresAt: null,
  checkedAt: null,
  checkedBy: null,
};

export function isCheckCurrent(check: { outcome: string; expiresAt: Date | null }, now = new Date()): boolean {
  if (check.outcome !== 'PASS') return false;
  return check.expiresAt === null || check.expiresAt > now;
}

/**
 * Reduce an applicant's check history to a single position.
 *
 * A current PASS anywhere in the history clears the worker, so that a lapsed
 * older check does not override a valid newer one. Otherwise the most recent
 * check determines what the admin is told to do next.
 */
export function summariseChecks(checks: CheckRecord[], now = new Date()): RtwSummary {
  if (checks.length === 0) return NOT_CHECKED;

  const ordered = [...checks].sort((a, b) => b.checkedAt.getTime() - a.checkedAt.getTime());
  const current = ordered.find((check) => isCheckCurrent(check, now));

  if (current) {
    return {
      status: 'PASSED',
      label: current.expiresAt
        ? `Right to work verified until ${current.expiresAt.toLocaleDateString('en-GB')}`
        : 'Right to work verified (no expiry)',
      clearedToWork: true,
      expiresAt: current.expiresAt,
      checkedAt: current.checkedAt,
      checkedBy: current.checkedBy,
    };
  }

  const latest = ordered[0];

  if (latest.outcome === 'PASS') {
    return {
      status: 'EXPIRED',
      label: `Right to work expired ${latest.expiresAt?.toLocaleDateString('en-GB') ?? ''}`.trim() + ' — follow-up check required',
      clearedToWork: false,
      expiresAt: latest.expiresAt,
      checkedAt: latest.checkedAt,
      checkedBy: latest.checkedBy,
    };
  }

  return {
    status: latest.outcome === 'FAIL' ? 'FAILED' : 'PENDING',
    label: latest.outcome === 'FAIL'
      ? 'Right-to-work check failed'
      : 'Right-to-work check started but not completed',
    clearedToWork: false,
    expiresAt: latest.expiresAt,
    checkedAt: latest.checkedAt,
    checkedBy: latest.checkedBy,
  };
}

export async function getRightToWorkSummary(applicantId: string): Promise<RtwSummary> {
  const checks = await prisma.rightToWorkCheck.findMany({
    where: { applicantId },
    select: { outcome: true, expiresAt: true, checkedAt: true, checkedBy: true },
  });
  return summariseChecks(checks);
}
