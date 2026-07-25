// Admin endpoints for recording and reviewing right-to-work checks.
//
// The retained document copy is required to establish the statutory excuse, so
// uploads go to S3 under an `rtw/` prefix and are only ever served back through
// short-lived presigned URLs to an authenticated admin.

import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '../prisma';
import { adminAuth } from '../middleware/adminAuth';
import { authLogger } from '../services/logger';
import { getRightToWorkSummary, summariseChecks } from '../services/rightToWork';
import { uploadBuffer, presignDownload } from '../services/s3';
import { env } from '../env';

const r = Router();

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_DOCUMENT_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
};

const optionalDate = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
);

const createCheckBody = z.object({
  method: z.enum(['SHARE_CODE', 'DOCUMENT', 'IDSP']),
  outcome: z.enum(['PENDING', 'PASS', 'FAIL']),
  documentType: z.string().max(120).trim().optional(),
  reference: z.string().max(120).trim().optional(),
  validFrom: optionalDate,
  expiresAt: optionalDate,
  notes: z.string().max(1000).optional(),
  document: z
    .object({
      fileName: z.string().min(1).max(255),
      contentType: z.string().max(100),
      contentBase64: z.string().min(1),
    })
    .optional(),
});

function parseDateOnly(value?: string) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function shapeCheck(check: {
  id: string;
  method: string;
  outcome: string;
  documentType: string | null;
  reference: string | null;
  validFrom: Date | null;
  expiresAt: Date | null;
  checkedBy: string;
  checkedAt: Date;
  documentKey: string | null;
  notes: string | null;
}) {
  return {
    id: check.id,
    method: check.method,
    outcome: check.outcome,
    documentType: check.documentType,
    reference: check.reference,
    validFrom: check.validFrom,
    expiresAt: check.expiresAt,
    checkedBy: check.checkedBy,
    checkedAt: check.checkedAt,
    hasDocument: Boolean(check.documentKey),
    notes: check.notes,
  };
}

// ============================================
// RECORD A CHECK
// ============================================
r.post('/:applicantId', adminAuth, async (req, res, next) => {
  try {
    const parsed = createCheckBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', issues: parsed.error.issues });
    }
    const data = parsed.data;

    const applicant = await prisma.applicant.findUnique({
      where: { id: req.params.applicantId },
      select: { id: true },
    });
    if (!applicant) {
      return res.status(404).json({ error: 'Applicant not found' });
    }

    // A time-limited (List B) permission is only meaningful with a follow-up
    // date, and a permanent one must not silently inherit a stale expiry.
    if (data.outcome === 'PASS' && data.expiresAt) {
      const expiry = parseDateOnly(data.expiresAt)!;
      if (expiry <= new Date()) {
        return res.status(400).json({
          error: 'Expiry date is in the past — a check cannot be recorded as passed against expired permission.',
        });
      }
    }

    let documentKey: string | null = null;
    if (data.document) {
      const extension = ALLOWED_DOCUMENT_TYPES[data.document.contentType.toLowerCase()];
      if (!extension) {
        return res.status(400).json({ error: 'Document must be a PDF, JPEG, PNG or HEIC file.' });
      }

      const raw = data.document.contentBase64;
      const buffer = Buffer.from(raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw, 'base64');
      if (!buffer.length) {
        return res.status(400).json({ error: 'Uploaded document was empty.' });
      }
      if (buffer.byteLength > MAX_DOCUMENT_BYTES) {
        return res.status(400).json({ error: 'Document too large. Maximum size is 10MB.' });
      }
      if (!env.s3Configured) {
        return res.status(503).json({
          error: 'Document storage is unavailable in this environment. Record the check without a document, or try again later.',
        });
      }

      documentKey = `rtw/${applicant.id}/${randomUUID()}.${extension}`;
      await uploadBuffer(documentKey, buffer, data.document.contentType);
    }

    const adminUsername = (req.session as any)?.username || 'admin';

    const check = await prisma.rightToWorkCheck.create({
      data: {
        applicantId: applicant.id,
        method: data.method,
        outcome: data.outcome,
        documentType: data.documentType || null,
        reference: data.reference || null,
        validFrom: parseDateOnly(data.validFrom),
        expiresAt: parseDateOnly(data.expiresAt),
        notes: data.notes || null,
        documentKey,
        checkedBy: adminUsername,
      },
    });

    authLogger.info(
      {
        action: 'right_to_work_check_recorded',
        admin: adminUsername,
        applicantId: applicant.id,
        checkId: check.id,
        method: check.method,
        outcome: check.outcome,
        expiresAt: check.expiresAt,
        hasDocument: Boolean(documentKey),
      },
      'Admin recorded right-to-work check'
    );

    const summary = await getRightToWorkSummary(applicant.id);
    const payload = { check: shapeCheck(check), summary };
    res.status(201).json({ ok: true, ...payload, data: payload });
  } catch (e) { next(e); }
});

