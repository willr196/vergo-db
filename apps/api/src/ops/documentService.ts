/**
 * Issuing, acknowledging and accepting VERGO's legal documents, and the
 * secure links workers and clients use to read and agree them.
 *
 * Rules that hold everywhere:
 * - A template change is always a new version. Issued documents keep the
 *   exact text they were given (renderedBody, with its SHA-256), and an
 *   acceptance stays attached to the version actually accepted.
 * - The KID is issued before the employment agreement, and the agreement can
 *   only be agreed while a KID is live.
 * - Issuing a newer version never cancels an agreement already made; the new
 *   version only replaces it once it is itself agreed.
 * - Private consumers never receive the business Terms of Business.
 * - Nothing is backdated: issue and acceptance times are when they happen
 *   (an admin recording an acceptance received in writing may give its time,
 *   never before issue and never in the future).
 */

import { randomBytes, createHash } from 'crypto';
import type { Prisma, PrismaClient, DocumentTemplate } from '@prisma/client';
import { prisma } from '../prisma';
import { env } from '../env';
import { writeAudit } from './audit';
import {
  DEFAULT_TEMPLATES, DOC_TYPE_LABELS, VERSION_SUPERSEDED_ACTION, companyValues, frozenValues, longDate,
  needsWording, renderTemplate, sha256, variablesFor, type OpsDocType, AGREEMENT_STATEMENT, CLIENT_TERMS_STATEMENT,
} from './documents';
import { clientTermsPosition, type ClientTermsPosition, type IssuedDoc, type VersionInfo } from './compliance';
import { commercialTermsHash, loadCommercialReview, loadOpsSettings, OWNER_REVIEW_LABEL, type CommercialTerms } from './settings';
import { londonDateKey, dateKey } from './time';

type Db = PrismaClient | Prisma.TransactionClient;

export function fail(statusCode: number, message: string, extra?: Record<string, unknown>): never {
  throw Object.assign(new Error(message), { statusCode, extra });
}

// ── Templates and versions ────────────────────────────────────────────────

export async function currentTemplate(type: OpsDocType, db: Db = prisma) {
  return db.documentTemplate.findFirst({ where: { type, retiredAt: null }, orderBy: { version: 'desc' } });
}

/** Current version and lowest acceptable version (after a material change), by type. */
export async function versionInfo(db: Db = prisma): Promise<Record<string, VersionInfo>> {
  const [current, material] = await Promise.all([
    db.documentTemplate.groupBy({ by: ['type'], _max: { version: true }, where: { retiredAt: null } }),
    db.documentTemplate.groupBy({ by: ['type'], _max: { version: true }, where: { requiresReacceptance: true } }),
  ]);
  const out: Record<string, VersionInfo> = {};
  for (const row of current) out[row.type] = { current: row._max.version ?? null, minAcceptable: null };
  for (const row of material) out[row.type] = { ...(out[row.type] ?? { current: null }), minAcceptable: row._max.version ?? null };
  return out;
}

export interface NewVersion {
  type: OpsDocType;
  title: string;
  body: string;
  changeNote: string;
  /** YYYY-MM-DD; defaults to today (London). */
  effectiveDate?: string | null;
  requiresReacceptance?: boolean;
  /** Frozen values; defaults to a snapshot of the current settings for the type. */
  variables?: Prisma.InputJsonValue | null;
}

/**
 * Save a new version. The previous one is retired (its superseded date),
 * never edited, so everything issued keeps pointing at the wording it had.
 */
export async function createTemplateVersion(input: NewVersion, actor: string) {
  const settings = await loadOpsSettings();
  const variables = input.variables !== undefined ? input.variables : (variablesFor(input.type, settings) as Prisma.InputJsonValue | null);
  const effective = input.effectiveDate ?? londonDateKey(new Date());
  return prisma.$transaction(async (tx) => {
    const previous = await tx.documentTemplate.findFirst({ where: { type: input.type }, orderBy: { version: 'desc' } });
    const version = (previous?.version ?? 0) + 1;
    await tx.documentTemplate.updateMany({ where: { type: input.type, retiredAt: null }, data: { retiredAt: new Date() } });
    const created = await tx.documentTemplate.create({
      data: {
        type: input.type, version, title: input.title, body: input.body, changeNote: input.changeNote, createdBy: actor,
        effectiveDate: new Date(`${effective}T00:00:00.000Z`), requiresReacceptance: input.requiresReacceptance ?? false,
        ...(variables != null ? { variables } : {}),
      },
    });
    await writeAudit(actor, {
      action: (previous && VERSION_SUPERSEDED_ACTION[input.type]) || 'DOCUMENT_TEMPLATE_REPLACED',
      entityType: 'DocumentTemplate', entityId: created.id,
      oldValue: previous ? { type: input.type, id: previous.id, version: previous.version } : null,
      newValue: { type: input.type, version, effectiveDate: effective, requiresReacceptance: created.requiresReacceptance },
      reason: input.changeNote,
    }, tx);
    return created;
  });
}

