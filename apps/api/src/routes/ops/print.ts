/**
 * Print/PDF pages for issued documents and template previews. Served behind
 * adminPageAuth at /ops/print/...; the browser's "Save as PDF" makes the PDF.
 * Every piece of text is escaped: templates are text, never markup.
 */

import { Router } from 'express';
import { prisma } from '../../prisma';
import { DOC_TYPE_LABELS, renderTemplate, type OpsDocType } from '../../ops/documents';
import { companyValues } from './workers';
import { londonDateKey } from '../../ops/time';

const r = Router();

function esc(value: string) {
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

function page(title: string, footer: string, body: string, banner?: string) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${esc(title)}</title>
<style>
  :root { color-scheme: light; }
  body { font: 11pt/1.5 Georgia, 'Times New Roman', serif; color: #111; background: #fff; max-width: 720px; margin: 32px auto; padding: 0 20px; }
  h1 { font-size: 20pt; margin: 0 0 12px; } h2 { font-size: 13pt; margin: 22px 0 6px; }
  p { margin: 0 0 10px; } ul { margin: 0 0 10px 20px; padding: 0; }
  .bar { font: 13px system-ui, sans-serif; display: flex; gap: 12px; justify-content: space-between; align-items: center; padding: 10px 12px; background: #f3f1ec; border: 1px solid #ddd; margin-bottom: 24px; }
  .banner { font: 13px system-ui, sans-serif; padding: 10px 12px; border: 1px solid #c8a200; background: #fff8d6; margin-bottom: 18px; }
  footer { margin-top: 32px; padding-top: 8px; border-top: 1px solid #ccc; font: 9pt system-ui, sans-serif; color: #555; }
  button { font: inherit; padding: 6px 14px; cursor: pointer; }
  @media print { .bar { display: none; } body { margin: 0 auto; } }
</style></head><body>
<div class="bar"><span>VERGO Ops · ${esc(title)}</span><button type="button" id="print-btn">Print / Save as PDF</button></div>
${banner ? `<div class="banner">${esc(banner)}</div>` : ''}
${body}
<footer>${esc(footer)}</footer>
<script src="/js/ops-print.js"></script>
</body></html>`;
}

r.get('/document/:id', async (req, res, next) => {
  try {
    const doc = await prisma.workerDocument.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!doc) return res.status(404).send('Document not found');
    const label = DOC_TYPE_LABELS[doc.type as OpsDocType];
    const status = doc.status === 'ACCEPTED' && doc.acceptedAt
      ? `Accepted electronically by "${doc.acceptedName}" on ${doc.acceptedAt.toLocaleString('en-GB', { timeZone: 'Europe/London' })} (${doc.acceptanceMethod}), recorded by ${doc.acceptanceRecordedBy}. This is a record of acceptance, not a qualified electronic signature.`
      : `Status: ${doc.status.toLowerCase()}.`;
    const banner = doc.status === 'SUPERSEDED' || doc.status === 'WITHDRAWN'
      ? `This document was ${doc.status.toLowerCase()} and is no longer current.`
      : undefined;
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(page(
      `${label} — ${doc.user.firstName} ${doc.user.lastName}`,
      `${label}, version ${doc.version}. Issued ${doc.issuedAt.toLocaleDateString('en-GB', { timeZone: 'Europe/London' })} by ${doc.issuedBy}. ${status} Ref ${doc.id}.`,
      textToHtml(doc.renderedBody),
      banner,
    ));
  } catch (error) { next(error); }
});

r.get('/template/:id', async (req, res, next) => {
  try {
    const tpl = await prisma.documentTemplate.findUnique({ where: { id: req.params.id } });
    if (!tpl) return res.status(404).send('Template not found');
    const preview = renderTemplate(tpl.body, { ...companyValues(), today: londonDateKey(new Date()), 'doc.version': tpl.version, 'worker.name': 'Sample Worker', 'worker.firstName': 'Sample' });
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(page(
      `${DOC_TYPE_LABELS[tpl.type as OpsDocType]} v${tpl.version} (preview)`,
      `Template preview, version ${tpl.version}${tpl.retiredAt ? ' (retired)' : ''}. Created by ${tpl.createdBy}. Sample values are shown where worker details would go.`,
      textToHtml(preview),
      'Preview with sample values. Not issued to anyone.',
    ));
  } catch (error) { next(error); }
});

export default r;
