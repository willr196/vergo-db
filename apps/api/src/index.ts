import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import session from 'express-session';
import { env } from './env';
import applications from './routes/applications';
import { adminAuth } from './middleware/adminAuth';
import auth from './routes/auth';
import contact from './routes/contact'; // NEW: Contact routes

const app = express();
app.disable('x-powered-by');

// Only trust proxy in production (needed for Fly/HTTPS)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Security headers
app.use(helmet({ contentSecurityPolicy: false }));

// CORS — must include your frontend origin + localhost for dev
app.use(cors({
  origin: [
    env.webOrigin,
    `http://localhost:${env.port}`,
    'http://localhost:8080',
    'https://vergo-app.fly.dev'
  ],
  credentials: true
}));

// Body + rate limiter
app.use(express.json({ limit: '5mb' }));
app.use(rateLimit({ windowMs: 60_000, max: 120 }));

// Session configuration
if (env.nodeEnv === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET required in production');
}

const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-only-secret-change-in-production';
app.use(session({
  name: 'vergo.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 1000 * 60 * 60 * 2 // 2 hours
  }
}));

// Healthcheck
app.get('/health', (_, res) => res.json({ ok: true }));

// Auth endpoints
app.use('/api/v1/auth', auth);

// Contact form endpoints (NEW!)
app.use('/api/v1/contact', contact);

// Protect admin.html BEFORE static middleware
app.get('/admin.html', adminAuth, (req, res) => {
  const pub = path.join(process.cwd(), 'public');
  res.sendFile(path.join(pub, 'admin.html'));
});

// Applications API
app.use('/api/v1/applications', applications);

// Redirect root to the home page
app.get('/', (_, res) => res.redirect('/index.html'));

// Static frontend (last)
const pub = path.join(process.cwd(), 'public');
app.use(express.static(pub, { extensions: ['html'] }));

// 404 handler (after static)
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler (must be last)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[ERROR]', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server listening on 0.0.0.0:${PORT}`);
});

export default app;