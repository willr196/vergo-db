/**
 * VERGO Ops: workers, right to work, and the documents issued to them.
 * Mounted under /api/v1/ops behind adminAuth (session + CSRF).
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../prisma';
import { writeAudit, actorOf, diff } from '../../ops/audit';
import {
  loadWorkers, loadWorker, ensureApplicant, unusablePasswordHash, ensureDefaultTemplates, WORKER_WHERE,
  type WorkerView,
} from '../../ops/service';
import { looksLikeShareCode } from '../../ops/compliance';
import {
  renderTemplate, needsWording, ACCEPTABLE_TYPES, DOC_TYPE_LABELS, templateKeys, type OpsDocType,
} from '../../ops/documents';
import { SITE } from '../../site/content';
import { dateKey, londonDateKey } from '../../ops/time';
import { handle, fail, ymd, optionalText, dateOnly } from './common';

const r = Router();

// ── List and search ───────────────────────────────────────────────────────

const listQuery = z.object({
  search: z.string().max(100).optional(),
  role: z.string().max(80).optional(),
  ready: z.enum(['ready', 'not_ready', 'overridden']).optional(),
  availability: z.enum(['AVAILABLE', 'LIMITED', 'UNAVAILABLE']).optional(),
  rtw: z.enum(['not_checked', 'valid', 'follow_up_required', 'expired', 'blocked']).optional(),
  rtwExpiry: z.enum(['expired', 'within_30', 'within_60', 'later', 'no_expiry', 'no_check']).optional(),
  contract: z.enum(['not_issued', 'issued', 'accepted', 'superseded']).optional(),
  kid: z.enum(['not_issued', 'issued', 'superseded']).optional(),
  pension: z.string().max(40).optional(),
  active: z.enum(['ACTIVE', 'INACTIVE', 'LEFT']).optional(),
  lastShiftBefore: ymd.optional(),
  lastShiftAfter: ymd.optional(),
  minRating: z.coerce.number().int().min(1).max(5).optional(),
});

export function filterWorkers(workers: WorkerView[], q: z.infer<typeof listQuery>) {
  const term = q.search?.trim().toLowerCase();
  return workers.filter((w) => {
    if (term && !`${w.name} ${w.email} ${w.phone ?? ''}`.toLowerCase().includes(term)) return false;
    if (q.role && !w.roles.some((role) => role.toLowerCase() === q.role!.toLowerCase())) return false;
    if (q.ready === 'ready' && !w.readiness.ready) return false;
    if (q.ready === 'not_ready' && w.readiness.ready) return false;
    if (q.ready === 'overridden' && !w.readiness.overridden) return false;
    if (q.availability && w.availabilityStatus !== q.availability) return false;
    if (q.rtw && w.rtw.status !== q.rtw) return false;
    if (q.rtwExpiry && w.rtw.expiryBucket !== q.rtwExpiry) return false;
    if (q.contract && w.contract.status !== q.contract) return false;
    if (q.kid && w.kid.status !== q.kid) return false;
    if (q.pension && w.pensionStatus !== q.pension) return false;
    if (q.active && w.activeStatus !== q.active) return false;
    if (q.lastShiftBefore && !(w.lastAssignmentDate && w.lastAssignmentDate < q.lastShiftBefore)) return false;
    if (q.lastShiftAfter && !(w.lastAssignmentDate && w.lastAssignmentDate >= q.lastShiftAfter)) return false;
    if (q.minRating && !(w.rating != null && w.rating >= q.minRating)) return false;
    return true;
  });
}

r.get('/workers', handle(async (req, res) => {
  const q = listQuery.parse(req.query);
  const workers = filterWorkers(await loadWorkers(), q);
  res.json({ ok: true, data: workers });
}));

// Job-seeker accounts not yet on the Ops roster, to add without making a duplicate.
r.get('/workers/candidates', handle(async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const users = await prisma.user.findMany({
    where: {
      userType: 'JOB_SEEKER',
      NOT: WORKER_WHERE,
      ...(search ? { OR: [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ] } : {}),
    },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
    take: 25,
    orderBy: { createdAt: 'desc' },
  });
  res.json({ ok: true, data: users });
}));

const createWorker = z.union([
  z.object({ userId: z.string().min(1) }),
  z.object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    email: z.string().trim().toLowerCase().email().max(200),
    phone: optionalText(40),
  }),
]);

r.post('/workers', handle(async (req, res) => {
  const body = createWorker.parse(req.body);
  const actor = actorOf(req);

  let userId: string;
  if ('userId' in body) {
    const user = await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true, userType: true } });
    if (!user || user.userType !== 'JOB_SEEKER') fail(404, 'No worker account with that id');
    userId = user.id;
  } else {
    const existing = await prisma.user.findUnique({ where: { email: body.email }, select: { id: true, userType: true } });
    if (existing) {
      fail(409, existing.userType === 'JOB_SEEKER'
        ? 'A worker account with this email already exists. Add that account instead.'
        : 'This email belongs to a client account.', { existingUserId: existing.id });
    }
    const user = await prisma.user.create({
      data: {
        email: body.email, firstName: body.firstName, lastName: body.lastName, phone: body.phone ?? null,
        passwordHash: await unusablePasswordHash(), userType: 'JOB_SEEKER',
      },
      select: { id: true },
    });
    userId = user.id;
  }

  const profile = await prisma.workerProfile.upsert({ where: { userId }, create: { userId }, update: {} });
  await writeAudit(actor, { action: 'WORKER_ADDED', entityType: 'Worker', entityId: userId, newValue: { profileId: profile.id } });
  res.status(201).json({ ok: true, data: await loadWorker(userId) });
}));

// ── One worker ────────────────────────────────────────────────────────────

r.get('/workers/:id', handle(async (req, res) => {
  const worker = await loadWorker(req.params.id);
  if (!worker) fail(404, 'Worker not found');
  const [documents, assignments, audit, availability] = await Promise.all([
    prisma.workerDocument.findMany({
      where: { userId: worker.id },
      orderBy: { issuedAt: 'desc' },
      select: {
        id: true, type: true, version: true, status: true, issuedAt: true, issuedBy: true, acceptedAt: true,
        acceptedName: true, acceptanceMethod: true, supersededAt: true, bookingId: true,
      },
    }),
    prisma.booking.findMany({
      where: { staffId: worker.id },
      orderBy: { eventDate: 'desc' },
      take: 50,
      select: {
        id: true, eventDate: true, shiftStart: true, shiftEnd: true, status: true, role: true, venue: true,
        opsBooking: { select: { id: true, reference: true } }, client: { select: { companyName: true } },
      },
    }),
    prisma.auditLog.findMany({ where: { entityType: 'Worker', entityId: worker.id }, orderBy: { at: 'desc' }, take: 100 }),
    prisma.availability.findMany({ where: { userId: worker.id }, orderBy: { dateFrom: 'asc' } }),
  ]);
  res.json({
    ok: true,
    data: {
      ...worker,
      documents,
      assignments: assignments.map((a) => ({ ...a, eventDate: dateKey(a.eventDate) })),
      availabilityWindows: availability.map((w) => ({ from: dateKey(w.dateFrom), to: dateKey(w.dateTo), notes: w.notes })),
      audit,
    },
  });
}));

const PENSION = ['NOT_ASSESSED', 'NOT_ELIGIBLE_CURRENTLY', 'ELIGIBLE', 'ENROLLED', 'OPTED_IN', 'OPTED_OUT', 'ENTITLED_WORKER', 'POSTPONED', 'REVIEW_REQUIRED'] as const;

const updateWorker = z.object({
  phone: optionalText(40),
  dateOfBirth: ymd.nullable().optional(),
  activeStatus: z.enum(['ACTIVE', 'INACTIVE', 'LEFT']).optional(),
  roles: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  qualifications: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  experienceNotes: optionalText(2000),
  internalNotes: optionalText(2000),
  internalRating: z.number().int().min(1).max(5).nullable().optional(),
  availabilityNotes: optionalText(1000),
  emergencyContactName: optionalText(120),
  emergencyContactPhone: optionalText(40),
  payrollStatus: z.enum(['NOT_ADDED', 'PENDING', 'ACTIVE', 'LEAVER']).optional(),
  payrollExternalReference: optionalText(120),
  pensionStatus: z.enum(PENSION).optional(),
  pensionNotes: optionalText(1000),
  /** Required when recording OPTED_OUT: where the worker's own opt-out came from. */
  optOutEvidence: optionalText(500),
});

