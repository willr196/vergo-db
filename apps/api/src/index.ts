import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';
import fs from 'fs';
import path from 'node:path';
import crypto from 'node:crypto';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { env } from './env';
import applications from './routes/applications';
import { adminAuth, adminPageAuth } from './middleware/adminAuth';
import auth from './routes/auth';
import contact from './routes/contact';
import contacts from './routes/contacts';
import userAuth from './routes/userAuth';
import jobs from './routes/jobs';
import jobApplications from './routes/jobApplications';
import clientAuthRoutes from './routes/clientAuth';
import adminClients from './routes/adminClients';
import quotes from './routes/quotes';
import mobileJobs from './routes/mobileJobs';
import mobileJobApplications from './routes/mobileJobApplications';
import mobileClient from './routes/mobileClient';
import { emailQueue } from './services/email/queue';
import webhooks from './routes/webhooks';
import unsubscribe from './routes/unsubscribe';
import adminScheduledEmails from './routes/adminScheduledEmails';
import { logger, requestLogger } from './services/logger';
import { initSentry, sentryErrorHandler, flushSentry } from './services/sentry';

// Initialize Sentry early (before Express app)
initSentry();

const app = express();
app.disable('x-powered-by');

// Only trust proxy in production (needed for Fly/HTTPS)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}
// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      imgSrc: ["'self'", "data:", "https:"],
      // No 'unsafe-inline' scripts. Allow JSON-LD blocks via hashes.
      scriptSrc: ["'self'",
	        "https://www.googletagmanager.com",
	        "'sha256-bYytdQbt4/RDWWhFZmVRLpcyvC82eYWvpNUL1GqOmqE='",
	        "'sha256-Bn+PE8Z6MGdFRklio4cKmi1JCSXUfz56nBQZLmeph0U='",
	        "'sha256-nqsLh/2P2ZU7HPCu0Sht5GNB/ztTQLYANu6e5xW4O8U='",
        "'sha256-MNpgalLYls/mwbvq0t4xLhxlPnzbVTrnG1EVJY3HmW4='",
        "'sha256-C58y46wO9ZLZzQa6g9ANd1WgrzmFfOHl08yigZgAhmw='",
        "'sha256-AntLn2RJoFEZbGoR3UNyOQ3MzbhEVnaevh2KT7O/CVI='",
      ],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      connectSrc: ["'self'", "https://www.google-analytics.com", "https://www.googletagmanager.com", "https://stats.g.doubleclick.net"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xContentTypeOptions: true,
  xFrameOptions: { action: 'deny' }
}));

// Performance headers
app.use((_req, res, next) => {
  res.setHeader('X-DNS-Prefetch-Control', 'on');
  res.setHeader('Connection', 'keep-alive');
  next();
});

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

// Gzip compression for all responses
app.use(compression());

// Webhooks must receive the raw body for signature verification
app.use('/api/v1/webhooks', webhooks);

// Body parsing
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Global rate limiter (Redis-backed in production, memory fallback in dev)
const rateLimitOptions: Parameters<typeof rateLimit>[0] = { windowMs: 60_000, max: 120 };
if (env.redisUrl) {
  try {
    const rateLimitRedis = new Redis(env.redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });
    rateLimitRedis.connect().catch(() => {
      console.warn('[RATE-LIMIT] Redis unavailable, falling back to memory store');
    });
    rateLimitOptions.store = new RedisStore({
      sendCommand: (command: string, ...args: string[]) => rateLimitRedis.call(command, ...args) as any
    });
    console.log('[RATE-LIMIT] Using Redis store');
  } catch {
    console.warn('[RATE-LIMIT] Redis init failed, using memory store');
  }
} else {
  console.log('[RATE-LIMIT] No REDIS_URL, using memory store');
}
app.use(rateLimit(rateLimitOptions));

// Structured request logging
app.use(requestLogger());

// Session configuration
if (env.nodeEnv === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET required in production');
}

let SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  if (env.nodeEnv === 'test') {
    // Stable value for deterministic tests.
    SESSION_SECRET = 'test-only-secret';
  } else {
    // Avoid a predictable default in non-production environments that might still be internet-accessible.
    SESSION_SECRET = crypto.randomBytes(32).toString('hex');
    console.warn('[SECURITY] SESSION_SECRET not set; using ephemeral random secret (sessions will reset on restart)');
  }
}

const PgSession = connectPgSimple(session);
const dbUsesSsl = /sslmode=require/i.test(env.dbUrl);

app.use(session({
  name: 'vergo.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: env.nodeEnv === 'test'
    ? new session.MemoryStore()
    : new PgSession({
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
app.use('/api/v1/contacts', contacts);

app.use('/api/v1/jobs', jobs);

// Protect admin.html BEFORE static middleware
app.get(['/admin', '/admin.html', '/admin-clients.html', '/admin-jobs.html', '/admin-job-applications.html'], adminPageAuth, (req, res) => {
  const pub = path.join(process.cwd(), 'public');
  const file = req.path.endsWith('.html') ? req.path.slice(1) : 'admin.html';
  res.sendFile(path.join(pub, file));
});

app.use('/api/v1/user', userAuth);

// Applications API
app.use('/api/v1/applications', applications);
// Legacy join-our-team form endpoint
app.use('/api/applications', applications);

// Job applications (must be before static)
app.use('/api/v1/job-applications', jobApplications);

// Admin clients (must be before static)
app.use('/api/v1/admin/clients', adminClients);

// Quotes
app.use('/api/v1/quotes', quotes);

// Client auth routes
app.use('/api/v1/client', clientAuthRoutes);
app.use('/api/v1/clients', clientAuthRoutes);

// Mobile app endpoints (JWT)
app.use('/api/v1/mobile/jobs', mobileJobs);
app.use('/api/v1/mobile/job-applications', mobileJobApplications);
app.use('/api/v1/client/mobile', mobileClient);

// Unsubscribe management
app.use('/api/v1/unsubscribe', unsubscribe);

// Admin: scheduled emails management
app.use('/api/v1/admin/scheduled-emails', adminScheduledEmails);

// Legacy cleanup (must be before static)

app.get('/hire-us.html', (_req, res) => {
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

// Clean URLs - serve .html files without extension
app.use((req, res, next) => {
  // Skip API routes, files with extensions, and root
  if (req.path.startsWith('/api') || req.path.includes('.') || req.path === '/') {
    return next();
  }

  // Check if .html file exists for this path
  const relPath = req.path.replace(/^\//, '');
  // Defensive: do not allow path traversal in the clean-URL resolver.
  if (relPath.includes('..') || relPath.includes('\\')) {
    return next();
  }
  const htmlPath = path.join(pub, relPath + '.html');
  if (fs.existsSync(htmlPath)) {
    req.url = req.path + '.html';
  }
  next();
});

app.use(express.static(pub, {
  extensions: ['html'],
  maxAge: '7d',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else if (filePath.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|webp|woff|woff2)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    }
  }
}));

// 404 handler (after static)
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Sentry error handler (captures errors before general handler)
app.use(sentryErrorHandler());

// Error handler (must be last)
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = Number(process.env.PORT) || 3000;

// Initialize services and start server
async function startServer() {
  // Initialize email queue (gracefully handles missing Redis)
  await emailQueue.initialize();

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server listening on 0.0.0.0:${PORT}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down gracefully...`);

    server.close(async () => {
      logger.info('HTTP server closed');

      // Shutdown services
      await emailQueue.shutdown();
      await flushSentry();

      logger.info('All services shut down');
      process.exit(0);
    });

    // Force exit after 30 seconds
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (env.nodeEnv !== 'test') {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

export default app;
