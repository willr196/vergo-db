/**
 * Document templates for VERGO Ops and the renderer that turns one into the
 * text issued to a worker.
 *
 * Templates are plain text: "# " and "## " start headings, "- " starts a list
 * item, a blank line separates paragraphs, and {{key}} is replaced from the
 * worker, assignment and company data. The print page (routes/ops.ts) escapes
 * everything, so a template can never inject markup.
 *
 * The KID and the zero-hours agreement need VERGO's own approved wording. Their
 * defaults lay out the required sections and mark every gap with
 * [[VERGO WORDING NEEDED ...]]; a template still carrying that marker cannot
 * be issued. The checklists and the assignment confirmation are built from
 * data and are usable as they stand, and can be replaced like any other.
 */

export const WORDING_NEEDED = '[[VERGO WORDING NEEDED';

export type OpsDocType =
  | 'KEY_INFORMATION_DOCUMENT'
  | 'ZERO_HOURS_AGREEMENT'
  | 'ASSIGNMENT_CONFIRMATION'
  | 'RTW_CHECKLIST'
  | 'ONBOARDING_CHECKLIST';

export const DOC_TYPE_LABELS: Record<OpsDocType, string> = {
  KEY_INFORMATION_DOCUMENT: 'Key Information Document',
  ZERO_HOURS_AGREEMENT: 'Zero-hours employment agreement',
  ASSIGNMENT_CONFIRMATION: 'Assignment confirmation',
  RTW_CHECKLIST: 'Right-to-work internal checklist',
  ONBOARDING_CHECKLIST: 'Worker onboarding checklist',
};

/** Documents a worker accepts, as opposed to ones that are issued or kept internally. */
export const ACCEPTABLE_TYPES = new Set<OpsDocType>(['ZERO_HOURS_AGREEMENT', 'ASSIGNMENT_CONFIRMATION']);

export function needsWording(body: string): boolean {
  return body.includes(WORDING_NEEDED);
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

export const DEFAULT_TEMPLATES: Record<OpsDocType, { title: string; body: string }> = {
  KEY_INFORMATION_DOCUMENT: {
    title: 'Key Information Document',
    body: `# Key Information Document

Worker: {{worker.name}}
Issued: {{today}} (version {{doc.version}})

This document gives you key information about the type of contract you will be engaged under and how you will be paid. Read it before you agree to work with us.

## Your employment business
{{company.legalName}}, company number {{company.number}}, registered office {{company.registeredOffice}}. Contact: {{company.email}}, {{company.phone}}.

## Type of contract
[[VERGO WORDING NEEDED: contract type (zero-hours contract of employment), and who you will be employed by]]

## Minimum expected rate of pay
[[VERGO WORDING NEEDED: minimum expected hourly rate, and that it will never be below the National Minimum Wage]]

## How you will be paid
[[VERGO WORDING NEEDED: who pays you, pay frequency, and how pay is calculated]]

## Deductions and fees
[[VERGO WORDING NEEDED: statutory deductions (Income Tax, NI, pension where applicable) and confirmation that no fees are charged for finding you work]]

## Holiday entitlement and pay
[[VERGO WORDING NEEDED: 5.6 weeks' entitlement, how holiday pay is calculated and paid (e.g. rolled-up at 12.07% where lawful)]]

## Additional information
[[VERGO WORDING NEEDED: anything else the business owner requires]]
`,
  },
  ZERO_HOURS_AGREEMENT: {
    title: 'Zero-hours employment agreement',
    body: `# Zero-hours employment agreement

Between {{company.legalName}} (company number {{company.number}}, registered office {{company.registeredOffice}}) and {{worker.name}}.

Version {{doc.version}}, issued {{today}}.

## 1. Status and no guaranteed hours
[[VERGO WORDING NEEDED: zero-hours contract of employment; no obligation to offer or accept work]]

## 2. Assignments
[[VERGO WORDING NEEDED: how assignments are offered, confirmed and cancelled; assignment confirmations]]

## 3. Pay
[[VERGO WORDING NEEDED: rates, timesheets, pay dates, minimum hours]]

## 4. Holiday
[[VERGO WORDING NEEDED: entitlement and holiday pay method]]

## 5. Pension
[[VERGO WORDING NEEDED: automatic enrolment statement]]

## 6. Conduct, health and safety
[[VERGO WORDING NEEDED]]

## 7. Right to work
[[VERGO WORDING NEEDED: right-to-work checks before and during employment]]

## 8. Data protection
[[VERGO WORDING NEEDED]]

## 9. Ending the agreement
[[VERGO WORDING NEEDED]]

## Acceptance
Accepted electronically by the worker typing their name. This records agreement to these terms; it is not a qualified electronic signature.
`,
  },
  ASSIGNMENT_CONFIRMATION: {
    title: 'Assignment confirmation',
    body: `# Assignment confirmation

Worker: {{worker.name}}
Booking: {{assignment.reference}}
Issued: {{today}} (template version {{doc.version}})

## The hirer
{{assignment.client}}
Nature of business: {{assignment.clientBusiness}}

## When and where
Date: {{assignment.date}}
Start: {{assignment.start}}
Planned finish: {{assignment.finish}}
Venue: {{assignment.venue}}
Address: {{assignment.address}}
On-site contact: {{assignment.onSiteContact}}

## The work
Role: {{assignment.role}}
Duties: {{assignment.duties}}
Experience required: {{assignment.experience}}
Qualifications required: {{assignment.qualifications}}
Dress code: {{assignment.dressCode}}
Equipment: {{assignment.equipment}}
Breaks: {{assignment.breaks}}

## Pay
Hourly rate: {{assignment.payRate}}
Holiday pay: {{assignment.holidayMethod}}
Travel contribution: {{assignment.travel}}
Expenses: {{assignment.expenses}}

## Health and safety
Known risks: {{assignment.risks}}
Steps taken to control them: {{assignment.riskControls}}

Questions before the shift: {{company.phone}} or {{company.email}}.
`,
  },
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
- Key Information Document issued before terms were agreed.
- Zero-hours employment agreement issued and accepted.
- Payroll: added to the payroll provider and the external reference recorded (no bank details or NI number in VERGO Ops).
- Pension: status assessed or marked for review.
- Roles and qualifications recorded.
- Ready for Work shows READY, or an override is recorded with a reason.
`,
  },
};
