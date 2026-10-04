/**
 * Worker compliance as VERGO Ops shows it: right-to-work position, document
 * status, and whether the worker is Ready for Work. Pure functions over data
 * the routes load, so the rules are tested without a database.
 *
 * These are tracking aids. They tell the office what is recorded and what is
 * missing; they do not decide anything on the worker's or HMRC's behalf.
 */

import type { RtwSummary } from '../services/rightToWork';
import { daysBetween, dateKey } from './time';

// ── Right to work ──────────────────────────────────────────────────────────

export type OpsRtwStatus = 'not_checked' | 'valid' | 'follow_up_required' | 'expired' | 'blocked';

export interface RtwInput {
  summary: Pick<RtwSummary, 'status' | 'expiresAt'>;
  /** Follow-up date on the check that currently clears the worker, if any. */
  followUpDue: Date | null;
  /** Admin block on the worker profile. */
  blocked: boolean;
}

/**
 * The check history decides most of this (services/rightToWork summarises
 * it). A follow-up date that has arrived turns a valid position into
 * follow_up_required, and an admin block or a failed check is blocked.
 */
export function opsRtwStatus(input: RtwInput, now: Date = new Date()): OpsRtwStatus {
  if (input.blocked) return 'blocked';
  switch (input.summary.status) {
    case 'NOT_CHECKED': return 'not_checked';
    case 'FAILED': return 'blocked';
    case 'PENDING': return 'follow_up_required';
    case 'EXPIRED': return 'expired';
    case 'PASSED':
      if (input.followUpDue && input.followUpDue.getTime() <= now.getTime()) return 'follow_up_required';
      return 'valid';
  }
}

export type RtwExpiryBucket = 'expired' | 'within_30' | 'within_60' | 'later' | 'no_expiry' | 'no_check';

/** Where a worker sits on the RTW screen's expiry view. */
export function rtwExpiryBucket(
  summary: Pick<RtwSummary, 'status' | 'expiresAt'>,
  now: Date = new Date()
): RtwExpiryBucket {
  if (summary.status === 'NOT_CHECKED') return 'no_check';
  if (summary.status === 'EXPIRED') return 'expired';
  if (!summary.expiresAt) return summary.status === 'PASSED' ? 'no_expiry' : 'no_check';
  const days = daysBetween(dateKey(now), dateKey(summary.expiresAt));
  if (days < 0) return 'expired';
  if (days <= 30) return 'within_30';
  if (days <= 60) return 'within_60';
  return 'later';
}

/**
 * Share codes look like "W2X 4Y6 Z8A": nine letters and digits. They must not
 * be stored as the evidence reference, so the Ops form refuses anything that
 * looks like one.
 */
export function looksLikeShareCode(value: string): boolean {
  const compact = value.replace(/[\s-]/g, '');
  return /^[A-Za-z0-9]{9}$/.test(compact) && /[A-Za-z]/.test(compact) && /\d/.test(compact);
}

// ── Documents ──────────────────────────────────────────────────────────────

export type ContractStatus = 'not_issued' | 'issued' | 'accepted' | 'superseded';
export type KidStatus = 'not_issued' | 'issued' | 'superseded';

export interface IssuedDoc {
  status: 'ISSUED' | 'ACCEPTED' | 'SUPERSEDED' | 'WITHDRAWN';
  version: number;
  issuedAt: Date;
  acceptedAt: Date | null;
}

export interface DocPosition<S extends string> {
  status: S;
  version: number | null;
  issuedAt: Date | null;
  acceptedAt: Date | null;
  /** A newer template version exists than the one the worker has. */
  newerVersionAvailable: boolean;
}

function latestLive(docs: IssuedDoc[]) {
  const live = docs.filter((doc) => doc.status === 'ISSUED' || doc.status === 'ACCEPTED');
  return live.sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime())[0] ?? null;
}

/**
 * The worker's agreement position. Issuing a new version supersedes the old
 * one, so the live document is the latest ISSUED or ACCEPTED one; with only
 * superseded documents left, the worker has nothing current.
 */
