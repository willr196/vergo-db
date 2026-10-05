/**
 * VERGO Ops API, mounted at /api/v1/ops. Every route sits behind adminAuth:
 * an admin web session (idle and absolute timeouts) plus CSRF on writes. A
 * mobile JWT does not open it, and nothing here is reachable without a session.
 */

import { Router } from 'express';
import { adminAuth } from '../../middleware/adminAuth';
import workers from './workers';
import bookings from './bookings';
import admin from './admin';
import planning from './planning';
import documents from './documents';
import series from './series';

const r = Router();
r.use(adminAuth);
r.use(workers);
r.use(bookings);
r.use(admin);
r.use(planning);
r.use(documents);
r.use(series);

export default r;