/**
 * Version 1 of each type, and the system wording on top of any earlier
 * system-written version whose text differs (the old placeholder layouts).
 * A version an admin wrote is never replaced here.
 */
export async function ensureDefaultTemplates() {
  for (const [type, tpl] of Object.entries(DEFAULT_TEMPLATES) as [OpsDocType, { title: string; body: string }][]) {
    const current = await prisma.documentTemplate.findFirst({ where: { type }, orderBy: { version: 'desc' } });
    if (current && (current.createdBy !== 'system' || current.body === tpl.body)) continue;
    try {
      await createTemplateVersion({
        type, title: tpl.title, body: tpl.body,
        changeNote: current ? 'VERGO system wording (draft for legal review)' : 'Default layout',
      }, 'system');
    } catch (error: any) {
      // Another request made the same version at the same moment.
      if (error?.code !== 'P2002') throw error;
    }
  }
}

/**
 * After the KID pay example or the commercial terms change: a new version of
 * the template with the same wording and the new values. New commercial terms
 * are a material change, so hirers must accept the new version; a new KID
 * example is not (the KID is reissued, nobody has to agree it).
 */
export async function cutVersionForSettings(type: 'KEY_INFORMATION_DOCUMENT' | 'CLIENT_TERMS_OF_BUSINESS', actor: string) {
  await ensureDefaultTemplates();
  const current = await currentTemplate(type);
  if (!current) return null;
  return createTemplateVersion({
    type, title: current.title, body: current.body,
    changeNote: type === 'CLIENT_TERMS_OF_BUSINESS' ? 'Commercial terms changed in Ops settings' : 'KID pay example changed in Ops settings',
    requiresReacceptance: type === 'CLIENT_TERMS_OF_BUSINESS',
  }, actor);
}

/** Fill a template: company, frozen values, the record, today and the version. */
export function renderFrom(template: Pick<DocumentTemplate, 'body' | 'version' | 'effectiveDate' | 'variables' | 'createdAt'>, values: Record<string, string | number | null | undefined>) {
  return renderTemplate(template.body, {
    ...companyValues(),
    ...frozenValues(template.variables),
    ...values,
    today: longDate(londonDateKey(new Date())),
    'doc.version': template.version,
    'doc.effectiveDate': longDate(template.effectiveDate ? dateKey(template.effectiveDate) : londonDateKey(template.createdAt)),
  });
}

// ── Worker documents ──────────────────────────────────────────────────────

const workerSelect = { id: true, firstName: true, lastName: true, email: true, phone: true, userType: true } as const;

async function getWorker(userId: string, db: Db = prisma) {
  const user = await db.user.findUnique({ where: { id: userId }, select: workerSelect });
  if (!user || user.userType !== 'JOB_SEEKER') fail(404, 'Worker not found');
  return user;
}

/**
 * Issue the current version of a worker document. The agreement needs a live
 * KID first. Re-issuing the KID or a checklist supersedes the earlier copy;
 * re-issuing the agreement supersedes only an unagreed copy, never an agreed one.
 */