r.patch('/workers/:id', handle(async (req, res) => {
  const body = updateWorker.parse(req.body);
  const actor = actorOf(req);
  const user = await prisma.user.findFirst({
    where: { AND: [WORKER_WHERE, { id: req.params.id }] },
    include: { workerProfile: true, applicant: { select: { id: true, dateOfBirth: true } } },
  });
  if (!user) fail(404, 'Worker not found');

  const { phone, dateOfBirth, optOutEvidence, ...profileFields } = body;
  const before = user.workerProfile;

  if (profileFields.pensionStatus === 'OPTED_OUT' && before?.pensionStatus !== 'OPTED_OUT' && !optOutEvidence) {
    fail(400, "Recording an opt-out needs the evidence: the worker's own opt-out notice as received by the pension provider. VERGO Ops never opts anyone out.");
  }
  if (body.payrollExternalReference && /^[A-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]$/i.test(body.payrollExternalReference)) {
    fail(400, 'That looks like a National Insurance number. Store the payroll provider\'s employee reference instead.');
  }

  await prisma.$transaction(async (tx) => {
    const profileData: any = { ...profileFields };
    if (profileFields.pensionStatus && profileFields.pensionStatus !== before?.pensionStatus) {
      profileData.pensionLastAssessedAt = new Date();
      if (optOutEvidence) {
        profileData.pensionNotes = [before?.pensionNotes, `Opt-out evidence (${londonDateKey(new Date())}, ${actor}): ${optOutEvidence}`].filter(Boolean).join('\n');
      }
    }
    const after = await tx.workerProfile.upsert({
      where: { userId: user.id }, create: { userId: user.id, ...profileData }, update: profileData,
    });

    const changes = diff((before ?? {}) as Record<string, unknown>, profileData);
    const userChanges: Record<string, unknown> = {};
    if (phone !== undefined && phone !== user.phone) {
      await tx.user.update({ where: { id: user.id }, data: { phone } });
      changes.oldValue.phone = user.phone; changes.newValue.phone = phone; userChanges.phone = phone;
    }
    const prevDob = user.applicant?.dateOfBirth ? dateKey(user.applicant.dateOfBirth) : null;
    if (dateOfBirth !== undefined && dateOfBirth !== prevDob) {
      const applicantId = await ensureApplicant(user.id, tx);
      const prev = prevDob;
      {
        await tx.applicant.update({ where: { id: applicantId }, data: { dateOfBirth: dateOfBirth ? dateOnly(dateOfBirth) : null } });
        changes.oldValue.dateOfBirth = prev; changes.newValue.dateOfBirth = dateOfBirth;
      }
    }
    // Margins read User.pensionEnrolled; keep it in step with the recorded status.
    if (profileFields.pensionStatus) {
      const enrolled = profileFields.pensionStatus === 'ENROLLED' || profileFields.pensionStatus === 'OPTED_IN';
      await tx.user.update({ where: { id: user.id }, data: { pensionEnrolled: enrolled } });
    }

    if (Object.keys(changes.newValue).length) {
      const action = profileFields.pensionStatus && profileFields.pensionStatus !== before?.pensionStatus
        ? 'PENSION_STATUS_CHANGED'
        : profileFields.payrollStatus && profileFields.payrollStatus !== before?.payrollStatus ? 'PAYROLL_STATUS_CHANGED' : 'WORKER_UPDATED';
      await writeAudit(actor, {
        action, entityType: 'Worker', entityId: user.id, oldValue: changes.oldValue, newValue: changes.newValue,
        reason: optOutEvidence ?? null,
      }, tx);
    }
    return after;
  });

  res.json({ ok: true, data: await loadWorker(user.id) });
}));

