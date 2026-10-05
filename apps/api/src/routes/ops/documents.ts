/**
 * VERGO Ops: Documents & Terms. Templates and their versions, issuing the
 * worker pack (KID, then the agreement), client Terms of Business, secure
 * links (and emailing them), recording acceptances received outside a link,
 * and the outstanding-documents overview.
 * Mounted under /api/v1/ops behind adminAuth (session + CSRF).
 */

import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../prisma';
import { writeAudit, actorOf } from '../../ops/audit';
import { loadWorkers, loadWorker, WORKER_WHERE } from '../../ops/service';
import {
  ACCEPTABLE_TYPES, DOC_TYPE_LABELS, LEGAL_DOC_TYPES, needsWording, templateKeys, type OpsDocType,
} from '../../ops/documents';
import {
  acceptAgreement, acceptClientTerms, clientTermsPositionOf, clientTermsPositions, createLink, createTemplateVersion,
  ensureDefaultTemplates, issueClientTerms, issueWorkerDocument, issueWorkerPack, revokeLinks, termsReviewFor, versionInfo,
} from '../../ops/documentService';
import { clientTermsGate, contractCounts, kidCounts } from '../../ops/compliance';
import {
  COMMERCIAL_REVIEW_KEY, OWNER_REVIEW_LABEL, commercialTermsHash, loadCommercialReview, loadOpsSettings,
} from '../../ops/settings';
import { sendDocumentLinkEmail } from '../../services/email';
import { handle, fail, ymd, optionalText } from './common';

const r = Router();

const DOC_TYPES = Object.keys(DOC_TYPE_LABELS) as [OpsDocType, ...OpsDocType[]];

// ── Templates and versions ────────────────────────────────────────────────

r.get('/templates', handle(async (_req, res) => {
  await ensureDefaultTemplates();
  const [templates, workerAccepted, clientIssued, clientAccepted, settings] = await Promise.all([
    prisma.documentTemplate.findMany({ orderBy: [{ type: 'asc' }, { version: 'desc' }], include: { _count: { select: { issued: true } } } }),
    prisma.workerDocument.groupBy({ by: ['templateId'], where: { status: 'ACCEPTED' }, _count: { _all: true } }),
    prisma.clientDocument.groupBy({ by: ['templateId'], _count: { _all: true } }),
    prisma.clientDocument.groupBy({ by: ['templateId'], where: { status: 'ACCEPTED' }, _count: { _all: true } }),
    loadOpsSettings(),
  ]);
  const count = (rows: Array<{ templateId: string; _count: { _all: number } }>) => new Map(rows.map((row) => [row.templateId, row._count._all]));
  const [wa, ci, ca] = [count(workerAccepted), count(clientIssued), count(clientAccepted)];
  const commercial = await loadCommercialReview(settings.clientCommercialTerms);
  const data = await Promise.all(templates.map(async (t) => ({
    id: t.id, type: t.type, version: t.version, title: t.title, body: t.body, changeNote: t.changeNote,
    createdAt: t.createdAt, createdBy: t.createdBy, effectiveDate: t.effectiveDate, retiredAt: t.retiredAt,
    requiresReacceptance: t.requiresReacceptance, variables: t.variables,
    label: DOC_TYPE_LABELS[t.type as OpsDocType],
    status: t.retiredAt == null ? 'CURRENT' : 'SUPERSEDED',
    current: t.retiredAt == null,
    needsWording: needsWording(t.body),
    systemDraft: t.createdBy === 'system',
    keys: templateKeys(t.body),
    issuedCount: t._count.issued + (ci.get(t.id) ?? 0),
    acceptedCount: (wa.get(t.id) ?? 0) + (ca.get(t.id) ?? 0),
    ownerReview: t.type === 'CLIENT_TERMS_OF_BUSINESS' ? await termsReviewFor(t) : null,
  })));
  res.json({ ok: true, data, commercialReview: commercial });
}));

