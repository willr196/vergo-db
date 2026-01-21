import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { env } from './env';
import applications from './routes/applications';
import { adminAuth } from './middleware/adminAuth';
import auth from './routes/auth';
import contact from './routes/contact';
import userAuth from './routes/userAuth';
import jobs from './routes/jobs';
import jobApplications from './routes/jobApplications';
import clientAuthRoutes from './routes/clientAuth';
import adminClients from './routes/adminClients';
import quotes from './routes/quotes';
import mobileJobs from './routes/mobileJobs';
import mobileJobApplications from './routes/mobileJobApplications';
import mobileClient from './routes/mobileClient';

const app = express();
app.disable('x-powered-by');

// Only trust proxy in production (needed for Fly/HTTPS)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}
// Security headers

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
const PgSession = connectPgSimple(session);
const dbUsesSsl = /sslmode=require/i.test(env.dbUrl);

app.use(session({
  name: 'vergo.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: new PgSession({
    conString: env.dbUrl,
    tableName: 'user_sessions',
    createTableIfMissing: true,
    ssl: dbUsesSsl ? { rejectUnauthorized: false } : false
  }),
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

// Contact form endpoints
app.use('/api/v1/contact', contact);

app.use('/api/v1/jobs', jobs);

// Protect admin.html BEFORE static middleware
app.get('/admin.html', adminAuth, (req, res) => {
  const pub = path.join(process.cwd(), 'public');
  res.sendFile(path.join(pub, 'admin.html'));
});

app.use('/api/v1/user', userAuth);

// Applications API
app.use('/api/v1/applications', applications);

// Canonical redirects + legacy cleanup (must be before static)
app.get(['/apply', '/contact', '/pricing', '/hire-staff'], (req, res) => {
  res.redirect(301, `${req.path}.html`);
});

app.get('/hire-us.html', (_req, res) => {
  res.redirect(301, '/hire-staff.html');
});

app.get(['/event-management', '/event-management/*'], (_req, res) => {
  res.redirect(301, '/hire-staff.html');
});

app.use((req, res, next) => {
  if (req.path.endsWith('.bak')) {
    return res.status(404).send('Not found');
  }
  return next();
});

// Redirect root to the home page
app.get('/', (_, res) => res.redirect('/index.html'));

// Static frontend (last)
const pub = path.join(process.cwd(), 'public');
app.use(express.static(pub, { extensions: ['html'] }));

app.use('/api/v1/job-applications', jobApplications);

// Mobile app endpoints (JWT)
app.use('/api/v1/mobile/jobs', mobileJobs);
app.use('/api/v1/mobile/job-applications', mobileJobApplications);

// Admin clients
app.use('/api/v1/admin/clients', adminClients);

// Quotes
app.use('/api/v1/quotes', quotes);

app.use('/api/v1/client', clientAuthRoutes);
app.use('/api/v1/clients', clientAuthRoutes);

// Client mobile dashboard endpoints (JWT)
app.use('/api/v1/client/mobile', mobileClient);

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
