/**
 * Print/PDF pages for issued documents, client Terms, booking confirmations
 * and template previews. Served behind adminPageAuth at /ops/print/...; the
 * browser's "Save as PDF" makes the PDF. The worker and client link pages
 * (routes/documentLinks.ts) reuse the same renderer.
 * Every piece of text is escaped: templates are text, never markup.
 */

import { Router } from 'express';
import type { ClientDocument, WorkerDocument } from '@prisma/client';
import { prisma } from '../../prisma';
import { DOC_TYPE_LABELS, companyValues, frozenValues, longDate, renderTemplate, type OpsDocType } from '../../ops/documents';
import { londonDateKey, dateKey } from '../../ops/time';
import { toNum } from '../../ops/service';
import { PRICING } from '../../config/pricing';

const r = Router();

export function esc(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** "# " heading, "## " subheading, "- " list item, blank line = new paragraph. */
export function textToHtml(text: string): string {
  const out: string[] = [];
  let list: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) { out.push(`<p>${para.map(esc).join('<br>')}</p>`); para = []; }
    if (list.length) { out.push(`<ul>${list.map((li) => `<li>${esc(li)}</li>`).join('')}</ul>`); list = []; }
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.startsWith('## ')) { flush(); out.push(`<h2>${esc(line.slice(3))}</h2>`); }
    else if (line.startsWith('# ')) { flush(); out.push(`<h1>${esc(line.slice(2))}</h1>`); }
    else if (line.startsWith('- ')) { if (para.length) flush(); list.push(line.slice(2)); }
    else if (line.trim() === '') flush();
    else { if (list.length) flush(); para.push(line); }
  }
  flush();
  return out.join('\n');
}

const londonTime = (d: Date) => d.toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const londonDay = (d: Date) => d.toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'long', year: 'numeric' });

