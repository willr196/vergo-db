/**
 * Document templates for VERGO Ops and the renderer that turns one into the
 * text issued to a worker or a client.
 *
 * Templates are plain text: "# " and "## " start headings, "- " starts a list
 * item, a blank line separates paragraphs, and {{key}} is replaced from the
 * worker, client, assignment and company data. The print pages escape
 * everything, so a template can never inject markup.
 *
 * A template still carrying [[VERGO WORDING NEEDED ...]] cannot be issued.
 * The system wording (legalTemplates.ts) has no such gaps, but is a draft for
 * legal review; see docs/VERGO-OPS.md.
 *
 * Values that come from Ops settings (the KID pay example and the commercial
 * terms) are frozen into each template version (DocumentTemplate.variables),
 * so a version number always identifies one exact wording. Changing those
 * settings makes a new version.
 */

import { createHash } from 'crypto';
import { SITE } from '../site/content';
import { AGREEMENT_BODY, ASSIGNMENT_CONFIRMATION_BODY, CLIENT_TERMS_BODY, KID_BODY } from './legalTemplates';
import type { CommercialTerms, KidPayExample, OpsSettings } from './settings';

export const WORDING_NEEDED = '[[VERGO WORDING NEEDED';

export type OpsDocType =
  | 'KEY_INFORMATION_DOCUMENT'
  | 'ZERO_HOURS_AGREEMENT'
  | 'ASSIGNMENT_CONFIRMATION'
  | 'RTW_CHECKLIST'
  | 'ONBOARDING_CHECKLIST'
  | 'CLIENT_TERMS_OF_BUSINESS';

export const DOC_TYPE_LABELS: Record<OpsDocType, string> = {
  KEY_INFORMATION_DOCUMENT: 'Key Information Document',
  ZERO_HOURS_AGREEMENT: 'Zero-Hours Employment Agreement',
  ASSIGNMENT_CONFIRMATION: 'Assignment Confirmation',
  RTW_CHECKLIST: 'Right-to-work internal checklist',
  ONBOARDING_CHECKLIST: 'Worker onboarding checklist',
  CLIENT_TERMS_OF_BUSINESS: 'Terms of Business for Temporary Staff Supply',
};

/** Issued to a worker (WorkerDocument), as opposed to a client (ClientDocument). */
export const WORKER_DOC_TYPES: OpsDocType[] = ['KEY_INFORMATION_DOCUMENT', 'ZERO_HOURS_AGREEMENT', 'ASSIGNMENT_CONFIRMATION', 'RTW_CHECKLIST', 'ONBOARDING_CHECKLIST'];

/** Documents a worker accepts, as opposed to ones that are issued or kept internally. */
export const ACCEPTABLE_TYPES = new Set<OpsDocType>(['ZERO_HOURS_AGREEMENT', 'ASSIGNMENT_CONFIRMATION']);

/** The legal documents whose versions the Documents & Terms section tracks. */
export const LEGAL_DOC_TYPES: OpsDocType[] = ['KEY_INFORMATION_DOCUMENT', 'ZERO_HOURS_AGREEMENT', 'CLIENT_TERMS_OF_BUSINESS', 'ASSIGNMENT_CONFIRMATION'];

/** Audit action for a new template version, by type. */
export const VERSION_SUPERSEDED_ACTION: Partial<Record<OpsDocType, string>> = {
  KEY_INFORMATION_DOCUMENT: 'KID_VERSION_SUPERSEDED',
  ZERO_HOURS_AGREEMENT: 'CONTRACT_VERSION_SUPERSEDED',
  CLIENT_TERMS_OF_BUSINESS: 'TERMS_VERSION_SUPERSEDED',
};

export const AGREEMENT_STATEMENT = 'I confirm I have read and agree to the VERGO Zero-Hours Employment Agreement.';
export const KID_ACKNOWLEDGEMENT = 'I confirm I have been given, and have read, the VERGO Key Information Document.';
export const CLIENT_TERMS_STATEMENT = 'I confirm that I am authorised to accept these Terms of Business on behalf of the hirer and agree to the VERGO Staffing Terms of Business for Temporary Staff Supply.';

