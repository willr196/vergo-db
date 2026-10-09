/**
 * VERGO Scheduling API, mounted at /api/v1/scheduling.
 *
 * The desktop admin tool (Documents/vergo_admin) on the web: the same routes,
 * the same rules and the same responses, on its own tables (Sched*), so it
 * stays a separate thing from VERGO Ops. The desktop paths map one to one:
 * the desktop's /api/jobs/:id is /api/v1/scheduling/jobs/:id here.
 *
 * Behind the admin web session and CSRF, like the rest of admin. The desktop
 * tool's own login is replaced by that session; /me answers who is signed in.
 */

import { Router } from 'express';
import { z } from 'zod';
import { adminAuth } from '../middleware/adminAuth';
import { mountFastifyRoutes, sendError } from './fastifyShim';
import { clientRoutes } from './routes/clients';
import { staffRoutes } from './routes/staff';
import { jobRoutes } from './routes/jobs';
import { leadRoutes } from './routes/leads';
import { toolRoutes } from './routes/tools';
import { restoreFromBackup } from './restore';

const r = Router();
r.use(adminAuth);

r.get('/me', (req, res) => {
  res.json({ username: req.session?.username ?? 'admin' });
});

// Desktop backups (vergo_admin/backups/vergo-ops-*.sql), restored row for row.
r.post('/restore', async (req, res) => {
  try {
    const body = z.object({ sql: z.string().min(1, 'Choose a backup file').max(5_000_000), commit: z.boolean().optional() }).parse(req.body);
    const result = await restoreFromBackup(body.sql, body.commit === true);
    if (result.conflicts.length && body.commit) return res.status(409).json({ error: 'Some rows clash with records here. Nothing was restored.', ...result });
    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues[0]?.message ?? 'Invalid backup' });
    if (error instanceof Error && /backup|malformed/i.test(error.message)) return res.status(400).json({ error: error.message });
    sendError(error, res);
  }
});

for (const routes of [clientRoutes, staffRoutes, jobRoutes, leadRoutes, toolRoutes]) {
  void mountFastifyRoutes(r, routes);
}

r.use((_req, res) => res.status(404).json({ error: 'Not found' }));

export default r;