export function contractPosition(docs: IssuedDoc[], currentTemplateVersion: number | null): DocPosition<ContractStatus> {
  const live = latestLive(docs);
  if (!live) {
    const anySuperseded = docs.some((doc) => doc.status === 'SUPERSEDED');
    return { status: anySuperseded ? 'superseded' : 'not_issued', version: null, issuedAt: null, acceptedAt: null, newerVersionAvailable: false };
  }
  return {
    status: live.status === 'ACCEPTED' ? 'accepted' : 'issued',
    version: live.version,
    issuedAt: live.issuedAt,
    acceptedAt: live.acceptedAt,
    newerVersionAvailable: currentTemplateVersion != null && currentTemplateVersion > live.version,
  };
}

/** The Key Information Document position. A KID is issued, not accepted. */
export function kidPosition(docs: IssuedDoc[], currentTemplateVersion: number | null): DocPosition<KidStatus> {
  const live = latestLive(docs);
  if (!live) {
    const anySuperseded = docs.some((doc) => doc.status === 'SUPERSEDED');
    return { status: anySuperseded ? 'superseded' : 'not_issued', version: null, issuedAt: null, acceptedAt: null, newerVersionAvailable: false };
  }
  return {
    status: 'issued',
    version: live.version,
    issuedAt: live.issuedAt,
    acceptedAt: null,
    newerVersionAvailable: currentTemplateVersion != null && currentTemplateVersion > live.version,
  };
}

// ── Ready for Work ─────────────────────────────────────────────────────────

export interface ReadinessInput {
  activeStatus: 'ACTIVE' | 'INACTIVE' | 'LEFT';
  rtwStatus: OpsRtwStatus;
  contractStatus: ContractStatus;
  kidStatus: KidStatus;
  email: string | null;
  phone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  payrollStatus: 'NOT_ADDED' | 'PENDING' | 'ACTIVE' | 'LEAVER';
  override: { active: boolean; reason: string | null };
}

export interface Readiness {
  /** What the office should treat the worker as: computed, or overridden. */
  ready: boolean;
  /** What the rules alone say. */
  computedReady: boolean;
  overridden: boolean;
  overrideReason: string | null;
  /** Every reason the worker is not ready, in the order to fix them. */
  missing: string[];
}

const present = (value: string | null | undefined) => value != null && value.trim() !== '';

/**
 * READY needs every one of: active, right to work valid, the zero-hours
 * agreement accepted, the KID issued, email, phone and an emergency contact,
 * and payroll onboarding active. An override counts only with a reason.
 */
export function computeReadiness(input: ReadinessInput): Readiness {
  const missing: string[] = [];
  if (input.activeStatus !== 'ACTIVE') missing.push(`Worker is ${input.activeStatus.toLowerCase()}, not active`);
  if (input.rtwStatus !== 'valid') {
    const why: Record<OpsRtwStatus, string> = {
      not_checked: 'No right-to-work check recorded',
      follow_up_required: 'Right-to-work follow-up check due',
      expired: 'Right to work has expired',
      blocked: 'Right to work blocked',
      valid: '',
    };
    missing.push(why[input.rtwStatus]);
  }
  if (input.contractStatus !== 'accepted') {
    missing.push(input.contractStatus === 'issued'
      ? 'Zero-hours agreement issued but not accepted'
      : 'Zero-hours agreement not issued');
  }
  if (input.kidStatus !== 'issued') missing.push('Key Information Document not issued');
  if (!present(input.email)) missing.push('Email missing');
  if (!present(input.phone)) missing.push('Phone number missing');
  if (!present(input.emergencyContactName) || !present(input.emergencyContactPhone)) {
    missing.push('Emergency contact missing');
  }
  if (input.payrollStatus !== 'ACTIVE') {
    missing.push(input.payrollStatus === 'PENDING'
      ? 'Payroll onboarding pending'
      : input.payrollStatus === 'LEAVER' ? 'Marked as a payroll leaver' : 'Not added to payroll');
  }

  const computedReady = missing.length === 0;
  const overridden = !computedReady && input.override.active && present(input.override.reason);
  return {
    ready: computedReady || overridden,
    computedReady,
    overridden,
    overrideReason: overridden ? input.override.reason : null,
    missing,
  };
}
