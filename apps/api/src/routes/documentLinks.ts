/**
 * The pages a worker or client opens from their secure document link.
 *
 *   GET  /d/:token                       the worker pack or the client's Terms
 *   GET  /d/:token/doc/:docId            one document, printable / save as PDF
 *   GET  /api/v1/document-links/:token   the same, as JSON
 *   POST /api/v1/document-links/:token/kid/:docId/acknowledge
 *   POST /api/v1/document-links/:token/agreement/:docId/accept
 *   POST /api/v1/document-links/:token/terms/:docId/accept
 *
 * The token is the only credential: 32 random bytes, stored as a SHA-256
 * hash, expiring after 30 days, revocable in Ops. A link is bound to one
 * worker or one client, and every document id is looked up together with
 * that subject, so changing an id in the URL can never reach anyone else's
 * documents (it is a 404, the same as a document that does not exist).
 * If a worker is also signed in to the VERGO site as themselves, that
 * identity is recorded with their agreement.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { DocumentLink } from '@prisma/client';
import { prisma } from '../prisma';
import { resolveLink, acknowledgeKid, acceptAgreement, acceptClientTerms, type AcceptanceEvidence } from '../ops/documentService';
import { AGREEMENT_STATEMENT, CLIENT_TERMS_STATEMENT, KID_ACKNOWLEDGEMENT, companyValues } from '../ops/documents';
import { esc, textToHtml, page, workerDocFooter, clientDocFooter, notCurrentBanner } from './ops/print';
import { dateKey } from '../ops/time';

const noStore = (res: Response) => {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
};

const londonTime = (d: Date) => d.toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

async function linkOr404(req: Request, res: Response): Promise<DocumentLink | null> {
  const link = await resolveLink(String(req.params.token ?? ''));
  if (!link) {
    noStore(res);
    res.status(404);
    return null;
  }
  return link;
}

const linkActor = (link: DocumentLink) => (link.kind === 'WORKER_PACK' ? 'worker (secure link)' : 'client (secure link)');

function evidence(req: Request, link: DocumentLink, method: string): AcceptanceEvidence {
  const sessionUser = req.session?.isUser && req.session.userId ? req.session.userId : null;
  return {
    channel: 'link', method, linkId: link.id,
    authUserId: sessionUser && sessionUser === link.userId ? sessionUser : null,
    ip: req.ip ?? null, userAgent: String(req.headers['user-agent'] ?? '') || null,
  };
}

// ── What a link shows ─────────────────────────────────────────────────────

export async function workerPackState(userId: string) {
  const [user, docs] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } }),
    prisma.workerDocument.findMany({
      where: { userId, type: { in: ['KEY_INFORMATION_DOCUMENT', 'ZERO_HOURS_AGREEMENT', 'ASSIGNMENT_CONFIRMATION'] } },
      orderBy: { issuedAt: 'desc' },
      include: { booking: { select: { eventDate: true, shiftStart: true, role: true, venue: true } } },
    }),
  ]);
  const kid = docs.find((d) => d.type === 'KEY_INFORMATION_DOCUMENT' && d.status === 'ISSUED') ?? null;
  const agreed = docs.find((d) => d.type === 'ZERO_HOURS_AGREEMENT' && d.status === 'ACCEPTED') ?? null;
  const pending = docs.find((d) => d.type === 'ZERO_HOURS_AGREEMENT' && d.status === 'ISSUED' && (!agreed || d.version > agreed.version)) ?? null;
  const confirmations = docs.filter((d) => d.type === 'ASSIGNMENT_CONFIRMATION' && (d.status === 'ISSUED' || d.status === 'ACCEPTED')).slice(0, 20);
  return { user, kid, agreed, pending, confirmations, history: docs.filter((d) => d.status === 'SUPERSEDED' && d.type !== 'ASSIGNMENT_CONFIRMATION') };
}

export async function clientTermsState(clientId: string) {
  const [client, docs] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: { companyName: true, tradingName: true, contactName: true, clientType: true } }),
    prisma.clientDocument.findMany({ where: { clientId }, orderBy: { issuedAt: 'desc' } }),
  ]);
  const accepted = docs.find((d) => d.status === 'ACCEPTED') ?? null;
  const pending = docs.find((d) => d.status === 'ISSUED' && (!accepted || d.version > accepted.version)) ?? null;
  return { client, accepted, pending, consumer: client?.clientType === 'PRIVATE_CONSUMER' };
}

// ── Pages ─────────────────────────────────────────────────────────────────

const STYLE = `
  :root { --bg:#1C1F22; --surface:#25292D; --ink:#F3F1EC; --muted:#B9B6AE; --line:#3A3F44; --accent:#6FC29B; --accent-ink:#0F1D17; --warn:#E8C26B; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.55 'DM Sans', system-ui, -apple-system, Segoe UI, sans-serif; }
  .wrap { max-width:760px; margin:0 auto; padding:24px 16px 64px; }
  .brand { font-weight:700; letter-spacing:.14em; font-size:14px; color:var(--accent); }
  h1 { font-size:26px; line-height:1.2; margin:8px 0 6px; }
  .lede { color:var(--muted); margin:0 0 20px; }
  .steps { display:flex; gap:8px; flex-wrap:wrap; margin:0 0 20px; padding:0; list-style:none; font-size:14px; }
  .steps li { padding:6px 12px; border:1px solid var(--line); border-radius:999px; color:var(--muted); }
  .steps li.done { border-color:var(--accent); color:var(--accent); }
  .steps li.now { border-color:var(--ink); color:var(--ink); }
  .card { background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:18px; margin:0 0 18px; }
  .card h2 { margin:0 0 4px; font-size:19px; }
  .meta { color:var(--muted); font-size:14px; margin:0 0 12px; }
  .doc { background:#fff; color:#111; border-radius:10px; padding:16px 18px; max-height:55vh; overflow:auto; font:15px/1.55 Georgia, 'Times New Roman', serif; }
  .doc h1 { font-size:20px; margin:0 0 10px; } .doc h2 { font-size:16px; margin:18px 0 6px; } .doc p { margin:0 0 10px; } .doc ul { margin:0 0 10px 18px; padding:0; }
  .row { display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin:12px 0 0; }
  a { color:var(--accent); }
  .btn { display:inline-block; border:0; border-radius:10px; padding:12px 18px; font-family:inherit; font-size:16px; font-weight:600; line-height:1.2; cursor:pointer; text-decoration:none; }
  .btn-primary { background:var(--accent); color:var(--accent-ink); }
  .btn-ghost { background:transparent; color:var(--ink); border:1px solid var(--line); }
  .btn[disabled] { opacity:.5; cursor:not-allowed; }
  label.check { display:flex; gap:10px; align-items:flex-start; margin:14px 0 0; cursor:pointer; }
  label.check input { width:22px; height:22px; margin-top:2px; flex:none; accent-color:var(--accent); }
  .field { margin:12px 0 0; } .field label { display:block; font-size:14px; color:var(--muted); margin:0 0 4px; }
  .field input { width:100%; padding:12px; border-radius:10px; border:1px solid var(--line); background:var(--bg); color:var(--ink); font:inherit; }
  .ok { color:var(--accent); font-weight:600; } .warn { color:var(--warn); }
  .msg { margin:10px 0 0; min-height:1.2em; color:var(--warn); }
  .locked { color:var(--muted); font-style:italic; }
  ul.list { padding-left:18px; margin:6px 0 0; }
  footer { color:var(--muted); font-size:13px; margin-top:28px; }
`;

function shell(title: string, body: string) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer"><meta name="theme-color" content="#1C1F22">
<title>${esc(title)}</title><style>${STYLE}</style></head>
<body><div class="wrap"><div class="brand">VERGO</div>${body}
<footer>${esc(companyValues()['company.legalName'])} trading as ${esc(companyValues()['company.tradingName'])}, company number ${esc(companyValues()['company.number'])}. Questions: <a href="mailto:${esc(companyValues()['company.email'])}">${esc(companyValues()['company.email'])}</a> or ${esc(companyValues()['company.phone'])}. This link is personal to you; please do not share it.</footer>
</div><script src="/js/document-links.js"></script></body></html>`;
}

const expiredPage = () => shell('Link not valid', '<h1>This link is not valid</h1><p class="lede">It may have expired or been replaced. Please contact VERGO and we will send you a new one.</p>');

function docCard(token: string, doc: { id: string; renderedBody: string }, label: string) {
  return `<div class="doc" tabindex="0" aria-label="${esc(label)}">${textToHtml(doc.renderedBody)}</div>
<div class="row"><a class="btn btn-ghost" href="/d/${esc(token)}/doc/${esc(doc.id)}" target="_blank" rel="noopener">Open full page / print / save as PDF</a></div>`;
}

function workerPage(token: string, s: Awaited<ReturnType<typeof workerPackState>>) {
  const name = s.user ? s.user.firstName : '';
  const kidDone = Boolean(s.kid?.acknowledgedAt);
  const agreementDone = Boolean(s.agreed) && !s.pending;
  const step = (label: string, done: boolean, now: boolean) => `<li class="${done ? 'done' : now ? 'now' : ''}">${done ? '✓ ' : ''}${esc(label)}</li>`;

  let kidCard: string;
  if (!s.kid) {
    kidCard = '<div class="card"><h2>1. Key Information Document</h2><p class="locked">VERGO has not issued your Key Information Document yet.</p></div>';
  } else {
    kidCard = `<div class="card"><h2>1. Key Information Document</h2><p class="meta">Version ${s.kid.version}, issued ${esc(londonTime(s.kid.issuedAt))}</p>
${docCard(token, s.kid, 'Key Information Document')}
${kidDone
    ? `<p class="ok">✓ You confirmed you received this on ${esc(londonTime(s.kid.acknowledgedAt!))}.</p>`
    : `<form data-action="/api/v1/document-links/${esc(token)}/kid/${esc(s.kid.id)}/acknowledge">
<label class="check"><input type="checkbox" name="acknowledged" required> <span>${esc(KID_ACKNOWLEDGEMENT)}</span></label>
<div class="row"><button class="btn btn-primary" type="submit">Confirm I have received it</button></div><p class="msg" role="status"></p></form>`}
</div>`;
  }

  let agreementCard: string;
  const toAgree = s.pending;
  if (toAgree) {
    agreementCard = `<div class="card"><h2>2. Zero-Hours Employment Agreement</h2><p class="meta">Version ${toAgree.version}, issued ${esc(londonTime(toAgree.issuedAt))}${s.agreed ? `. You agreed version ${s.agreed.version} on ${esc(londonTime(s.agreed.acceptedAt!))}; this newer version replaces it once you agree it.` : ''}</p>
${kidDone ? `${docCard(token, toAgree, 'Zero-Hours Employment Agreement')}
<form data-action="/api/v1/document-links/${esc(token)}/agreement/${esc(toAgree.id)}/accept">
<label class="check"><input type="checkbox" name="agree" required> <span>${esc(AGREEMENT_STATEMENT)}</span></label>
<div class="field"><label for="typedName">Your full name</label><input id="typedName" name="typedName" autocomplete="name" required minlength="2" maxlength="200"></div>
<div class="row"><button class="btn btn-primary" type="submit">Agree</button></div>
<p class="meta">This is an electronic agreement. Typing your name and pressing Agree records your agreement to this exact version, with the date and time.</p>
<p class="msg" role="status"></p></form>`
    : '<p class="locked">Please read and confirm your Key Information Document first. The agreement opens once you have.</p>'}
</div>`;
  } else if (s.agreed) {
    agreementCard = `<div class="card"><h2>2. Zero-Hours Employment Agreement</h2><p class="ok">✓ You agreed version ${s.agreed.version} on ${esc(londonTime(s.agreed.acceptedAt!))} as “${esc(s.agreed.acceptedName ?? '')}”.</p>
<div class="row"><a class="btn btn-ghost" href="/d/${esc(token)}/doc/${esc(s.agreed.id)}" target="_blank" rel="noopener">View / print / save your agreement</a></div></div>`;
  } else {
    agreementCard = '<div class="card"><h2>2. Zero-Hours Employment Agreement</h2><p class="locked">VERGO has not issued your agreement yet.</p></div>';
  }

  const confirmations = s.confirmations.length
    ? `<div class="card"><h2>Assignment confirmations</h2><ul class="list">${s.confirmations.map((c) => `<li><a href="/d/${esc(token)}/doc/${esc(c.id)}" target="_blank" rel="noopener">${esc(c.booking ? `${dateKey(c.booking.eventDate)} ${c.booking.shiftStart} ${c.booking.role ?? ''} ${c.booking.venue ?? ''}` : `Issued ${londonTime(c.issuedAt)}`)}</a></li>`).join('')}</ul></div>`
    : '';

  return shell('Your VERGO documents', `<h1>Your employment documents</h1>
<p class="lede">Hi ${esc(name)}. Please read your Key Information Document, confirm you have received it, then read and agree your employment agreement.</p>
<ol class="steps">${step('Key Information Document', kidDone, !kidDone)}${step('Employment agreement', agreementDone, kidDone && !agreementDone)}</ol>
${kidCard}${agreementCard}${confirmations}`);
}

function clientPage(token: string, s: Awaited<ReturnType<typeof clientTermsState>>) {
  if (s.consumer) {
    return shell('VERGO booking terms', '<h1>Consumer booking terms required</h1><p class="lede">Our business Terms of Business do not apply to private bookings. Please contact VERGO and we will send you the right terms for your booking.</p>');
  }
  const company = s.client ? s.client.companyName : '';
  let body = `<h1>Terms of Business</h1><p class="lede">VERGO Staffing Terms of Business for Temporary Staff Supply, for ${esc(company)}.</p>`;
  if (s.pending) {
    body += `<div class="card"><h2>Version ${s.pending.version}</h2><p class="meta">Issued ${esc(londonTime(s.pending.issuedAt))}${s.accepted ? `. Version ${s.accepted.version} was accepted on ${esc(londonTime(s.accepted.acceptedAt!))}; this version replaces it once accepted.` : ''}</p>
${docCard(token, s.pending, 'Terms of Business')}
<form data-action="/api/v1/document-links/${esc(token)}/terms/${esc(s.pending.id)}/accept">
<div class="field"><label for="legalBusinessName">Legal business name</label><input id="legalBusinessName" name="legalBusinessName" required minlength="2" maxlength="200" value="${esc(company)}"></div>
<div class="field"><label for="acceptedByName">Your name</label><input id="acceptedByName" name="acceptedByName" autocomplete="name" required minlength="2" maxlength="200"></div>
<div class="field"><label for="jobTitle">Your job title (optional)</label><input id="jobTitle" name="jobTitle" autocomplete="organization-title" maxlength="120"></div>
<label class="check"><input type="checkbox" name="authorised" required> <span>${esc(CLIENT_TERMS_STATEMENT)}</span></label>
<div class="field"><label for="typedName">Type your full name to accept</label><input id="typedName" name="typedName" required minlength="2" maxlength="200"></div>
<div class="row"><button class="btn btn-primary" type="submit">Accept the Terms of Business</button></div>
<p class="meta">This is an electronic acceptance of this exact version, recorded with the date and time.</p>
<p class="msg" role="status"></p></form></div>`;
  } else if (s.accepted) {
    body += `<div class="card"><p class="ok">✓ Version ${s.accepted.version} accepted for ${esc(s.accepted.legalBusinessName ?? '')} by ${esc(s.accepted.acceptedByName ?? '')} on ${esc(londonTime(s.accepted.acceptedAt!))}.</p>
<div class="row"><a class="btn btn-ghost" href="/d/${esc(token)}/doc/${esc(s.accepted.id)}" target="_blank" rel="noopener">View / print / save the Terms</a></div></div>`;
  } else {
    body += '<div class="card"><p class="locked">There are no Terms waiting for you. Please contact VERGO.</p></div>';
  }
  return shell('VERGO Terms of Business', body);
}

export const pages = Router();

pages.get('/:token', async (req, res, next) => {
  try {
    const link = await linkOr404(req, res);
    if (!link) return res.send(expiredPage());
    noStore(res);
    await prisma.documentLink.update({ where: { id: link.id }, data: { lastOpenedAt: new Date() } });
    if (link.kind === 'WORKER_PACK' && link.userId) return res.send(workerPage(req.params.token, await workerPackState(link.userId)));
    if (link.kind === 'CLIENT_TERMS' && link.clientId) return res.send(clientPage(req.params.token, await clientTermsState(link.clientId)));
    res.status(404).send(expiredPage());
  } catch (error) { next(error); }
});

pages.get('/:token/doc/:docId', async (req, res, next) => {
  try {
    const link = await linkOr404(req, res);
    if (!link) return res.send(expiredPage());
    noStore(res);
    if (link.kind === 'WORKER_PACK' && link.userId) {
      const doc = await prisma.workerDocument.findFirst({ where: { id: req.params.docId, userId: link.userId, type: { in: ['KEY_INFORMATION_DOCUMENT', 'ZERO_HOURS_AGREEMENT', 'ASSIGNMENT_CONFIRMATION'] } } });
      if (!doc) return res.status(404).send(shell('Not found', '<h1>Document not found</h1>'));
      return res.send(page(doc.type === 'KEY_INFORMATION_DOCUMENT' ? 'Key Information Document' : doc.type === 'ZERO_HOURS_AGREEMENT' ? 'Zero-Hours Employment Agreement' : 'Assignment Confirmation',
        workerDocFooter(doc, { internal: false }), textToHtml(doc.renderedBody), notCurrentBanner(doc.status), 'VERGO'));
    }
    if (link.kind === 'CLIENT_TERMS' && link.clientId) {
      const doc = await prisma.clientDocument.findFirst({ where: { id: req.params.docId, clientId: link.clientId } });
      if (!doc) return res.status(404).send(shell('Not found', '<h1>Document not found</h1>'));
      return res.send(page('Terms of Business', clientDocFooter(doc, { internal: false }), textToHtml(doc.renderedBody), notCurrentBanner(doc.status), 'VERGO'));
    }
    res.status(404).send(expiredPage());
  } catch (error) { next(error); }
});

// ── API ───────────────────────────────────────────────────────────────────

export const api = Router();

api.use(rateLimit({ windowMs: 10 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false }));

function handle(fn: (req: Request, res: Response, link: DocumentLink) => Promise<unknown>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      noStore(res);
      const link = await resolveLink(String(req.params.token ?? ''));
      if (!link) return res.status(404).json({ ok: false, error: 'This link is not valid. It may have expired or been replaced.' });
      await fn(req, res, link);
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ ok: false, error: error.issues[0]?.message ?? 'Check the form and try again.' });
      if (error?.statusCode) return res.status(error.statusCode).json({ ok: false, error: error.message });
      next(error);
    }
  };
}

const summarise = <T extends { id: string; version: number; status: string; issuedAt: Date; acceptedAt: Date | null }>(d: T | null) =>
  d && { id: d.id, version: d.version, status: d.status, issuedAt: d.issuedAt, acceptedAt: d.acceptedAt };

api.get('/:token', handle(async (_req, res, link) => {
  if (link.kind === 'WORKER_PACK' && link.userId) {
    const s = await workerPackState(link.userId);
    return res.json({
      ok: true, data: {
        kind: 'worker',
        kid: s.kid && { ...summarise(s.kid), acknowledgedAt: s.kid.acknowledgedAt },
        agreed: summarise(s.agreed), pending: summarise(s.pending),
        confirmations: s.confirmations.map((c) => summarise(c)),
      },
    });
  }
  const s = await clientTermsState(link.clientId!);
  if (s.consumer) return res.json({ ok: true, data: { kind: 'client', consumerTermsRequired: true, accepted: null, pending: null } });
  res.json({ ok: true, data: { kind: 'client', consumerTermsRequired: false, accepted: summarise(s.accepted), pending: summarise(s.pending) } });
}));

api.post('/:token/kid/:docId/acknowledge', handle(async (req, res, link) => {
  if (link.kind !== 'WORKER_PACK' || !link.userId) return res.status(404).json({ ok: false, error: 'Document not found' });
  z.object({ acknowledged: z.literal(true, { errorMap: () => ({ message: 'Tick the box to confirm you have received it.' }) }) }).parse(req.body);
  await acknowledgeKid(link.userId, req.params.docId, evidence(req, link, 'Acknowledged via secure link'), linkActor(link));
  res.json({ ok: true });
}));

api.post('/:token/agreement/:docId/accept', handle(async (req, res, link) => {
  if (link.kind !== 'WORKER_PACK' || !link.userId) return res.status(404).json({ ok: false, error: 'Document not found' });
  const body = z.object({
    agree: z.literal(true, { errorMap: () => ({ message: 'Tick the box to confirm you have read and agree to the agreement.' }) }),
    typedName: z.string({ required_error: 'Type your full name.' }).trim().min(2, 'Type your full name.').max(200),
  }).parse(req.body);
  await acceptAgreement(link.userId, req.params.docId, body.typedName, evidence(req, link, 'Electronic agreement via secure link'), linkActor(link));
  res.json({ ok: true });
}));

api.post('/:token/terms/:docId/accept', handle(async (req, res, link) => {
  if (link.kind !== 'CLIENT_TERMS' || !link.clientId) return res.status(404).json({ ok: false, error: 'Document not found' });
  const body = z.object({
    authorised: z.literal(true, { errorMap: () => ({ message: 'Tick the box to confirm you are authorised and agree.' }) }),
    legalBusinessName: z.string().trim().min(2, 'Give the legal business name.').max(200),
    acceptedByName: z.string().trim().min(2, 'Give your name.').max(200),
    jobTitle: z.string().trim().max(120).optional().nullable(),
    typedName: z.string().trim().min(2, 'Type your full name to accept.').max(200),
  }).parse(req.body);
  await acceptClientTerms(link.clientId, req.params.docId, body, evidence(req, link, 'Electronic acceptance via secure link'), linkActor(link));
  res.json({ ok: true });
}));
