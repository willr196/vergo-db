import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { prisma } from '../prisma';
import { adminAuth } from '../middleware/adminAuth';
import { authLogger } from '../services/logger';

const r = Router();

r.use(adminAuth);

// Same strength requirement enforced by prisma/seed.ts for consistency.
const strongPasswordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,}$/;
const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(72)
  .regex(strongPasswordPattern, 'Password must include uppercase, lowercase, and a number');

const createAdminSchema = z.object({
  username: z.string().min(3).max(100).trim(),
  password: passwordSchema
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: passwordSchema
});

function adminUsername(req: any): string {
  return req.session?.username || 'admin';
}

// GET /api/v1/admin/users — list admin accounts
r.get('/', async (req, res, next) => {
  try {
    const users = await prisma.adminUser.findMany({
      select: { id: true, username: true, createdAt: true, lockedUntil: true, mustChangePassword: true },
      orderBy: { createdAt: 'asc' }
    });
    res.json({ ok: true, users, data: users });
  } catch (e) { next(e); }
});

// POST /api/v1/admin/users — create a new admin account
r.post('/', async (req, res, next) => {
  try {
    const parsed = createAdminSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    const { username, password } = parsed.data;

    const existing = await prisma.adminUser.findUnique({ where: { username } });
    if (existing) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const hash = await bcrypt.hash(password, 12);
    const user = await prisma.adminUser.create({
      data: { username, password: hash, mustChangePassword: true },
      select: { id: true, username: true, createdAt: true, mustChangePassword: true }
    });

    authLogger.info({ action: 'admin_user_created', admin: adminUsername(req), newUsername: username }, 'Admin user created');
    res.status(201).json({ ok: true, user, data: user });
  } catch (e) { next(e); }
});

// DELETE /api/v1/admin/users/:id — remove an admin account
r.delete('/:id', async (req, res, next) => {
  try {
    const target = await prisma.adminUser.findUnique({ where: { id: req.params.id } });
    if (!target) {
      return res.status(404).json({ error: 'Admin user not found' });
    }
    if (target.id === (req.session as any).userId) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    const totalAdmins = await prisma.adminUser.count();
    if (totalAdmins <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last remaining admin account' });
    }

    await prisma.adminUser.delete({ where: { id: target.id } });
    authLogger.info({ action: 'admin_user_deleted', admin: adminUsername(req), removedUsername: target.username }, 'Admin user deleted');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/v1/admin/users/change-password — change the logged-in admin's own password
r.post('/change-password', async (req, res, next) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    const { currentPassword, newPassword } = parsed.data;
    const userId = (req.session as any).userId;

    const user = await prisma.adminUser.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const matches = await bcrypt.compare(currentPassword, user.password);
    if (!matches) {
      authLogger.warn({ action: 'admin_password_change_failed', admin: user.username }, 'Incorrect current password on change attempt');
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await prisma.adminUser.update({
      where: { id: user.id },
      data: { password: hash, failedAttempts: 0, lockedUntil: null }
    });

    authLogger.info({ action: 'admin_password_changed', admin: user.username }, 'Admin changed their own password');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default r;
