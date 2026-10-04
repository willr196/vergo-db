/**
 * CSV in and out, the direct-hire relevant period, and the retention
 * classification. Nothing in VERGO Ops deletes records on a schedule: the
 * classification is metadata so a retention policy can be applied by a person
 * later, with advice.
 */

import { addDays } from './time';

// ── CSV ────────────────────────────────────────────────────────────────────

/**
 * A cell that starts with = + - @ (or a tab/CR) is run as a formula by Excel
 * and Sheets. Prefixing a quote stops a name like "=HYPERLINK(...)" doing
 * anything when the export is opened.
 */
function safeCell(value: unknown): string {
  if (value == null) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((row) => row.map(safeCell).join(',')).join('\r\n') + '\r\n';
}

/** RFC 4180 parse: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const input = text.replace(/^﻿/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((cell) => cell !== '')) rows.push(row);
  return rows;
}

// ── Direct hire / transfer ────────────────────────────────────────────────

/**
 * Estimated end of the "relevant period" in which a transfer fee may be
 * chargeable if the hirer takes the worker on directly: the later of 14 weeks
 * from the first day of the first assignment, or 8 weeks after the last one
 * ended (Conduct of Employment Agencies and Employment Businesses Regulations
 * 2003, reg. 10). Breaks between assignments can change this; it is a
 * tracking aid, not advice.
 */
export function relevantPeriodEnd(firstAssignment: string, lastAssignment: string): string {
  const fromFirst = addDays(firstAssignment, 14 * 7);
  const fromLast = addDays(lastAssignment, 1 + 8 * 7);
  return fromFirst > fromLast ? fromFirst : fromLast;
}

// ── Retention classification ──────────────────────────────────────────────

export interface RetentionClass {
  key: string;
  label: string;
  covers: string[];
  /** A commonly cited minimum, for a person to confirm. Never applied automatically. */
  guidance: string;
}

export const RETENTION_CLASSES: RetentionClass[] = [
  {
    key: 'employment_business',
    label: 'Employment-business records',
    covers: ['Worker profiles', 'Issued documents (KID, agreements, assignment confirmations)', 'Bookings and assignments', 'Client terms'],
    guidance: 'Conduct Regulations: at least 1 year from creation or last use. Confirm with an adviser.',
  },
  {
    key: 'holiday_pay',
    label: 'Holiday-pay records',
    covers: ['Timesheets (hours worked)', 'Holiday pay method on assignments', 'Historic payments (holiday pay column)'],
    guidance: 'Working time and holiday records: commonly kept 6 years. Confirm with an adviser.',
  },
  {
    key: 'payroll',
    label: 'Payroll records',
    covers: ['Historic payroll reconstruction', 'Payroll status and references', 'Actual payroll figures on bookings'],
    guidance: 'HMRC: at least 3 years after the end of the tax year they relate to.',
  },
  {
    key: 'accounting',
    label: 'Accounting records',
    covers: ['Booking revenue and costs', 'Invoices and payments'],
    guidance: 'Companies Act / HMRC: commonly 6 years from the end of the financial year.',
  },
  {
    key: 'right_to_work',
    label: 'Right-to-work records',
    covers: ['Right-to-work checks and evidence references'],
    guidance: 'Home Office: for the duration of employment and 2 years after it ends.',
  },
  {
    key: 'client',
    label: 'Client records',
    covers: ['Client and hirer details', 'Terms sent and accepted', 'Direct-hire tracking'],
    guidance: 'Commonly 6 years after the relationship ends (contract claims). Confirm with an adviser.',
  },
  {
    key: 'audit',
    label: 'Audit log',
    covers: ['Every Ops change'],
    guidance: 'Keep at least as long as the longest record it describes.',
  },
];
