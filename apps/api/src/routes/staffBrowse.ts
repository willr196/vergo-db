import { Router } from 'express';

const r = Router();

const publicBrowseDisabledPayload = {
  ok: false,
  error: 'Public staff browsing has been removed for data-protection reasons. Request staff or use the pricing calculator instead.',
  data: {
    quoteUrl: '/contact?tab=staff#contact-forms',
    calculatorUrl: '/pricing#calculator',
  },
} as const;

// GET /api/v1/staff/browse
r.get('/browse', (_req, res) => {
  res.status(410).json(publicBrowseDisabledPayload);
});

// GET /api/v1/staff/browse/:id
r.get('/browse/:id', (_req, res) => {
  res.status(410).json(publicBrowseDisabledPayload);
});

export default r;