const newTemplateBody = z.object({
  type: z.enum(DOC_TYPES),
  title: z.string().trim().min(3).max(200),
  body: z.string().min(20).max(60000),
  changeNote: z.string().trim().min(3).max(500),
  effectiveDate: ymd.optional(),
  /** A material change: people on earlier versions must agree this one. */
  requiresReacceptance: z.boolean().optional(),
});

r.post('/templates', handle(async (req, res) => {
  const body = newTemplateBody.parse(req.body);
  await ensureDefaultTemplates();
  const created = await createTemplateVersion(body, actorOf(req));
  res.status(201).json({ ok: true, data: created });
}));

// ── Worker documents ──────────────────────────────────────────────────────

const issueBody = z.object({ type: z.enum(DOC_TYPES) });

r.post('/workers/:id/documents', handle(async (req, res) => {
  const { type } = issueBody.parse(req.body);
  const worker = await loadWorker(req.params.id);
  if (!worker) fail(404, 'Worker not found');
  const doc = await issueWorkerDocument(worker.id, type, actorOf(req));
  res.status(201).json({ ok: true, data: doc });
}));

const linkBody = z.object({ email: z.boolean().optional() });

async function workerLink(userId: string, actor: string, email: boolean) {
  const user = await prisma.user.findFirst({ where: { AND: [WORKER_WHERE, { id: userId }] }, select: { id: true, firstName: true, email: true } });
  if (!user) fail(404, 'Worker not found');
  const link = await createLink({ kind: 'WORKER_PACK', userId: user.id }, actor);
  const delivery = email ? await emailLink(link, { to: user.email, name: user.firstName, kind: 'worker', userId: user.id }, actor) : null;
  return { path: link.path, url: link.url, expiresAt: link.link.expiresAt, email: delivery };
}

async function emailLink(
  link: Awaited<ReturnType<typeof createLink>>,
  to: { to: string; name: string; kind: 'worker' | 'client'; userId?: string; clientId?: string },
  actor: string,
) {
  if (/\.invalid$/i.test(to.to)) return { sent: false, error: 'No real email address on file.' };
  const result = await sendDocumentLinkEmail({ ...to, url: link.url, expiresAt: link.link.expiresAt });
  if (result.success) {
    await prisma.documentLink.update({ where: { id: link.link.id }, data: { emailedAt: new Date() } });
    await writeAudit(actor, {
      action: 'DOCUMENT_LINK_EMAILED', entityType: to.kind === 'worker' ? 'Worker' : 'Client',
      entityId: (to.userId ?? to.clientId)!, newValue: { linkId: link.link.id },
    });
  }
  return { sent: result.success, error: result.success ? null : result.error ?? 'Email not sent' };
}

/** Issue whatever of the current KID and agreement the worker lacks, KID first, and make a link. */
r.post('/workers/:id/documents/pack', handle(async (req, res) => {
  const { email } = linkBody.parse(req.body ?? {});
  const actor = actorOf(req);
  const worker = await loadWorker(req.params.id);
  if (!worker) fail(404, 'Worker not found');
  const result = await issueWorkerPack(worker.id, actor);
  const link = await workerLink(worker.id, actor, email ?? false);
  res.status(201).json({ ok: true, data: { ...result, link } });
}));

r.post('/workers/:id/document-link', handle(async (req, res) => {
  const { email } = linkBody.parse(req.body ?? {});
  res.status(201).json({ ok: true, data: await workerLink(req.params.id, actorOf(req), email ?? false) });
}));

r.post('/workers/:id/document-links/revoke', handle(async (req, res) => {
  const worker = await loadWorker(req.params.id);
  if (!worker) fail(404, 'Worker not found');
  res.json({ ok: true, data: { revoked: await revokeLinks({ userId: worker.id }, actorOf(req)) } });
}));

const acceptBody = z.object({
  acceptedName: z.string().trim().min(2).max(200),
  acceptedAt: z.string().datetime().optional(),
  method: z.string().trim().min(3).max(200),
});

/**
 * An agreement given outside the worker's link (e.g. a typed name in reply to
 * an emailed copy). The admin records how and when; it is never automatic.
 */