const overrideBody = z.object({ active: z.boolean(), reason: optionalText(500) });

r.post('/workers/:id/ready-override', handle(async (req, res) => {
  const body = overrideBody.parse(req.body);
  const actor = actorOf(req);
  const worker = await loadWorker(req.params.id);
  if (!worker) fail(404, 'Worker not found');
  if (body.active && (!body.reason || body.reason.length < 10)) {
    fail(400, 'An override needs a reason of at least 10 characters.');
  }
  await prisma.$transaction(async (tx) => {
    await tx.workerProfile.upsert({
      where: { userId: worker.id },
      create: { userId: worker.id, readyOverride: body.active, readyOverrideReason: body.reason ?? null, readyOverrideBy: actor, readyOverrideAt: new Date() },
      update: { readyOverride: body.active, readyOverrideReason: body.active ? body.reason ?? null : null, readyOverrideBy: actor, readyOverrideAt: new Date() },
    });
    await writeAudit(actor, {
      action: body.active ? 'READY_OVERRIDE_SET' : 'READY_OVERRIDE_CLEARED',
      entityType: 'Worker', entityId: worker.id,
      oldValue: worker.readyOverride, newValue: { active: body.active, missing: worker.readiness.missing },
      reason: body.reason ?? null,
    }, tx);
  });
  res.json({ ok: true, data: await loadWorker(worker.id) });
}));