export async function issueWorkerDocument(userId: string, type: OpsDocType, actor: string) {
  if (type === 'ASSIGNMENT_CONFIRMATION') fail(400, 'Assignment confirmations are issued from the assignment.');
  if (type === 'CLIENT_TERMS_OF_BUSINESS') fail(400, 'Terms of Business are issued to clients, not workers.');
  await ensureDefaultTemplates();
  const worker = await getWorker(userId);
  const template = await currentTemplate(type);
  if (!template) fail(400, 'No current template for this document.');
  if (needsWording(template.body)) {
    fail(400, `The current ${DOC_TYPE_LABELS[type]} template still has gaps marked "VERGO WORDING NEEDED". Add the approved wording as a new version first.`);
  }

  return prisma.$transaction(async (tx) => {
    if (type === 'ZERO_HOURS_AGREEMENT') {
      const kid = await tx.workerDocument.findFirst({ where: { userId, type: 'KEY_INFORMATION_DOCUMENT', status: 'ISSUED' } });
      if (!kid) fail(400, 'Issue the Key Information Document first. The KID must be given to the worker before the employment agreement.');
      const agreed = await tx.workerDocument.findFirst({ where: { userId, type, status: 'ACCEPTED', version: { gte: template.version } } });
      if (agreed) fail(409, `${worker.firstName} has already agreed version ${agreed.version}, the current version.`);
    }
    const supersedeWhere: Prisma.WorkerDocumentWhereInput = type === 'ZERO_HOURS_AGREEMENT'
      ? { userId, type, status: 'ISSUED' }
      : { userId, type, status: { in: ['ISSUED', 'ACCEPTED'] } };
    const superseded = await tx.workerDocument.updateMany({ where: supersedeWhere, data: { status: 'SUPERSEDED', supersededAt: new Date() } });
    const rendered = renderFrom(template, {
      'worker.name': `${worker.firstName} ${worker.lastName}`.trim(), 'worker.firstName': worker.firstName,
      'worker.email': worker.email, 'worker.phone': worker.phone,
    });
    const doc = await tx.workerDocument.create({
      data: { userId, templateId: template.id, type, version: template.version, issuedBy: actor, renderedBody: rendered, bodySha256: sha256(rendered) },
    });
    await writeAudit(actor, {
      action: type === 'KEY_INFORMATION_DOCUMENT' ? 'KID_ISSUED' : type === 'ZERO_HOURS_AGREEMENT' ? 'CONTRACT_ISSUED' : 'DOCUMENT_ISSUED',
      entityType: 'Worker', entityId: userId,
      oldValue: superseded.count ? { superseded: superseded.count } : null,
      newValue: { documentId: doc.id, type, version: template.version },
    }, tx);
    return doc;
  });
}

/**
 * The current worker pack: the KID, then the agreement, each only where the
 * worker does not already have the current version. Returns what was issued.
 */
export async function issueWorkerPack(userId: string, actor: string) {
  await ensureDefaultTemplates();
  await getWorker(userId);
  const [kidTpl, zhaTpl] = await Promise.all([currentTemplate('KEY_INFORMATION_DOCUMENT'), currentTemplate('ZERO_HOURS_AGREEMENT')]);
  const live = await prisma.workerDocument.findMany({
    where: { userId, type: { in: ['KEY_INFORMATION_DOCUMENT', 'ZERO_HOURS_AGREEMENT'] }, status: { in: ['ISSUED', 'ACCEPTED'] } },
    select: { type: true, version: true, status: true },
  });
  const issued: Array<{ id: string; type: string; version: number }> = [];
  const skipped: string[] = [];
  const hasKid = live.some((d) => d.type === 'KEY_INFORMATION_DOCUMENT' && kidTpl && d.version >= kidTpl.version);
  if (hasKid) skipped.push('Key Information Document: current version already issued');
  else {
    const doc = await issueWorkerDocument(userId, 'KEY_INFORMATION_DOCUMENT', actor);
    issued.push({ id: doc.id, type: doc.type, version: doc.version });
  }
  const hasZha = live.some((d) => d.type === 'ZERO_HOURS_AGREEMENT' && zhaTpl && d.version >= zhaTpl.version);
  if (hasZha) skipped.push('Employment agreement: current version already issued');
  else {
    const doc = await issueWorkerDocument(userId, 'ZERO_HOURS_AGREEMENT', actor);
    issued.push({ id: doc.id, type: doc.type, version: doc.version });
  }
  return { issued, skipped };
}

export interface AcceptanceEvidence {
  /** 'link' for the worker's or client's own secure link, 'admin' when recorded by an admin. */
  channel: 'link' | 'admin';
  method: string;
  recordedBy?: string | null;
  linkId?: string | null;
  authUserId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  /** Admin only: when an acceptance received in writing was actually given. */
  acceptedAt?: Date | null;
}

function acceptanceTime(issuedAt: Date, evidence: AcceptanceEvidence) {
  const now = new Date();
  const at = evidence.channel === 'admin' && evidence.acceptedAt ? evidence.acceptedAt : now;
  if (at < issuedAt || at > now) fail(400, 'The acceptance time must be after the document was issued and not in the future.');
  return at;
}

