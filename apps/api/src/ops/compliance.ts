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

/**
 * Share codes, National Insurance numbers and passport numbers (UK passports
 * are nine digits) all stay out of the evidence reference, which should say
 * where the evidence is kept, not what it says.
 */
export function identityNumberIn(value: string): 'share code' | 'National Insurance number' | 'passport number' | null {
  const compact = value.replace(/[\s-]/g, '');
  if (/^[A-Z]{2}\d{6}[A-D]$/i.test(compact)) return 'National Insurance number';
  if (/^\d{9}$/.test(compact)) return 'passport number';
  if (looksLikeShareCode(value)) return 'share code';
  return null;
}

// ── Documents ──────────────────────────────────────────────────────────────

export type ContractStatus = 'not_issued' | 'issued' | 'accepted' | 'superseded';
export type KidStatus = 'not_issued' | 'issued' | 'superseded';

export interface IssuedDoc {
  status: 'ISSUED' | 'ACCEPTED' | 'SUPERSEDED' | 'WITHDRAWN';
  version: number;
  issuedAt: Date;
  acceptedAt: Date | null;
  acknowledgedAt?: Date | null;
}

/**
 * Template versions that matter for a document type: the current one, and
 * the lowest version still acceptable (the latest version saved as a
 * material change). Anyone below minAcceptable must agree again.
 */
export interface VersionInfo {
  current: number | null;
  minAcceptable?: number | null;
}

export interface DocPosition<S extends string> {
  status: S;
  /** The version that counts: the agreed one, else the one awaiting agreement. */
  version: number | null;
  issuedAt: Date | null;
  acceptedAt: Date | null;
  /** KID: when the worker confirmed it had been provided. */
  acknowledgedAt: Date | null;
  /** A newer version issued on top of an agreed one, awaiting agreement. */
  pendingVersion: number | null;
  /** A newer template version exists than the one the worker has. */
  newerVersionAvailable: boolean;
  /** The worker's version predates a material change, so it no longer counts. */
  reacceptanceRequired: boolean;
}

const LIVE = new Set(['ISSUED', 'ACCEPTED']);
const newestFirst = (a: IssuedDoc, b: IssuedDoc) => b.issuedAt.getTime() - a.issuedAt.getTime() || b.version - a.version;
const asInfo = (versions: VersionInfo | number | null): VersionInfo =>
  typeof versions === 'object' && versions !== null ? versions : { current: versions };

function versionFlags(version: number, info: VersionInfo) {
  return {
    newerVersionAvailable: info.current != null && info.current > version,
    reacceptanceRequired: info.minAcceptable != null && info.minAcceptable > version,
  };
}

function nothingLive<S extends string>(docs: IssuedDoc[], notIssued: S, superseded: S): DocPosition<S> {
  return {
    status: docs.some((doc) => doc.status === 'SUPERSEDED') ? superseded : notIssued,
    version: null, issuedAt: null, acceptedAt: null, acknowledgedAt: null,
    pendingVersion: null, newerVersionAvailable: false, reacceptanceRequired: false,
  };
}

/**
 * The worker's agreement position. Issuing a newer version does not cancel
 * an agreement already made: the agreed version stands until the newer one
 * is agreed, unless a later version was a material change (VersionInfo).
 */
export function contractPosition(docs: IssuedDoc[], versions: VersionInfo | number | null): DocPosition<ContractStatus> {
  const live = docs.filter((doc) => LIVE.has(doc.status)).sort(newestFirst);
  const accepted = live.find((doc) => doc.status === 'ACCEPTED') ?? null;
  const pending = live.find((doc) => doc.status === 'ISSUED' && (!accepted || doc.version > accepted.version)) ?? null;
  const shown = accepted ?? pending;
  if (!shown) return nothingLive<ContractStatus>(docs, 'not_issued', 'superseded');
  return {
    status: accepted ? 'accepted' : 'issued',
    version: shown.version,
    issuedAt: shown.issuedAt,
    acceptedAt: accepted?.acceptedAt ?? null,
    acknowledgedAt: null,
    pendingVersion: accepted && pending ? pending.version : null,
    ...versionFlags(shown.version, asInfo(versions)),
  };
}

/** The Key Information Document position. A KID is issued and acknowledged, not accepted. */
export function kidPosition(docs: IssuedDoc[], versions: VersionInfo | number | null): DocPosition<KidStatus> {
  const live = docs.filter((doc) => LIVE.has(doc.status)).sort(newestFirst)[0] ?? null;
  if (!live) return nothingLive<KidStatus>(docs, 'not_issued', 'superseded');
  return {
    status: 'issued',
    version: live.version,
    issuedAt: live.issuedAt,
    acceptedAt: null,
    acknowledgedAt: live.acknowledgedAt ?? null,
    pendingVersion: null,
    ...versionFlags(live.version, asInfo(versions)),
  };
}

/** Whether each document counts towards Ready for Work. */
export const kidCounts = (kid: DocPosition<KidStatus>) => kid.status === 'issued' && !kid.reacceptanceRequired;
export const contractCounts = (contract: DocPosition<ContractStatus>) => contract.status === 'accepted' && !contract.reacceptanceRequired;

