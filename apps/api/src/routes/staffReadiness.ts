/**
 * GET /api/v1/user/readiness: the signed-in worker's "ready to work" checklist
 * for the website's staff overview.
 *
 * It reads the same record Ops uses to decide who can be booked (loadWorker,
 * ops/compliance computeReadiness) and turns it into steps in the worker's
 * words: what they can do themselves, and what is with the office. Internal
 * detail (notes, ratings, override reasons, check evidence) never leaves Ops.
 */

import { Router } from 'express';
import { prisma } from '../prisma';
import { requireUser } from '../middleware/userAuth';
import { loadWorker } from '../ops/service';
import { workerPackState } from './documentLinks';

const r = Router();

type Step = {
  key: string;
  label: string;
  /** done: nothing to do. todo: theirs to do now. office: with VERGO. */
  state: 'done' | 'todo' | 'office';
  hint?: string;
  href?: string;
};

r.get('/', requireUser, async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const worker = await loadWorker(userId);
    if (!worker) {
      // A login without a staff record: nothing to be ready for yet.
      return res.json({ ok: true, data: { isStaff: false, ready: false, steps: [] } });
    }
    const [user, pack] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { staffAvatar: true } }),
      workerPackState(userId),
    ]);

    const steps: Step[] = [];
    const has = (v: string | null | undefined) => !!v && v.trim() !== '';

    steps.push(user?.staffAvatar
      ? { key: 'photo', label: 'Profile photo', state: 'done' }
      : { key: 'photo', label: 'Add your profile photo', state: 'todo', href: '/staff/profile' });
    steps.push(has(worker.phone)
      ? { key: 'phone', label: 'Phone number', state: 'done' }
      : { key: 'phone', label: 'Add your phone number', state: 'todo', href: '/staff/profile' });
    steps.push(has(worker.emergencyContactName) && has(worker.emergencyContactPhone)
      ? { key: 'emergency', label: 'Emergency contact', state: 'done' }
      : { key: 'emergency', label: 'Add an emergency contact', state: 'todo', href: '/staff/profile' });

    // Key Information Document: issued by the office, then confirmed received by them.
    if (pack.kid && !pack.kid.acknowledgedAt) {
      steps.push({ key: 'kid', label: 'Read your Key Information Document', state: 'todo', href: '/staff/documents' });
    } else if (worker.kid.status === 'issued' && !worker.kid.reacceptanceRequired) {
      steps.push({ key: 'kid', label: 'Key Information Document', state: 'done' });
    } else {
      steps.push({ key: 'kid', label: 'Key Information Document', state: 'office', hint: 'We will send it to you before your first shift.' });
    }

    // Employment agreement: issued by the office, then agreed by them.
    if (pack.pending) {
      steps.push({ key: 'agreement', label: 'Read and agree your employment agreement', state: 'todo', href: '/staff/documents' });
    } else if (worker.contract.status === 'accepted' && !worker.contract.reacceptanceRequired) {
      steps.push({ key: 'agreement', label: 'Employment agreement', state: 'done' });
    } else {
      steps.push({ key: 'agreement', label: 'Employment agreement', state: 'office', hint: 'We will send it to you to read and agree.' });
    }

    // Right to work is checked by the office from documents they show us.
    const rtwHint: Record<string, string> = {
      not_checked: 'Bring your passport, or a share code, so we can check it before your first shift.',
      follow_up_required: 'Your permission needs checking again. We will be in touch to arrange it.',
      expired: 'Your right-to-work check has expired. Get in touch so we can check it again.',
      blocked: 'Please get in touch with the office.',
    };
    steps.push(worker.rtw.status === 'valid'
      ? { key: 'rtw', label: 'Right to work checked', state: 'done' }
      : { key: 'rtw', label: 'Right-to-work check', state: 'office', hint: rtwHint[worker.rtw.status] ?? rtwHint.blocked });

    steps.push(worker.payrollStatus === 'ACTIVE'
      ? { key: 'payroll', label: 'Set up on payroll', state: 'done' }
      : { key: 'payroll', label: 'Payroll set-up', state: 'office', hint: 'We set you up with our payroll provider. They may contact you for your details.' });

    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.json({
      ok: true,
      data: {
        isStaff: true,
        // The same answer Ops gives when booking them, including an override.
        ready: worker.readiness.ready && !!user?.staffAvatar,
        active: worker.activeStatus === 'ACTIVE',
        steps,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default r;
