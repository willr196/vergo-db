import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import session from 'express-session';
// connect-pg-simple is a factory; require-style import is correct
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PgSession = require('connect-pg-simple')(session);

import { env } from './env';
import applications from './routes/applications';
import auth from './routes/auth';
import { adminPageAuth } from './middleware/adminAuth';

const app = express();
const isProd = process.env.NODE_ENV === 'production';

app.disable('x-powered-by');
if (isProd) app.set('trust proxy', 1); // required for secure cookies behind Fly proxy

// 1) Security headers
app.use(helmet({ contentSecurityPolicy: false }));

// 2) CORS
app.use(cors({
  origin: [
    env.webOrigin,                      // your frontend (if any)
    `http://localhost:${env.port}`,     // dev
    'http://localhost:8080',            // alt dev
    'https://vergo-app.fly.dev',        // adjust to your domain
  ].filter(Boolean) as string[],
  credentials: true,
}));

// 3) Body parsers (must be before routes)
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// 4) Sessions (Postgres via Neon)
// Set SESSION_SECRET and DATABASE_URL via fly secrets
if (!process.env.SESSION_SECRET && isProd) {
  throw new Error('SESSION_SECRET must be set in production');
}
app.use(session({
  store: new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: 'session',
    createTableIfMissing: false, // set true if you prefer auto-create
  }),
  name: 'vergo.sid',
  secret: process.env.SESSION_SECRET || 'dev-only-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 2, // 2 hours
  },
}));

// 5) Rate-limit login endpoints (support old + new)
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50 });
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/admin/login', authLimiter);

// 6) Healthcheck
app.get('/health', (_req, res) => res.json({ ok: true }));

// 7) Auth + APIs
app.use('/api/v1/auth', auth);
app.use('/api/v1/applications', applications);

// 8) Protect admin.html BEFORE static
app.get('/admin.html', adminPageAuth, (req, res) => {
  const pub = path.join(process.cwd(), 'public');
  res.sendFile(path.join(pub, 'admin.html'));
});

// 9) Root redirect & static
app.get('/', (_req, res) => res.redirect('/apply.html'));
const pub = path.join(process.cwd(), 'public');
app.use(express.static(pub, { extensions: ['html'] }));

// 10) 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// 11) Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
