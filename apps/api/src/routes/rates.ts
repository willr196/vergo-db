import { Router } from 'express';
import { getPublicRateCard } from '../config/pricing';

const r = Router();

// GET /api/v1/rates - public rate card (never includes accountRate)
r.get('/', (_req, res) => {
  res.json({ ok: true, data: getPublicRateCard() });
});

export default r;