r.post('/documents/:id/accept', handle(async (req, res) => {
  const body = acceptBody.parse(req.body);
  const actor = actorOf(req);
  const doc = await prisma.workerDocument.findUnique({ where: { id: req.params.id } });
  if (!doc) fail(404, 'Document not found');
  if (!ACCEPTABLE_TYPES.has(doc.type as OpsDocType)) fail(400, `A ${DOC_TYPE_LABELS[doc.type as OpsDocType]} is issued, not accepted.`);
  const acceptedAt = body.acceptedAt ? new Date(body.acceptedAt) : null;
  if (doc.type === 'ZERO_HOURS_AGREEMENT') {
    const updated = await acceptAgreement(doc.userId, doc.id, body.acceptedName, {
      channel: 'admin', method: `Recorded by admin: ${body.method}`, recordedBy: actor, acceptedAt,
    }, actor);
    return res.json({ ok: true, data: updated });
  }
  // Assignment confirmations.
  if (doc.status !== 'ISSUED') fail(409, `This document is ${doc.status.toLowerCase()}; only an issued, current document can be accepted.`);
  const at = acceptedAt ?? new Date();
  if (at < doc.issuedAt || at > new Date()) fail(400, 'Acceptance time must be after issue and not in the future.');
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.workerDocument.update({
      where: { id: doc.id },
      data: { status: 'ACCEPTED', acceptedAt: at, acceptedName: body.acceptedName, acceptanceMethod: body.method, acceptanceRecordedBy: actor },
    });
    await writeAudit(actor, {
      action: 'DOCUMENT_ACCEPTED', entityType: 'Worker', entityId: doc.userId,
      newValue: { documentId: doc.id, type: doc.type, version: doc.version, method: body.method },
    }, tx);
    return u;
  });
  res.json({ ok: true, data: updated });
}));

r.post('/documents/:id/withdraw', handle(async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(5).max(500) }).parse(req.body);
  const actor = actorOf(req);
  const doc = await prisma.workerDocument.findUnique({ where: { id: req.params.id } });
  if (!doc) fail(404, 'Document not found');
  if (doc.status === 'WITHDRAWN' || doc.status === 'SUPERSEDED') fail(409, `Already ${doc.status.toLowerCase()}.`);
  await prisma.$transaction(async (tx) => {
    await tx.workerDocument.update({ where: { id: doc.id }, data: { status: 'WITHDRAWN', supersededAt: new Date() } });
    await writeAudit(actor, {
      action: 'DOCUMENT_WITHDRAWN', entityType: 'Worker', entityId: doc.userId,
      oldValue: { status: doc.status }, newValue: { documentId: doc.id, type: doc.type, version: doc.version, status: 'WITHDRAWN' }, reason,
    }, tx);
  });
  res.json({ ok: true });
}));

// ── Client Terms of Business ──────────────────────────────────────────────

const clientDocSelect = {
  id: true, version: true, status: true, issuedAt: true, issuedBy: true, acceptedAt: true, legalBusinessName: true,
  acceptedByName: true, acceptedByJobTitle: true, typedName: true, acceptanceMethod: true, acceptanceRecordedBy: true,
  supersededAt: true,
} satisfies Prisma.ClientDocumentSelect;

r.get('/clients/:id/terms', handle(async (req, res) => {
  const client = await prisma.client.findUnique({ where: { id: req.params.id }, select: { id: true, clientType: true } });
  if (!client) fail(404, 'Client not found');
  const [position, documents, links, versions] = await Promise.all([
    clientTermsPositionOf(client.id),
    prisma.clientDocument.findMany({ where: { clientId: client.id }, orderBy: { issuedAt: 'desc' }, select: clientDocSelect }),
    prisma.documentLink.findMany({ where: { clientId: client.id }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, createdAt: true, createdBy: true, expiresAt: true, revokedAt: true, lastOpenedAt: true, emailedAt: true } }),
    versionInfo(),
  ]);
  res.json({
    ok: true,
    data: { position, gate: clientTermsGate(position), documents, links, currentVersion: versions.CLIENT_TERMS_OF_BUSINESS?.current ?? null },
  });
}));