// ── Right to work ─────────────────────────────────────────────────────────

const blockBody = z.object({ blocked: z.boolean(), reason: optionalText(500) });

r.post('/workers/:id/rtw-block', handle(async (req, res) => {
  const body = blockBody.parse(req.body);
  const actor = actorOf(req);
  const worker = await loadWorker(req.params.id);
  if (!worker) fail(404, 'Worker not found');
  if (body.blocked && !body.reason) fail(400, 'Say why the worker is blocked.');
  await prisma.$transaction(async (tx) => {
    await tx.workerProfile.upsert({
      where: { userId: worker.id },
      create: { userId: worker.id, rtwBlocked: body.blocked, rtwBlockedReason: body.reason ?? null },
      update: { rtwBlocked: body.blocked, rtwBlockedReason: body.blocked ? body.reason ?? null : null },
    });
    await writeAudit(actor, {
      action: 'RTW_STATUS_CHANGED', entityType: 'Worker', entityId: worker.id,
      oldValue: { status: worker.rtw.status }, newValue: { blocked: body.blocked }, reason: body.reason ?? null,
    }, tx);
  });
  res.json({ ok: true, data: await loadWorker(worker.id) });
}));

const rtwCheckBody = z.object({
  method: z.enum(['SHARE_CODE', 'DOCUMENT', 'IDSP']),
  performedOn: ymd,
  performedBy: z.string().trim().min(2).max(100),
  outcome: z.enum(['PENDING', 'PASS', 'FAIL']),
  validUntil: ymd.nullable().optional(),
  followUpDue: ymd.nullable().optional(),
  documentType: optionalText(120),
  evidenceReference: optionalText(120),
  notes: optionalText(1000),
  prescribedCheckConfirmed: z.boolean(),
});

