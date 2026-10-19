import { Router } from 'express';
import { getPublicRateCard } from '../config/pricing';
import { publicRateList } from '../site/rates';

const r = Router();

// GET /api/v1/rates - public rate card (never includes accountRate). roles is
// every active public rate in pence and pounds; quote-only rates never appear.
r.get('/', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
  res.json({ ok: true, data: { ...getPublicRateCard(), roles: publicRateList() } });
});

export default r;
