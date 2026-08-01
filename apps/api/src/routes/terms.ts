import { Router } from 'express';
import { prisma } from '../prisma';

const r = Router();

// GET /api/v1/terms - active (most recently published) terms version
r.get('/', async (_req, res, next) => {
  try {
    const active = await prisma.termsVersion.findFirst({
      where: { publishedAt: { not: null } },
      orderBy: { publishedAt: 'desc' },
    });

    if (!active) {
      return res.status(404).json({ ok: false, error: 'No published terms version found' });
    }

    res.json({
      ok: true,
      data: {
        version: active.version,
        effectiveDate: active.effectiveDate,
        sections: active.sections,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default r;
