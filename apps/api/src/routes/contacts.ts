import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { adminAuth } from '../middleware/adminAuth';
import { ContactStatus } from '@prisma/client';

const r = Router();

const updateStatusSchema = z.object({
  status: z.nativeEnum(ContactStatus)
});

// ============================================
// GET /api/v1/contacts - List all contacts (ADMIN)
// ============================================
r.get('/', adminAuth, async (_req, res, next) => {
  try {
    const contacts = await prisma.contact.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json({ ok: true, data: contacts });
  } catch (error) {
    next(error);
  }
});

// ============================================
// GET /api/v1/contacts/:id - Single contact (ADMIN)
// ============================================
r.get('/:id', adminAuth, async (req, res, next) => {
  try {
    const contact = await prisma.contact.findUnique({
      where: { id: req.params.id }
    });

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({ ok: true, data: contact });
  } catch (error) {
    next(error);
  }
});

// ============================================
// PATCH /api/v1/contacts/:id/status - Update status (ADMIN)
// ============================================
r.patch('/:id/status', adminAuth, async (req, res, next) => {
  try {
    const { status } = updateStatusSchema.parse(req.body);

    const updated = await prisma.contact.update({
      where: { id: req.params.id },
      data: { status }
    });

    res.json({ ok: true, data: updated });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return res.status(404).json({ error: 'Contact not found' });
    }
    next(error);
  }
});

// ============================================
// DELETE /api/v1/contacts/:id - Delete contact (ADMIN)
// ============================================
r.delete('/:id', adminAuth, async (req, res, next) => {
  try {
    await prisma.contact.delete({
      where: { id: req.params.id }
    });
    res.json({ ok: true });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return res.status(404).json({ error: 'Contact not found' });
    }
    next(error);
  }
});

export default r;