/** The worker confirms the KID was provided. Repeating it changes nothing. */
export async function acknowledgeKid(userId: string, docId: string, evidence: AcceptanceEvidence, actor: string) {
  const doc = await prisma.workerDocument.findFirst({ where: { id: docId, userId, type: 'KEY_INFORMATION_DOCUMENT' } });
  if (!doc) fail(404, 'Document not found');
  if (doc.status !== 'ISSUED') fail(409, 'This Key Information Document is no longer current.');
  if (doc.acknowledgedAt) return doc;
  return prisma.$transaction(async (tx) => {
    const updated = await tx.workerDocument.update({ where: { id: doc.id }, data: { acknowledgedAt: new Date(), acknowledgedVia: evidence.method.slice(0, 60) } });
    await writeAudit(actor, {
      action: 'KID_ACKNOWLEDGED', entityType: 'Worker', entityId: userId,
      newValue: { documentId: doc.id, version: doc.version, via: evidence.channel },
    }, tx);
    return updated;
  });
}

/**
 * Agree the employment agreement. Needs a live KID issued before the
 * agreement is agreed; through the worker's own link the KID must also have
 * been acknowledged. Older agreement copies are superseded only now, when
 * this one is agreed, and stay linked to what they were.
 */
export async function acceptAgreement(userId: string, docId: string, typedName: string, evidence: AcceptanceEvidence, actor: string) {
  const doc = await prisma.workerDocument.findFirst({ where: { id: docId, userId, type: 'ZERO_HOURS_AGREEMENT' } });
  if (!doc) fail(404, 'Document not found');
  if (doc.status !== 'ISSUED') fail(409, `This agreement is ${doc.status.toLowerCase()}; only the issued, current agreement can be agreed.`);
  if (doc.bodySha256 && doc.bodySha256 !== sha256(doc.renderedBody)) fail(500, 'This document failed its integrity check. Contact VERGO.');
  const name = typedName.trim().replace(/\s+/g, ' ');
  if (name.length < 2) fail(400, 'Type your full name.');
  const at = acceptanceTime(doc.issuedAt, evidence);

  const kid = await prisma.workerDocument.findFirst({
    where: { userId, type: 'KEY_INFORMATION_DOCUMENT', status: 'ISSUED' }, orderBy: { issuedAt: 'desc' },
  });
  if (!kid || kid.issuedAt > at) fail(409, 'The Key Information Document must be issued before the agreement can be agreed.');
  if (evidence.channel === 'link' && !kid.acknowledgedAt) fail(409, 'Please confirm you have received the Key Information Document first.');

  return prisma.$transaction(async (tx) => {
    const updated = await tx.workerDocument.update({
      where: { id: doc.id },
      data: {
        status: 'ACCEPTED', acceptedAt: at, acceptedName: name, acceptanceMethod: evidence.method.slice(0, 200),
        acceptanceRecordedBy: evidence.recordedBy ?? null, acceptanceStatement: AGREEMENT_STATEMENT,
        acceptedViaLinkId: evidence.linkId ?? null, acceptedAuthUserId: evidence.authUserId ?? null,
        acceptanceIp: evidence.ip?.slice(0, 64) ?? null, acceptanceUserAgent: evidence.userAgent?.slice(0, 300) ?? null,
      },
    });
    const superseded = await tx.workerDocument.updateMany({
      where: { userId, type: 'ZERO_HOURS_AGREEMENT', id: { not: doc.id }, status: { in: ['ISSUED', 'ACCEPTED'] } },
      data: { status: 'SUPERSEDED', supersededAt: at },
    });
    await writeAudit(actor, {
      action: 'CONTRACT_AGREED', entityType: 'Worker', entityId: userId,
      oldValue: superseded.count ? { superseded: superseded.count } : null,
      newValue: { documentId: doc.id, version: doc.version, via: evidence.channel, method: evidence.method },
    }, tx);
    return updated;
  });
}

// ── Client Terms of Business ──────────────────────────────────────────────

/** Whether the commercial values frozen into a Terms version have the owner's review. */
export async function termsReviewFor(template: Pick<DocumentTemplate, 'variables'>) {
  const source = (template.variables as { source?: CommercialTerms } | null)?.source;
  if (!source) return { reviewed: false, label: OWNER_REVIEW_LABEL };
  const { review } = await loadCommercialReview(source);
  return review?.valuesHash === commercialTermsHash(source)
    ? { reviewed: true, label: null }
    : { reviewed: false, label: OWNER_REVIEW_LABEL };
}

