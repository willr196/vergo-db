import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';

const router = Router();

async function handleLogin(req: Request, res: Response) {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Password required' });

  const adminHash = process.env.ADMIN_HASH;
  if (!adminHash) return res.status(500).json({ error: 'Server misconfigured' });

  const ok = await bcrypt.compare(password, adminHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  req.session.isAdmin = true;
  res.json({ ok: true });
}

// Support old and new URLs
router.post('/login', handleLogin);
router.post('/admin/login', handleLogin);

router.post('/admin/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Could not log out' });
    res.clearCookie('vergo.sid');
    res.json({ ok: true });
  });
});

export default router;