export function page(title: string, footer: string, body: string, banner?: string, barLabel = `VERGO Ops · ${title}`) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer"><title>${esc(title)}</title>
<style>
  :root { color-scheme: light; }
  body { font: 11pt/1.5 Georgia, 'Times New Roman', serif; color: #111; background: #fff; max-width: 720px; margin: 32px auto; padding: 0 20px; }
  h1 { font-size: 20pt; margin: 0 0 12px; } h2 { font-size: 13pt; margin: 22px 0 6px; }
  p { margin: 0 0 10px; } ul { margin: 0 0 10px 20px; padding: 0; }
  .bar { font: 13px system-ui, sans-serif; display: flex; gap: 12px; justify-content: space-between; align-items: center; padding: 10px 12px; background: #f3f1ec; border: 1px solid #ddd; margin-bottom: 24px; }
  .banner { font: 13px system-ui, sans-serif; padding: 10px 12px; border: 1px solid #c8a200; background: #fff8d6; margin-bottom: 18px; }
  footer { margin-top: 32px; padding-top: 8px; border-top: 1px solid #ccc; font: 9pt system-ui, sans-serif; color: #555; }
  button { font: inherit; padding: 6px 14px; cursor: pointer; }
  table { border-collapse: collapse; width: 100%; font: 10pt system-ui, sans-serif; margin: 8px 0 16px; }
  th, td { text-align: left; border-bottom: 1px solid #ddd; padding: 6px 4px; vertical-align: top; }
  @media print { .bar { display: none; } body { margin: 0 auto; } }
</style></head><body>
<div class="bar"><span>${esc(barLabel)}</span><button type="button" id="print-btn">Print / Save as PDF</button></div>
${banner ? `<div class="banner">${esc(banner)}</div>` : ''}
${body}
<footer>${esc(footer)}</footer>
<script src="/js/ops-print.js"></script>
</body></html>`;
}

/** The record printed under a worker document: version, issue, acknowledgement, agreement. */
export function workerDocFooter(doc: WorkerDocument, opts: { internal: boolean }) {
  const label = DOC_TYPE_LABELS[doc.type as OpsDocType];
  const parts = [`${label}, version ${doc.version}. Issued ${londonTime(doc.issuedAt)}${opts.internal ? ` by ${doc.issuedBy}` : ''}.`];
  if (doc.acknowledgedAt) parts.push(`Receipt acknowledged by the worker ${londonTime(doc.acknowledgedAt)}.`);
  if (doc.status === 'ACCEPTED' && doc.acceptedAt) {
    parts.push(`Agreed electronically by "${doc.acceptedName}" on ${londonTime(doc.acceptedAt)} (${doc.acceptanceMethod})${opts.internal && doc.acceptanceRecordedBy ? `, recorded by ${doc.acceptanceRecordedBy}` : ''}.`);
    if (doc.acceptanceStatement) parts.push(`Statement confirmed: "${doc.acceptanceStatement}"`);
    parts.push('This is an electronic agreement, not a qualified electronic signature.');
  } else {
    parts.push(`Status: ${doc.status.toLowerCase()}.`);
  }
  if (doc.bodySha256) parts.push(`Text fingerprint (SHA-256): ${doc.bodySha256.slice(0, 16)}…`);
  parts.push(`Ref ${doc.id}.`);
  return parts.join(' ');
}

export function clientDocFooter(doc: ClientDocument, opts: { internal: boolean }) {
  const parts = [`Terms of Business, version ${doc.version}. Issued ${londonTime(doc.issuedAt)}${opts.internal ? ` by ${doc.issuedBy}` : ''}.`];
  if (doc.status === 'ACCEPTED' && doc.acceptedAt) {
    parts.push(`Accepted for ${doc.legalBusinessName} by ${doc.acceptedByName}${doc.acceptedByJobTitle ? ` (${doc.acceptedByJobTitle})` : ''}, typed name "${doc.typedName}", on ${londonTime(doc.acceptedAt)} (${doc.acceptanceMethod})${opts.internal && doc.acceptanceRecordedBy ? `, recorded by ${doc.acceptanceRecordedBy}` : ''}.`);
    parts.push(`Statement confirmed: "${doc.acceptanceStatement}" This is an electronic acceptance, not a qualified electronic signature.`);
  } else {
    parts.push(`Status: ${doc.status.toLowerCase()}.`);
  }
  parts.push(`Text fingerprint (SHA-256): ${doc.bodySha256.slice(0, 16)}…. Ref ${doc.id}.`);
  return parts.join(' ');
}

export const notCurrentBanner = (status: string) =>
  status === 'SUPERSEDED' || status === 'WITHDRAWN' ? `This document was ${status.toLowerCase()} and is no longer current. It is kept as the record of what was issued.` : undefined;

r.get('/document/:id', async (req, res, next) => {
  try {
    const doc = await prisma.workerDocument.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!doc) return res.status(404).send('Document not found');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(page(
      `${DOC_TYPE_LABELS[doc.type as OpsDocType]} — ${doc.user.firstName} ${doc.user.lastName}`,
      workerDocFooter(doc, { internal: true }),
      textToHtml(doc.renderedBody),
      notCurrentBanner(doc.status),
    ));
  } catch (error) { next(error); }
});

r.get('/client-terms/:id', async (req, res, next) => {
  try {
    const doc = await prisma.clientDocument.findUnique({ where: { id: req.params.id }, include: { client: { select: { companyName: true } } } });
    if (!doc) return res.status(404).send('Document not found');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(page(`Terms of Business v${doc.version} — ${doc.client.companyName}`, clientDocFooter(doc, { internal: true }), textToHtml(doc.renderedBody), notCurrentBanner(doc.status)));
  } catch (error) { next(error); }
});

/**
 * Booking Confirmation for the client: what was booked and the booking's own
 * charges, which the Terms of Business refer to. Built from the booking as it
 * stands now; print it when the booking is confirmed to keep the record.
 */
r.get('/booking/:id', async (req, res, next) => {
  try {
    const b = await prisma.opsBooking.findUnique({ where: { id: req.params.id }, include: { client: true, requirements: { orderBy: { createdAt: 'asc' } }, costs: { where: { kind: 'CHARGE' } } } });
    if (!b) return res.status(404).send('Booking not found');
    const gbp = (v: number | null) => (v == null ? '—' : `£${v.toFixed(2)}`);
    const rows = b.requirements.map((q) => {
      const mult = toNum(q.afterMidnightMultiplier);
      const charge = toNum(q.clientChargeRate) ?? 0;
      return `<tr><td>${esc(q.role)}</td><td>${q.quantity}</td><td>${gbp(charge)}/h</td><td>${esc(String(toNum(q.minimumHours) ?? PRICING.minimumChargeHours))} h</td>` +
        `<td>${q.overtimeChargeRate != null ? `${gbp(toNum(q.overtimeChargeRate))}/h${q.overtimeAfterHours != null ? ` after ${toNum(q.overtimeAfterHours)} h` : ''}` : '—'}</td>` +
        `<td>${mult && mult !== 1 ? `${gbp(charge * mult)}/h after midnight` : '—'}</td><td>${esc(q.otherCharges ?? '—')}</td></tr>`;
    }).join('');
    const extras = b.costs.map((c) => `<li>${esc(c.category)}${c.description ? `: ${esc(c.description)}` : ''} — ${gbp(c.amountPence / 100)}</li>`).join('');
    const days = b.paymentTermsDays;
    const body = `<h1>Booking Confirmation</h1>
<p>${esc(companyValues()['company.legalName'])} trading as ${esc(companyValues()['company.tradingName'])} confirms the following Booking under its Terms of Business for Temporary Staff Supply${b.termsVersionAtBooking ? ` (${esc(b.termsVersionAtBooking)})` : ''}.</p>
<p>Reference: <strong>${esc(b.reference)}</strong><br>Client: ${esc(b.client.companyName)}${b.client.tradingName ? ` t/a ${esc(b.client.tradingName)}` : ''}<br>Date: ${esc(longDate(dateKey(b.eventDate)) ?? '')}<br>Times: ${esc(b.startTime)} to ${esc(b.expectedFinish)}<br>Venue: ${esc([b.venue, b.address].filter(Boolean).join(', ') || 'To be confirmed')}<br>On-site contact: ${esc([b.onSiteContactName, b.onSiteContactPhone].filter(Boolean).join(', ') || 'To be confirmed')}</p>
<h2>Charges</h2>
<table><thead><tr><th>Role</th><th>Staff</th><th>Charge rate</th><th>Minimum per shift</th><th>Overtime</th><th>After midnight</th><th>Other</th></tr></thead><tbody>${rows || '<tr><td colspan="7">No roles added yet.</td></tr>'}</tbody></table>
${extras ? `<h2>Other agreed charges</h2><ul>${extras}</ul>` : ''}
<p>Charges are for hours actually worked, subject to the minimum per shift. VAT is added where applicable.</p>
<h2>Payment</h2>
<p>${b.advancePaymentRequired ? 'Payment is required in advance of the event. Staff are supplied once payment has cleared.' : `Invoice payable within ${days ?? 'the number of'} days${days == null ? ' set out in the Terms of Business' : ''} of the invoice date.`}</p>`;
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(page(`Booking Confirmation ${b.reference}`, `Prepared ${londonDateKey(new Date())}. Booking status: ${b.status.toLowerCase().replace(/_/g, ' ')}.`, body,
      ['DRAFT', 'QUOTED'].includes(b.status) ? 'This booking is not confirmed yet. This is a draft, not a Booking Confirmation.' : undefined));
  } catch (error) { next(error); }
});

r.get('/template/:id', async (req, res, next) => {
  try {
    const tpl = await prisma.documentTemplate.findUnique({ where: { id: req.params.id } });
    if (!tpl) return res.status(404).send('Template not found');
    const preview = renderTemplate(tpl.body, {
      ...companyValues(), ...frozenValues(tpl.variables), today: longDate(londonDateKey(new Date())), 'doc.version': tpl.version,
      'doc.effectiveDate': longDate(tpl.effectiveDate ? dateKey(tpl.effectiveDate) : londonDateKey(tpl.createdAt)),
      'worker.name': 'Sample Worker', 'worker.firstName': 'Sample', 'client.legalName': 'Sample Client Ltd',
    });
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(page(
      `${DOC_TYPE_LABELS[tpl.type as OpsDocType]} v${tpl.version} (preview)`,
      `Template preview, version ${tpl.version}${tpl.retiredAt ? ` (superseded ${londonDay(tpl.retiredAt)})` : ''}. Created by ${tpl.createdBy}. Sample values are shown where worker or client details would go.`,
      textToHtml(preview),
      'Preview with sample values. Not issued to anyone.',
    ));
  } catch (error) { next(error); }
});

export default r;