export const COMPANY_TRADING_NAME = 'VERGO Staffing';

export function needsWording(body: string): boolean {
  return body.includes(WORDING_NEEDED);
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Replace {{key}} with values. A key with no value shows as a visible gap. */
export function renderTemplate(body: string, values: Record<string, string | number | null | undefined>): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, key: string) => {
    const value = values[key];
    return value == null || value === '' ? `[not recorded: ${key}]` : String(value);
  });
}

/** Keys a template uses, so the editor can show what it expects. */
export function templateKeys(body: string): string[] {
  return [...new Set([...body.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)].map((m) => m[1]))];
}

export function companyValues(): Record<string, string> {
  return {
    'company.legalName': SITE.legalName,
    'company.tradingName': COMPANY_TRADING_NAME,
    'company.number': SITE.companyNumber,
    'company.registeredOffice': SITE.registeredOffice,
    'company.email': SITE.publicEmail,
    'company.phone': SITE.phoneDisplay,
    'company.privacyUrl': 'https://vergoltd.com/privacy',
  };
}

/** "4 October 2026" for a YYYY-MM-DD London date. */
export function longDate(ymd: string | null | undefined): string | null {
  if (!ymd) return null;
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
}

// ── Values frozen into a template version ─────────────────────────────────

const gbp = (pounds: number) => `£${pounds.toFixed(2)}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The KID's representative pay example. A deduction left empty is not invented. */
export function kidExampleValues(example: KidPayExample): Record<string, string> {
  const base = round2(example.hours * example.hourlyRate);
  const holiday = round2(base * example.holidayPayPercent / 100);
  const gross = round2(base + holiday);
  const deductions = [example.incomeTax, example.employeeNi, example.pension, example.otherDeductions];
  const notIllustrated = 'Not illustrated: depends on your circumstances';
  const show = (v: number | null) => (v == null ? notIllustrated : gbp(v));
  const allGiven = deductions.every((d) => d != null);
  const net = allGiven ? round2(gross - deductions.reduce<number>((s, d) => s + (d ?? 0), 0)) : null;
  return {
    'example.hours': String(example.hours),
    'example.hourlyRate': gbp(example.hourlyRate),
    'example.basePay': gbp(base),
    'example.holidayPercent': `${example.holidayPayPercent}%`,
    'example.holidayPay': gbp(holiday),
    'example.grossPay': gbp(gross),
    'example.incomeTax': show(example.incomeTax),
    'example.employeeNi': show(example.employeeNi),
    'example.pension': show(example.pension),
    'example.otherDeductions': example.otherDeductions == null ? 'None illustrated' : gbp(example.otherDeductions),
    'example.netPay': net == null ? 'Gross pay less the deductions that apply to you' : `${gbp(net)} (illustrative)`,
    'example.note': example.note?.trim() || 'All figures above are illustrative examples, not a statement of what you will earn or what will be deducted.',
  };
}

/** "within 24 hours of the start: 25%". Tighter windows first, then a line for earlier notice. */
export function cancellationLines(tiers: CommercialTerms['cancellation']): string {
  const sorted = [...tiers].sort((a, b) => a.withinHours - b.withinHours);
  const lines = sorted.map((t) => `- Cancelled within ${t.withinHours} hours of the start: ${t.percent}% of the Charges for the cancelled shifts`);
  const longest = sorted[sorted.length - 1]?.withinHours;
  if (longest) lines.push(`- Cancelled more than ${longest} hours before the start: no charge`);
  return lines.join('\n');
}

export function commercialTermsValues(terms: CommercialTerms): Record<string, string> {
  const minutes = terms.replacementWindowMinutes;
  const window = minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? '' : 's'}` : `${minutes} minutes`;
  return {
    'terms.paymentDays': String(terms.paymentTermsDays),
    'terms.advancePaymentLine': terms.firstBookingAdvancePayment
      ? "VERGO may require payment in advance for a Client's first Booking, or where the Booking Confirmation says so; Workers are supplied once that payment has cleared."
      : 'VERGO may require payment in advance where the Booking Confirmation says so.',
    'terms.cancellationList': cancellationLines(terms.cancellation),
    'terms.replacementWindow': window,
    'terms.transferFeePercent': `${terms.transferFeePercent}%`,
    'terms.transferFeeMonths': String(terms.transferFeeRemunerationMonths),
    'terms.extendedHireWeeks': String(terms.extendedHireWeeks),
  };
}