export type DocPackStatus = 'both_missing' | 'kid_missing' | 'contract_missing' | 'outdated' | 'current';

/**
 * Where a worker sits on the Documents Outstanding screen. "outdated" means
 * both documents count but at least one is on an older version.
 */
export function docPackStatus(kid: DocPosition<KidStatus>, contract: DocPosition<ContractStatus>): DocPackStatus {
  const kidOk = kidCounts(kid);
  const contractOk = contractCounts(contract);
  if (!kidOk && !contractOk) return 'both_missing';
  if (!kidOk) return 'kid_missing';
  if (!contractOk) return 'contract_missing';
  if (kid.newerVersionAvailable || contract.newerVersionAvailable) return 'outdated';
  return 'current';
}

// ── Client Terms of Business ────────────────────────────────────────────────

export type ClientTermsStatus = 'consumer_terms_required' | 'not_issued' | 'issued' | 'accepted' | 'reacceptance_required';

export interface ClientTermsPosition {
  status: ClientTermsStatus;
  /** The version accepted, if any. */
  acceptedVersion: number | null;
  acceptedAt: Date | null;
  /** A version issued and awaiting acceptance, if any. */
  pendingVersion: number | null;
  issuedAt: Date | null;
  /** The accepted version is older than the current one. */
  newerVersionAvailable: boolean;
}

/**
 * Business hirers need the B2B Terms accepted. Private consumers never get
 * them: they always show as needing consumer booking terms.
 */
export function clientTermsPosition(input: { clientType: string; docs: IssuedDoc[]; versions: VersionInfo }): ClientTermsPosition {
  if (input.clientType === 'PRIVATE_CONSUMER') {
    return { status: 'consumer_terms_required', acceptedVersion: null, acceptedAt: null, pendingVersion: null, issuedAt: null, newerVersionAvailable: false };
  }
  const live = input.docs.filter((doc) => LIVE.has(doc.status)).sort(newestFirst);
  const accepted = live.find((doc) => doc.status === 'ACCEPTED') ?? null;
  const pending = live.find((doc) => doc.status === 'ISSUED' && (!accepted || doc.version > accepted.version)) ?? null;
  const base = {
    acceptedVersion: accepted?.version ?? null,
    acceptedAt: accepted?.acceptedAt ?? null,
    pendingVersion: pending?.version ?? null,
    issuedAt: (pending ?? accepted)?.issuedAt ?? null,
    newerVersionAvailable: accepted != null && input.versions.current != null && input.versions.current > accepted.version,
  };
  if (accepted) {
    const stale = input.versions.minAcceptable != null && input.versions.minAcceptable > accepted.version;
    return { status: stale ? 'reacceptance_required' : 'accepted', ...base };
  }
  return { status: pending ? 'issued' : 'not_issued', ...base };
}

export interface TermsGate {
  ok: boolean;
  code: 'consumer_terms_required' | 'client_terms_not_accepted' | null;
  message: string | null;
}

/**
 * The booking gate. Drafts and quotes go ahead regardless; supplying staff
 * without accepted Terms needs an admin's written reason, and a private
 * consumer is never sent the B2B Terms.
 */
export function clientTermsGate(position: ClientTermsPosition): TermsGate {
  if (position.status === 'consumer_terms_required') {
    return { ok: false, code: 'consumer_terms_required', message: 'Consumer booking terms required. The B2B Terms of Business do not apply to a private consumer.' };
  }
  if (position.status === 'accepted') return { ok: true, code: null, message: null };
  const detail = position.status === 'reacceptance_required'
    ? `version ${position.acceptedVersion} was accepted, but a later version changed the terms materially`
    : position.status === 'issued' ? `version ${position.pendingVersion} issued, not yet accepted` : 'not issued yet';
  return { ok: false, code: 'client_terms_not_accepted', message: `Client Terms not accepted: ${detail}.` };
}

// ── Ready for Work ─────────────────────────────────────────────────────────

export interface ReadinessInput {
  activeStatus: 'ACTIVE' | 'INACTIVE' | 'LEFT';
  rtwStatus: OpsRtwStatus;
  contractStatus: ContractStatus;
  kidStatus: KidStatus;
  /** The agreed version predates a material change. */
  contractReacceptanceRequired?: boolean;
  /** The issued KID predates a material change. */
  kidReissueRequired?: boolean;
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
/** Placeholder addresses (e.g. from the vergo_admin import) end in .invalid and reach nobody. */
const realEmail = (value: string | null | undefined) => present(value) && !/\.invalid$/i.test(value!.trim());

/**
 * READY needs every one of: active, right to work valid, the KID issued and
 * the zero-hours agreement accepted (neither predating a material change),
 * email, phone and an emergency contact, and payroll onboarding active. An
 * override counts only with a reason.
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
  } else if (input.contractReacceptanceRequired) {
    missing.push('Zero-hours agreement changed materially: the current version must be agreed');
  }
  if (input.kidStatus !== 'issued') missing.push('Key Information Document not issued');
  else if (input.kidReissueRequired) missing.push('Key Information Document is out of date: issue the current version');
  if (!realEmail(input.email)) missing.push('Email missing');
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