async function clientLink(clientId: string, actor: string, email: boolean) {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, clientType: true, contactName: true, email: true } });
  if (!client) fail(404, 'Client not found');
  if (client.clientType === 'PRIVATE_CONSUMER') fail(400, 'Private consumers do not receive the business Terms of Business.');
  const link = await createLink({ kind: 'CLIENT_TERMS', clientId: client.id }, actor);
  const delivery = email ? await emailLink(link, { to: client.email, name: client.contactName, kind: 'client', clientId: client.id }, actor) : null;
  return { path: link.path, url: link.url, expiresAt: link.link.expiresAt, email: delivery };
}

r.post('/clients/:id/terms/issue', handle(async (req, res) => {
  const { email } = linkBody.parse(req.body ?? {});
  const actor = actorOf(req);
  const doc = await issueClientTerms(req.params.id, actor);
  const link = await clientLink(req.params.id, actor, email ?? false);
  res.status(201).json({ ok: true, data: { document: { id: doc.id, version: doc.version, issuedAt: doc.issuedAt }, link } });
}));

r.post('/clients/:id/terms-link', handle(async (req, res) => {
  const { email } = linkBody.parse(req.body ?? {});
  res.status(201).json({ ok: true, data: await clientLink(req.params.id, actorOf(req), email ?? false) });
}));

r.post('/clients/:id/terms-links/revoke', handle(async (req, res) => {
  const client = await prisma.client.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!client) fail(404, 'Client not found');
  res.json({ ok: true, data: { revoked: await revokeLinks({ clientId: client.id }, actorOf(req)) } });
}));

const clientAcceptBody = z.object({
  legalBusinessName: z.string().trim().min(2).max(200),
  acceptedByName: z.string().trim().min(2).max(200),
  jobTitle: optionalText(120),
  typedName: z.string().trim().min(2).max(200),
  acceptedAt: z.string().datetime().optional(),
  method: z.string().trim().min(3).max(200),
  /** The admin confirms the client gave the authority statement. */
  authorityConfirmed: z.literal(true, { errorMap: () => ({ message: 'Confirm the client confirmed they are authorised to accept.' }) }),
});

/** Acceptance the client gave outside the link (e.g. signed and emailed back). */
r.post('/client-terms/:id/accept', handle(async (req, res) => {
  const body = clientAcceptBody.parse(req.body);
  const actor = actorOf(req);
  const doc = await prisma.clientDocument.findUnique({ where: { id: req.params.id }, select: { id: true, clientId: true } });
  if (!doc) fail(404, 'Document not found');
  const updated = await acceptClientTerms(doc.clientId, doc.id, body, {
    channel: 'admin', method: `Recorded by admin: ${body.method}`, recordedBy: actor,
    acceptedAt: body.acceptedAt ? new Date(body.acceptedAt) : null,
  }, actor);
  res.json({ ok: true, data: updated });
}));

r.post('/client-terms/:id/withdraw', handle(async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(5).max(500) }).parse(req.body);
  const actor = actorOf(req);
  const doc = await prisma.clientDocument.findUnique({ where: { id: req.params.id } });
  if (!doc) fail(404, 'Document not found');
  if (doc.status === 'WITHDRAWN' || doc.status === 'SUPERSEDED') fail(409, `Already ${doc.status.toLowerCase()}.`);
  await prisma.$transaction(async (tx) => {
    await tx.clientDocument.update({ where: { id: doc.id }, data: { status: 'WITHDRAWN', supersededAt: new Date() } });
    if (doc.status === 'ACCEPTED') await tx.client.update({ where: { id: doc.clientId }, data: { termsAcceptedAt: null, termsAcceptedBy: null } });
    await writeAudit(actor, {
      action: 'CLIENT_TERMS_WITHDRAWN', entityType: 'Client', entityId: doc.clientId,
      oldValue: { status: doc.status }, newValue: { documentId: doc.id, version: doc.version, status: 'WITHDRAWN' }, reason,
    }, tx);
  });
  res.json({ ok: true });
}));

// ── Commercial terms owner review ─────────────────────────────────────────