// ============================================
// FOLLOW-UP CHECKS DUE (List B expiries)
//
// Declared before the /:applicantId route so it is not captured as a param.
// ============================================
r.get('/expiring', adminAuth, async (req, res, next) => {
  try {
    const withinDays = Math.min(365, Math.max(1, Number(req.query.withinDays) || 60));
    const horizon = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);

    const checks = await prisma.rightToWorkCheck.findMany({
      where: {
        outcome: 'PASS',
        expiresAt: { not: null, lte: horizon },
      },
      orderBy: { expiresAt: 'asc' },
      include: {
        applicant: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    // Someone re-checked after an expiry is no longer due a follow-up, so drop
    // any applicant who already has a currently-valid check.
    const now = new Date();
    const applicantIds = [...new Set(checks.map((check) => check.applicantId))];
    const allChecks = await prisma.rightToWorkCheck.findMany({
      where: { applicantId: { in: applicantIds } },
      select: { applicantId: true, outcome: true, expiresAt: true, checkedAt: true, checkedBy: true },
    });

    const byApplicant = new Map<string, typeof allChecks>();
    for (const check of allChecks) {
      const list = byApplicant.get(check.applicantId) ?? [];
      list.push(check);
      byApplicant.set(check.applicantId, list);
    }

    const due = checks
      .filter((check) => {
        const summary = summariseChecks(byApplicant.get(check.applicantId) ?? [], now);
        // Still listed if the cover has already lapsed, or if the valid check
        // that clears them is itself the one about to expire.
        return !summary.clearedToWork || (summary.expiresAt !== null && summary.expiresAt <= horizon);
      })
      .map((check) => ({
        ...shapeCheck(check),
        expired: check.expiresAt !== null && check.expiresAt <= now,
        applicant: check.applicant,
      }));

    const payload = { withinDays, checks: due };
    res.json({ ok: true, ...payload, data: payload });
  } catch (e) { next(e); }
});

// ============================================
// LIST CHECKS FOR AN APPLICANT
// ============================================
r.get('/:applicantId', adminAuth, async (req, res, next) => {
  try {
    const applicant = await prisma.applicant.findUnique({
      where: { id: req.params.applicantId },
      select: { id: true },
    });
    if (!applicant) {
      return res.status(404).json({ error: 'Applicant not found' });
    }

    const checks = await prisma.rightToWorkCheck.findMany({
      where: { applicantId: applicant.id },
      orderBy: { checkedAt: 'desc' },
    });

    const payload = {
      checks: checks.map(shapeCheck),
      summary: summariseChecks(checks),
    };
    res.json({ ok: true, ...payload, data: payload });
  } catch (e) { next(e); }
});

// ============================================
// RETRIEVE THE RETAINED DOCUMENT COPY
// ============================================
r.get('/check/:checkId/document', adminAuth, async (req, res, next) => {
  try {
    const check = await prisma.rightToWorkCheck.findUnique({
      where: { id: req.params.checkId },
      select: { id: true, documentKey: true },
    });

    if (!check) {
      return res.status(404).json({ error: 'Check not found' });
    }
    if (!check.documentKey) {
      return res.status(404).json({ error: 'No document stored for this check' });
    }

    const url = await presignDownload(check.documentKey);
    res.json({ ok: true, signedUrl: url, url, data: { signedUrl: url, url } });
  } catch (e) { next(e); }
});

export default r;
