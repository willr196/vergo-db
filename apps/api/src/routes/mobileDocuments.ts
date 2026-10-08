/**
 * A worker's own VERGO Ops documents, in the app.
 *
 *   GET  /api/v1/mobile/documents                         what is waiting and what is done
 *   GET  /api/v1/mobile/documents/:id                     one document, with its text
 *   POST /api/v1/mobile/documents/kid/:id/acknowledge     { acknowledged: true }
 *   POST /api/v1/mobile/documents/agreement/:id/accept    { agree: true, typedName }
 *
 * The same rules as the secure link (src/routes/documentLinks.ts), through
 * the same service: the KID is confirmed before the agreement opens, only the
 * current issued version can be agreed, and the agreement is recorded against
 * that exact version. The JWT is the worker, so every lookup is scoped to
 * req.auth.userId and anyone else's document id is a 404.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireUserJwt } from '../middleware/jwtAuth';
import { acknowledgeKid, acceptAgreement, type AcceptanceEvidence } from '../ops/documentService';
import { AGREEMENT_STATEMENT, KID_ACKNOWLEDGEMENT } from '../ops/documents';
import { workerPackState } from './documentLinks';
import { workerAppActor } from '../ops/audit';
import { dateKey } from '../ops/time';

const r = Router();

r.use(requireUserJwt);
r.use(rateLimit({ windowMs: 10 * 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false }));

const WORKER_TYPES = ['KEY_INFORMATION_DOCUMENT', 'ZERO_HOURS_AGREEMENT', 'ASSIGNMENT_CONFIRMATION'] as const;
const TITLES: Record<(typeof WORKER_TYPES)[number], string> = {
  KEY_INFORMATION_DOCUMENT: 'Key Information Document',
  ZERO_HOURS_AGREEMENT: 'Zero-Hours Employment Agreement',
  ASSIGNMENT_CONFIRMATION: 'Assignment Confirmation',
};

function handle(fn: (req: Request, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      await fn(req, res);
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ ok: false, error: error.issues[0]?.message ?? 'Check the form and try again.' });
      if (error?.statusCode) return res.status(error.statusCode).json({ ok: false, error: error.message });
      next(error);
    }
  };
}

function evidence(req: Request, method: string): AcceptanceEvidence {
  return {
    channel: 'app', method, authUserId: req.auth!.userId,
    ip: req.ip ?? null, userAgent: String(req.headers['user-agent'] ?? '') || null,
  };
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

r.get('/', handle(async (req, res) => {
  const s = await workerPackState(req.auth!.userId);
  const kidDone = Boolean(s.kid?.acknowledgedAt);
  res.json({
    ok: true,
    data: {
      kid: s.kid && { id: s.kid.id, version: s.kid.version, issuedAt: iso(s.kid.issuedAt), acknowledgedAt: iso(s.kid.acknowledgedAt) },
      agreement: s.pending
        ? { id: s.pending.id, version: s.pending.version, issuedAt: iso(s.pending.issuedAt), acceptedAt: null, acceptedName: null, replacesVersion: s.agreed?.version ?? null }
        : s.agreed && { id: s.agreed.id, version: s.agreed.version, issuedAt: iso(s.agreed.issuedAt), acceptedAt: iso(s.agreed.acceptedAt), acceptedName: s.agreed.acceptedName, replacesVersion: null },
      confirmations: s.confirmations.map((c) => ({
        id: c.id,
        issuedAt: iso(c.issuedAt),
        date: c.booking ? dateKey(c.booking.eventDate) : null,
        start: c.booking?.shiftStart ?? null,
        role: c.booking?.role ?? null,
        venue: c.booking?.venue ?? null,
      })),
      // What still needs the worker: confirm the KID, then agree the agreement.
      toDo: (s.kid && !kidDone ? 1 : 0) + (s.pending ? 1 : 0),
      statements: { kidAcknowledgement: KID_ACKNOWLEDGEMENT, agreement: AGREEMENT_STATEMENT },
    },
  });
}));

r.get('/:id', handle(async (req, res) => {
  const doc = await prisma.workerDocument.findFirst({
    where: { id: req.params.id, userId: req.auth!.userId, type: { in: [...WORKER_TYPES] } },
  });
  if (!doc) return res.status(404).json({ ok: false, error: 'Document not found' });
  res.json({
    ok: true,
    data: {
      id: doc.id,
      type: doc.type,
      title: TITLES[doc.type as (typeof WORKER_TYPES)[number]],
      version: doc.version,
      status: doc.status,
      issuedAt: iso(doc.issuedAt),
      acknowledgedAt: iso(doc.acknowledgedAt),
      acceptedAt: iso(doc.acceptedAt),
      acceptedName: doc.acceptedName,
      // Plain text: "# " and "## " headings, "- " list items, blank lines between paragraphs.
      body: doc.renderedBody,
    },
  });
}));

r.post('/kid/:id/acknowledge', handle(async (req, res) => {
  z.object({ acknowledged: z.literal(true, { errorMap: () => ({ message: 'Tick the box to confirm you have received it.' }) }) }).parse(req.body ?? {});
  await acknowledgeKid(req.auth!.userId, req.params.id, evidence(req, 'Acknowledged in the VERGO app'), await workerAppActor(req.auth!.userId));
  res.json({ ok: true });
}));

r.post('/agreement/:id/accept', handle(async (req, res) => {
  const body = z.object({
    agree: z.literal(true, { errorMap: () => ({ message: 'Tick the box to confirm you have read and agree to the agreement.' }) }),
    typedName: z.string({ required_error: 'Type your full name.' }).trim().min(2, 'Type your full name.').max(200),
  }).parse(req.body ?? {});
  await acceptAgreement(req.auth!.userId, req.params.id, body.typedName, evidence(req, 'Electronic agreement in the VERGO app (signed in)'), await workerAppActor(req.auth!.userId));
  res.json({ ok: true });
}));

export default r;