r.get('/commercial-terms', handle(async (_req, res) => {
  const settings = await loadOpsSettings();
  const review = await loadCommercialReview(settings.clientCommercialTerms);
  res.json({ ok: true, data: { terms: settings.clientCommercialTerms, ...review } });
}));

/** The owner confirms the current commercial values. Changing any value later needs a fresh review. */
r.post('/commercial-terms/review', handle(async (req, res) => {
  z.object({ confirm: z.literal(true) }).parse(req.body);
  const actor = actorOf(req);
  const settings = await loadOpsSettings();
  const value = { valuesHash: commercialTermsHash(settings.clientCommercialTerms), reviewedAt: new Date().toISOString(), reviewedBy: actor };
  await prisma.opsSetting.upsert({ where: { key: COMMERCIAL_REVIEW_KEY }, create: { key: COMMERCIAL_REVIEW_KEY, value, updatedBy: actor }, update: { value, updatedBy: actor } });
  await writeAudit(actor, {
    action: 'COMMERCIAL_TERMS_REVIEWED', entityType: 'OpsSetting', entityId: COMMERCIAL_REVIEW_KEY,
    newValue: { terms: settings.clientCommercialTerms },
  });
  res.json({ ok: true, data: await loadCommercialReview(settings.clientCommercialTerms) });
}));

// ── Overview: Documents & Terms ───────────────────────────────────────────