r.post('/workers/:id/rtw-checks', handle(async (req, res) => {
  const body = rtwCheckBody.parse(req.body);
  const actor = actorOf(req);
  const worker = await loadWorker(req.params.id);
  if (!worker) fail(404, 'Worker not found');

  if (body.outcome === 'PASS' && !body.prescribedCheckConfirmed) {
    fail(400, 'A pass can only be recorded once you confirm the prescribed check was actually performed. Uploading or holding a document is not the check.');
  }
  if (body.evidenceReference && looksLikeShareCode(body.evidenceReference)) {
    fail(400, 'That looks like a share code. Do not store share codes; record where the evidence is kept (e.g. "Profile PDF in RTW folder, 2026-10-03").');
  }
  const today = londonDateKey(new Date());
  if (body.performedOn > today) fail(400, 'The check date cannot be in the future.');
  if (body.outcome === 'PASS' && body.validUntil && body.validUntil <= today) {
    fail(400, 'Valid-until is in the past; a pass cannot be recorded against expired permission.');
  }
  if (body.validUntil && !body.followUpDue && body.outcome === 'PASS') {
    fail(400, 'Time-limited permission needs a follow-up date before it expires.');
  }

  await prisma.$transaction(async (tx) => {
    const applicantId = await ensureApplicant(worker.id, tx);
    const check = await tx.rightToWorkCheck.create({
      data: {
        applicantId,
        method: body.method,
        outcome: body.outcome,
        documentType: body.documentType ?? null,
        reference: body.evidenceReference ?? null,
        expiresAt: body.validUntil ? dateOnly(body.validUntil) : null,
        followUpDue: body.followUpDue ? dateOnly(body.followUpDue) : null,
        checkedAt: dateOnly(body.performedOn),
        checkedBy: actor,
        performedBy: body.performedBy,
        prescribedCheckConfirmed: body.prescribedCheckConfirmed,
        notes: body.notes ?? null,
      },
    });
    await writeAudit(actor, {
      action: 'RTW_CHECK_RECORDED', entityType: 'Worker', entityId: worker.id,
      oldValue: { status: worker.rtw.status, expiresAt: worker.rtw.expiresAt },
      newValue: { checkId: check.id, method: body.method, outcome: body.outcome, validUntil: body.validUntil ?? null, performedBy: body.performedBy, confirmed: body.prescribedCheckConfirmed },
    }, tx);
  });
  res.status(201).json({ ok: true, data: await loadWorker(worker.id) });
}));

// ── Document templates ────────────────────────────────────────────────────

const DOC_TYPES = Object.keys(DOC_TYPE_LABELS) as [OpsDocType, ...OpsDocType[]];

r.get('/templates', handle(async (_req, res) => {
  await ensureDefaultTemplates();
  const templates = await prisma.documentTemplate.findMany({
    orderBy: [{ type: 'asc' }, { version: 'desc' }],
    include: { _count: { select: { issued: true } } },
  });
  res.json({
    ok: true,
    data: templates.map((t) => ({
      ...t, label: DOC_TYPE_LABELS[t.type as OpsDocType], current: t.retiredAt == null,
      needsWording: needsWording(t.body), keys: templateKeys(t.body), issuedCount: t._count.issued,
    })),
  });
}));

const newTemplateBody = z.object({
  type: z.enum(DOC_TYPES),
  title: z.string().trim().min(3).max(200),
  body: z.string().min(20).max(60000),
  changeNote: z.string().trim().min(3).max(500),
});

// A change is always a new version. The previous one is retired, never edited,
// so documents already issued keep pointing at the wording they were given.
r.post('/templates', handle(async (req, res) => {
  const body = newTemplateBody.parse(req.body);
  const actor = actorOf(req);
  const created = await prisma.$transaction(async (tx) => {
    const current = await tx.documentTemplate.findFirst({ where: { type: body.type }, orderBy: { version: 'desc' } });
    const version = (current?.version ?? 0) + 1;
    await tx.documentTemplate.updateMany({ where: { type: body.type, retiredAt: null }, data: { retiredAt: new Date() } });
    const tpl = await tx.documentTemplate.create({
      data: { type: body.type, version, title: body.title, body: body.body, changeNote: body.changeNote, createdBy: actor },
    });
    await writeAudit(actor, {
      action: 'DOCUMENT_TEMPLATE_REPLACED', entityType: 'DocumentTemplate', entityId: tpl.id,
      oldValue: current ? { id: current.id, version: current.version } : null, newValue: { version, title: body.title },
      reason: body.changeNote,
    }, tx);
    return tpl;
  });
  res.status(201).json({ ok: true, data: created });
}));

// ── Issuing documents ─────────────────────────────────────────────────────

export function companyValues(): Record<string, string> {
  return {
    'company.legalName': SITE.legalName,
    'company.number': SITE.companyNumber,
    'company.registeredOffice': SITE.registeredOffice,
    'company.email': SITE.publicEmail,
    'company.phone': SITE.phoneDisplay,
  };
}