export async function issueClientTerms(clientId: string, actor: string) {
  await ensureDefaultTemplates();
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, companyName: true, tradingName: true, clientType: true, billingAddress: true, address: true } });
  if (!client) fail(404, 'Client not found');
  if (client.clientType === 'PRIVATE_CONSUMER') {
    fail(400, 'This client is a private consumer. The business Terms of Business must not be sent to them; consumer booking terms are required instead.');
  }
  const template = await currentTemplate('CLIENT_TERMS_OF_BUSINESS');
  if (!template) fail(400, 'No current Terms of Business template.');
  if (needsWording(template.body)) fail(400, 'The current Terms of Business still have gaps marked "VERGO WORDING NEEDED".');
  const review = await termsReviewFor(template);
  if (!review.reviewed) {
    fail(409, `${OWNER_REVIEW_LABEL}. The transfer fee, extended hire, payment and cancellation terms in this version have not been confirmed by the owner (Ops > Settings > Commercial terms).`);
  }
  return prisma.$transaction(async (tx) => {
    const agreed = await tx.clientDocument.findFirst({ where: { clientId, status: 'ACCEPTED', version: { gte: template.version } } });
    if (agreed) fail(409, `${client.companyName} has already accepted version ${agreed.version}, the current version.`);
    const superseded = await tx.clientDocument.updateMany({ where: { clientId, status: 'ISSUED' }, data: { status: 'SUPERSEDED', supersededAt: new Date() } });
    const rendered = renderFrom(template, {
      'client.legalName': client.companyName, 'client.tradingName': client.tradingName,
      'client.address': client.billingAddress ?? client.address,
    });
    const doc = await tx.clientDocument.create({
      data: { clientId, templateId: template.id, version: template.version, issuedBy: actor, renderedBody: rendered, bodySha256: sha256(rendered) },
    });
    await tx.client.update({ where: { id: clientId }, data: { termsSentAt: doc.issuedAt } });
    await writeAudit(actor, {
      action: 'CLIENT_TERMS_ISSUED', entityType: 'Client', entityId: clientId,
      oldValue: superseded.count ? { superseded: superseded.count } : null,
      newValue: { documentId: doc.id, version: template.version },
    }, tx);
    return doc;
  });
}

export interface ClientAcceptance {
  legalBusinessName: string;
  acceptedByName: string;
  jobTitle?: string | null;
  typedName: string;
}

export async function acceptClientTerms(clientId: string, docId: string, input: ClientAcceptance, evidence: AcceptanceEvidence, actor: string) {
  const doc = await prisma.clientDocument.findFirst({ where: { id: docId, clientId }, include: { client: { select: { clientType: true } } } });
  if (!doc) fail(404, 'Document not found');
  if (doc.client.clientType === 'PRIVATE_CONSUMER') fail(400, 'A private consumer cannot accept the business Terms of Business.');
  if (doc.status !== 'ISSUED') fail(409, `These Terms are ${doc.status.toLowerCase()}; only the issued, current version can be accepted.`);
  if (doc.bodySha256 !== sha256(doc.renderedBody)) fail(500, 'This document failed its integrity check. Contact VERGO.');
  const at = acceptanceTime(doc.issuedAt, evidence);
  const clean = (v: string | null | undefined) => (v ?? '').trim().replace(/\s+/g, ' ');
  if (clean(input.typedName).length < 2 || clean(input.acceptedByName).length < 2 || clean(input.legalBusinessName).length < 2) {
    fail(400, 'Give the business name, the name of the person accepting, and type that name.');
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.clientDocument.update({
      where: { id: doc.id },
      data: {
        status: 'ACCEPTED', acceptedAt: at, legalBusinessName: clean(input.legalBusinessName).slice(0, 200),
        acceptedByName: clean(input.acceptedByName).slice(0, 200), acceptedByJobTitle: clean(input.jobTitle).slice(0, 120) || null,
        typedName: clean(input.typedName).slice(0, 200), acceptanceMethod: evidence.method.slice(0, 200),
        acceptanceStatement: CLIENT_TERMS_STATEMENT, acceptanceRecordedBy: evidence.recordedBy ?? null,
        acceptedViaLinkId: evidence.linkId ?? null, acceptanceIp: evidence.ip?.slice(0, 64) ?? null,
        acceptanceUserAgent: evidence.userAgent?.slice(0, 300) ?? null,
      },
    });
    const superseded = await tx.clientDocument.updateMany({
      where: { clientId, id: { not: doc.id }, status: { in: ['ISSUED', 'ACCEPTED'] } },
      data: { status: 'SUPERSEDED', supersededAt: at },
    });
    // The older summary fields, which other screens still read.
    await tx.client.update({ where: { id: clientId }, data: { termsVersion: `v${doc.version}`, termsAcceptedAt: at, termsAcceptedBy: clean(input.acceptedByName).slice(0, 200) } });
    await writeAudit(actor, {
      action: 'CLIENT_TERMS_ACCEPTED', entityType: 'Client', entityId: clientId,
      oldValue: superseded.count ? { superseded: superseded.count } : null,
      newValue: { documentId: doc.id, version: doc.version, via: evidence.channel, method: evidence.method },
    }, tx);
    return updated;
  });
}