r.get('/documents-terms', handle(async (_req, res) => {
  await ensureDefaultTemplates();
  const [workersAll, clients, versions, templates, pendingWorkerDocs, pendingClientDocs, settings] = await Promise.all([
    loadWorkers(),
    prisma.client.findMany({
      where: { OR: [{ status: 'APPROVED' }, { opsBookings: { some: {} } }, { clientDocuments: { some: {} } }] },
      select: { id: true, companyName: true, tradingName: true, clientType: true, contactName: true, email: true },
      orderBy: { companyName: 'asc' },
    }),
    versionInfo(),
    prisma.documentTemplate.findMany({
      where: { type: { in: LEGAL_DOC_TYPES } }, orderBy: [{ type: 'asc' }, { version: 'desc' }],
      select: { id: true, type: true, version: true, title: true, effectiveDate: true, createdAt: true, createdBy: true, retiredAt: true, requiresReacceptance: true },
    }),
    prisma.workerDocument.findMany({
      where: { type: { in: ['ZERO_HOURS_AGREEMENT', 'KEY_INFORMATION_DOCUMENT'] }, status: 'ISSUED' },
      select: { id: true, userId: true, type: true, version: true, issuedAt: true, acknowledgedAt: true, user: { select: { firstName: true, lastName: true } } },
      orderBy: { issuedAt: 'asc' },
    }),
    prisma.clientDocument.findMany({
      where: { status: 'ISSUED' },
      select: { id: true, clientId: true, version: true, issuedAt: true, client: { select: { companyName: true } } },
      orderBy: { issuedAt: 'asc' },
    }),
    loadOpsSettings(),
  ]);
  const positions = await clientTermsPositions(clients.map((c) => c.id));
  const workers = workersAll.filter((w) => w.activeStatus !== 'LEFT');
  const active = workers.filter((w) => w.activeStatus === 'ACTIVE');
  const business = clients.filter((c) => c.clientType !== 'PRIVATE_CONSUMER');
  const pos = (id: string) => positions.get(id)!;

  const workerRows = workers.map((w) => ({
    id: w.id, name: w.name, email: w.email, activeStatus: w.activeStatus, documentPack: w.documentPack,
    kid: w.kid, contract: w.contract, ready: w.readiness.ready,
  }));
  const clientRows = clients.map((c) => ({ ...c, terms: pos(c.id), gate: clientTermsGate(pos(c.id)) }));

  // Who holds which agreement version, for the Versions view.
  const holders = (type: 'KEY_INFORMATION_DOCUMENT' | 'ZERO_HOURS_AGREEMENT' | 'CLIENT_TERMS_OF_BUSINESS') => {
    const current = versions[type]?.current ?? null;
    if (type === 'CLIENT_TERMS_OF_BUSINESS') {
      return {
        current: business.filter((c) => pos(c.id).acceptedVersion != null && pos(c.id).acceptedVersion === current).map((c) => ({ id: c.id, name: c.companyName })),
        older: business.filter((c) => pos(c.id).acceptedVersion != null && pos(c.id).acceptedVersion !== current).map((c) => ({ id: c.id, name: c.companyName, version: pos(c.id).acceptedVersion })),
        never: business.filter((c) => pos(c.id).acceptedVersion == null).map((c) => ({ id: c.id, name: c.companyName })),
      };
    }
    const position = (w: typeof active[number]) => (type === 'KEY_INFORMATION_DOCUMENT' ? w.kid : w.contract);
    const counts = (w: typeof active[number]) => (type === 'KEY_INFORMATION_DOCUMENT' ? w.kid.status === 'issued' : w.contract.status === 'accepted');
    return {
      current: active.filter((w) => counts(w) && position(w).version === current).map((w) => ({ id: w.id, name: w.name })),
      older: active.filter((w) => counts(w) && position(w).version !== current).map((w) => ({ id: w.id, name: w.name, version: position(w).version })),
      never: active.filter((w) => !counts(w)).map((w) => ({ id: w.id, name: w.name })),
    };
  };

  const commercial = await loadCommercialReview(settings.clientCommercialTerms);

  res.json({
    ok: true,
    data: {
      counts: {
        workersMissingKid: active.filter((w) => !kidCounts(w.kid)).length,
        workersMissingAgreement: active.filter((w) => !contractCounts(w.contract)).length,
        workersOnSupersededContract: active.filter((w) => w.contract.status === 'superseded' || (w.contract.status === 'accepted' && (w.contract.newerVersionAvailable || w.contract.reacceptanceRequired))).length,
        clientsWithoutCurrentTerms: business.filter((c) => !(pos(c.id).status === 'accepted' && !pos(c.id).newerVersionAvailable)).length,
        clientsOnSupersededTerms: business.filter((c) => pos(c.id).acceptedVersion != null && (pos(c.id).newerVersionAvailable || pos(c.id).status === 'reacceptance_required')).length,
        outstandingAcceptances: pendingWorkerDocs.filter((d) => d.type === 'ZERO_HOURS_AGREEMENT').length + pendingClientDocs.length,
      },
      workers: workerRows,
      clients: clientRows,
      outstanding: {
        agreements: pendingWorkerDocs.filter((d) => d.type === 'ZERO_HOURS_AGREEMENT').map((d) => ({ id: d.id, workerId: d.userId, name: `${d.user.firstName} ${d.user.lastName}`.trim(), version: d.version, issuedAt: d.issuedAt })),
        kidsNotAcknowledged: pendingWorkerDocs.filter((d) => d.type === 'KEY_INFORMATION_DOCUMENT' && !d.acknowledgedAt).map((d) => ({ id: d.id, workerId: d.userId, name: `${d.user.firstName} ${d.user.lastName}`.trim(), version: d.version, issuedAt: d.issuedAt })),
        clientTerms: pendingClientDocs.map((d) => ({ id: d.id, clientId: d.clientId, name: d.client.companyName, version: d.version, issuedAt: d.issuedAt })),
      },
      versions: {
        templates: templates.map((t) => ({ ...t, label: DOC_TYPE_LABELS[t.type as OpsDocType], status: t.retiredAt ? 'SUPERSEDED' : 'CURRENT', supersededAt: t.retiredAt })),
        current: Object.fromEntries(LEGAL_DOC_TYPES.map((t) => [t, versions[t] ?? { current: null, minAcceptable: null }])),
        holders: {
          KEY_INFORMATION_DOCUMENT: holders('KEY_INFORMATION_DOCUMENT'),
          ZERO_HOURS_AGREEMENT: holders('ZERO_HOURS_AGREEMENT'),
          CLIENT_TERMS_OF_BUSINESS: holders('CLIENT_TERMS_OF_BUSINESS'),
        },
      },
      commercialReview: { ...commercial, label: commercial.reviewed ? null : OWNER_REVIEW_LABEL },
    },
  });
}));

export default r;