const issueBody = z.object({ type: z.enum(DOC_TYPES).refine((t) => t !== 'ASSIGNMENT_CONFIRMATION', 'Assignment confirmations are issued from the assignment') });

r.post('/workers/:id/documents', handle(async (req, res) => {
  const { type } = issueBody.parse(req.body);
  const actor = actorOf(req);
  await ensureDefaultTemplates();
  const worker = await loadWorker(req.params.id);
  if (!worker) fail(404, 'Worker not found');
  const template = await prisma.documentTemplate.findFirst({ where: { type, retiredAt: null }, orderBy: { version: 'desc' } });
  if (!template) fail(400, 'No current template for this document.');
  if (needsWording(template.body)) {
    fail(400, `The current ${DOC_TYPE_LABELS[type]} template still has gaps marked "VERGO WORDING NEEDED". Add the approved wording as a new version first.`);
  }

  const rendered = renderTemplate(template.body, {
    ...companyValues(),
    'worker.name': worker.name, 'worker.firstName': worker.firstName, 'worker.email': worker.email, 'worker.phone': worker.phone,
    today: londonDateKey(new Date()), 'doc.version': template.version,
  });

  const doc = await prisma.$transaction(async (tx) => {
    const superseded = await tx.workerDocument.updateMany({
      where: { userId: worker.id, type, status: { in: ['ISSUED', 'ACCEPTED'] } },
      data: { status: 'SUPERSEDED', supersededAt: new Date() },
    });
    const created = await tx.workerDocument.create({
      data: { userId: worker.id, templateId: template.id, type, version: template.version, issuedBy: actor, renderedBody: rendered },
    });
    await writeAudit(actor, {
      action: type === 'KEY_INFORMATION_DOCUMENT' ? 'KID_ISSUED' : 'DOCUMENT_ISSUED',
      entityType: 'Worker', entityId: worker.id,
      oldValue: { superseded: superseded.count },
      newValue: { documentId: created.id, type, version: template.version },
    }, tx);
    return created;
  });
  res.status(201).json({ ok: true, data: doc });
}));

const acceptBody = z.object({
  acceptedName: z.string().trim().min(2).max(200),
  acceptedAt: z.string().datetime().optional(),
  method: z.string().trim().min(3).max(200),
});

r.post('/documents/:id/accept', handle(async (req, res) => {
  const body = acceptBody.parse(req.body);
  const actor = actorOf(req);
  const doc = await prisma.workerDocument.findUnique({ where: { id: req.params.id } });
  if (!doc) fail(404, 'Document not found');
  if (!ACCEPTABLE_TYPES.has(doc.type as OpsDocType)) fail(400, `A ${DOC_TYPE_LABELS[doc.type as OpsDocType]} is issued, not accepted.`);
  if (doc.status !== 'ISSUED') fail(409, `This document is ${doc.status.toLowerCase()}; only an issued, current document can be accepted.`);
  const acceptedAt = body.acceptedAt ? new Date(body.acceptedAt) : new Date();
  if (acceptedAt < doc.issuedAt || acceptedAt > new Date()) fail(400, 'Acceptance time must be after issue and not in the future.');

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.workerDocument.update({
      where: { id: doc.id },
      data: { status: 'ACCEPTED', acceptedAt, acceptedName: body.acceptedName, acceptanceMethod: body.method, acceptanceRecordedBy: actor },
    });
    await writeAudit(actor, {
      action: doc.type === 'ZERO_HOURS_AGREEMENT' ? 'CONTRACT_ACCEPTED' : 'DOCUMENT_ACCEPTED',
      entityType: 'Worker', entityId: doc.userId,
      oldValue: { status: doc.status },
      newValue: { documentId: doc.id, version: doc.version, acceptedName: body.acceptedName, acceptedAt, method: body.method },
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
      oldValue: { status: doc.status }, newValue: { documentId: doc.id, status: 'WITHDRAWN' }, reason,
    }, tx);
  });
  res.json({ ok: true });
}));

export default r;