const asIssued = (d: { status: string; version: number; issuedAt: Date; acceptedAt: Date | null }): IssuedDoc =>
  ({ status: d.status as IssuedDoc['status'], version: d.version, issuedAt: d.issuedAt, acceptedAt: d.acceptedAt });

/** Terms position for each client (all clients when no ids are given). */
export async function clientTermsPositions(clientIds?: string[]): Promise<Map<string, ClientTermsPosition>> {
  const [clients, docs, versions] = await Promise.all([
    prisma.client.findMany({ where: clientIds ? { id: { in: clientIds } } : {}, select: { id: true, clientType: true } }),
    prisma.clientDocument.findMany({
      where: clientIds ? { clientId: { in: clientIds } } : {},
      select: { clientId: true, status: true, version: true, issuedAt: true, acceptedAt: true },
    }),
    versionInfo(),
  ]);
  const info = versions.CLIENT_TERMS_OF_BUSINESS ?? { current: null };
  return new Map(clients.map((c) => [c.id, clientTermsPosition({
    clientType: c.clientType, docs: docs.filter((d) => d.clientId === c.id).map(asIssued), versions: info,
  })]));
}

export async function clientTermsPositionOf(clientId: string) {
  const map = await clientTermsPositions([clientId]);
  const position = map.get(clientId);
  if (!position) fail(404, 'Client not found');
  return position;
}

// ── Secure links ──────────────────────────────────────────────────────────

export const LINK_DAYS = 30;
const hashToken = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex');

/** The address a link opens, on the public site. */
export const linkPath = (token: string) => `/d/${token}`;
export const linkUrl = (token: string) => `${env.webOrigin.replace(/\/+$/, '')}${linkPath(token)}`;

/**
 * A new link for one worker's documents or one client's Terms. The token is
 * returned once and only its hash is stored. Earlier links stay valid until
 * they expire or are revoked; every link sees only its own subject.
 */
export async function createLink(input: { kind: 'WORKER_PACK' | 'CLIENT_TERMS'; userId?: string; clientId?: string }, actor: string) {
  const token = randomBytes(32).toString('base64url');
  const link = await prisma.documentLink.create({
    data: {
      kind: input.kind, tokenHash: hashToken(token), userId: input.userId ?? null, clientId: input.clientId ?? null,
      createdBy: actor, expiresAt: new Date(Date.now() + LINK_DAYS * 86_400_000),
    },
  });
  await writeAudit(actor, {
    action: 'DOCUMENT_LINK_CREATED', entityType: input.kind === 'WORKER_PACK' ? 'Worker' : 'Client',
    entityId: (input.userId ?? input.clientId)!, newValue: { linkId: link.id, expiresAt: link.expiresAt },
  });
  return { token, link, path: linkPath(token), url: linkUrl(token) };
}

/** The live link for a token, or null. Unknown, expired and revoked look the same from outside. */
export async function resolveLink(token: string) {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  const link = await prisma.documentLink.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!link || link.revokedAt || link.expiresAt < new Date()) return null;
  return link;
}

export async function revokeLinks(where: { userId?: string; clientId?: string }, actor: string) {
  const result = await prisma.documentLink.updateMany({ where: { ...where, revokedAt: null }, data: { revokedAt: new Date() } });
  await writeAudit(actor, {
    action: 'DOCUMENT_LINKS_REVOKED', entityType: where.userId ? 'Worker' : 'Client',
    entityId: (where.userId ?? where.clientId)!, newValue: { revoked: result.count },
  });
  return result.count;
}