export interface FrozenVariables {
  /** The settings the values came from, for the record. */
  source: unknown;
  values: Record<string, string>;
}

/** What a new version of `type` freezes from the current settings, if anything. */
export function variablesFor(type: OpsDocType, settings: Pick<OpsSettings, 'kidPayExample' | 'clientCommercialTerms'>): FrozenVariables | null {
  if (type === 'KEY_INFORMATION_DOCUMENT') return { source: settings.kidPayExample, values: kidExampleValues(settings.kidPayExample) };
  if (type === 'CLIENT_TERMS_OF_BUSINESS') return { source: settings.clientCommercialTerms, values: commercialTermsValues(settings.clientCommercialTerms) };
  return null;
}

/** The frozen values of a template version, tolerating versions made before there were any. */
export function frozenValues(variables: unknown): Record<string, string> {
  const values = (variables as FrozenVariables | null)?.values;
  return values && typeof values === 'object' ? values : {};
}

// ── Defaults ──────────────────────────────────────────────────────────────

/**
 * The system wording for each type. Ops creates it as version 1, and also
 * as a new version on top of any earlier system-written version whose text
 * differs (for example the old placeholder layouts). It never replaces a
 * version an admin wrote.
 */
export const DEFAULT_TEMPLATES: Record<OpsDocType, { title: string; body: string }> = {
  KEY_INFORMATION_DOCUMENT: { title: 'Key Information Document', body: KID_BODY },
  ZERO_HOURS_AGREEMENT: { title: 'VERGO Zero-Hours Employment Agreement', body: AGREEMENT_BODY },
  ASSIGNMENT_CONFIRMATION: { title: 'Assignment confirmation', body: ASSIGNMENT_CONFIRMATION_BODY },
  CLIENT_TERMS_OF_BUSINESS: { title: 'VERGO Staffing Terms of Business for Temporary Staff Supply', body: CLIENT_TERMS_BODY },
  RTW_CHECKLIST: {
    title: 'Right-to-work internal checklist',
    body: `# Right-to-work internal checklist

Worker: {{worker.name}}
Prepared: {{today}} (version {{doc.version}})

Internal. Completing this list is not itself a right-to-work check. The check is only done when the prescribed steps below have been carried out by a named person.

## Before the first shift
- Choose the method: Home Office online check (share code), manual check of original documents, or a certified IDSP check (British and Irish passports).
- Online check: view the profile on GOV.UK using the share code and date of birth; confirm the photo matches the worker; save the profile page PDF. Do not record the share code itself in VERGO Ops.
- Manual check: see the original document with the worker present (in person or live video with the original sent to you); check it is genuine, unaltered and belongs to them; copy every relevant page; record the date the check was made.
- IDSP check: keep the provider's result and confirm the image matches the worker.
- Record in VERGO Ops: method, date, who performed it, result, valid until, follow-up date, evidence reference.
- Confirm in VERGO Ops that the prescribed check was performed.

## Time-limited permission
- Set the follow-up date before the permission expires.
- Re-check before the expiry date; the worker cannot be assigned once it has passed.

## Keep
- Evidence for the length of employment and 2 years after it ends.
`,
  },
  ONBOARDING_CHECKLIST: {
    title: 'Worker onboarding checklist',
    body: `# Worker onboarding checklist

Worker: {{worker.name}}
Prepared: {{today}} (version {{doc.version}})

- Contact details: email, phone and an emergency contact recorded.
- Right to work: prescribed check performed and recorded, with any follow-up date.
- Key Information Document issued before the employment agreement.
- Zero-Hours Employment Agreement agreed (by the worker through their secure link, or recorded with how they agreed).
- Payroll: added to the payroll provider and the external reference recorded (no bank details or NI number in VERGO Ops).
- Pension: status assessed or marked for review.
- Roles and qualifications recorded.
- Ready for Work shows READY, or an override is recorded with a reason.
`,
  },
};
