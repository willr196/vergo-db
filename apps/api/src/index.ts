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
import { prisma } from './prisma';
import applications from './routes/applications';
import events from './routes/events';
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
import { ZodError } from 'zod';

// Initialize Sentry early (before Express app)
initSentry();

const app = express();
app.disable('x-powered-by');

const publicDir = path.join(process.cwd(), 'public');
const publicDirResolved = path.resolve(publicDir);

function resolvePublicFile(relPath: string) {
  // Prevent directory traversal and absolute-path resolution.
  if (!relPath || relPath.startsWith('/') || relPath.includes('\\') || relPath.includes('\0')) return null;
  const resolved = path.resolve(publicDirResolved, relPath);
  if (!resolved.startsWith(publicDirResolved + path.sep)) return null;
  return resolved;
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatYyyyMmDd(d: Date) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function buildJobPageCspHeader(nonce: string) {
  // Job pages include dynamic JSON-LD. Use a nonce-based CSP for these routes only.
  const nonceToken = `'nonce-${nonce}'`;
  const parts = [
    `default-src 'self'`,
    `base-uri 'self'`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `img-src 'self' data: https:`,
    `script-src 'self' https://www.googletagmanager.com ${nonceToken}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src 'self' https://fonts.gstatic.com data:`,
    `connect-src 'self' https://www.google-analytics.com https://www.googletagmanager.com https://stats.g.doubleclick.net`,
  ];
  return parts.join('; ');
}

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
        "'sha256-Dl1ItkNbAtPXYv9tV9GRLoD8pUfZw5BEJAeB5zZECQ0='",
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

// ============================================
// SEO: Dynamic sitemap for job listings
// ============================================
let cachedJobsSitemap: { xml: string; generatedAtMs: number } | null = null;
const JOBS_SITEMAP_TTL_MS = 5 * 60_000;

app.get('/sitemap-jobs.xml', async (_req, res, next) => {
  try {
    const now = Date.now();
    if (cachedJobsSitemap && (now - cachedJobsSitemap.generatedAtMs) < JOBS_SITEMAP_TTL_MS) {
      res.type('application/xml');
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.send(cachedJobsSitemap.xml);
    }

    const jobs = await prisma.job.findMany({
      where: { status: 'OPEN' },
      orderBy: [
        { updatedAt: 'desc' },
        { createdAt: 'desc' }
      ],
      select: { id: true, updatedAt: true }
    });

    const urls = jobs.map((j) => {
      const lastmod = formatYyyyMmDd(j.updatedAt);
      const loc = `https://vergoltd.com/jobs/${encodeURIComponent(j.id)}`;
      return [
        '  <url>',
        `    <loc>${loc}</loc>`,
        `    <lastmod>${lastmod}</lastmod>`,
        '    <changefreq>daily</changefreq>',
        '    <priority>0.8</priority>',
        '  </url>',
      ].join('\n');
    }).join('\n');

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      urls,
      '</urlset>',
      '',
    ].join('\n');

    cachedJobsSitemap = { xml, generatedAtMs: now };
    res.type('application/xml');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.send(xml);
  } catch (err) {
    return next(err);
  }
});

// ============================================
// SEO: Server-rendered job board (crawlable)
// ============================================
let cachedJobsIndex: { html: string; generatedAtMs: number } | null = null;
const JOBS_INDEX_TTL_MS = 60_000;

app.get('/jobs', async (_req, res, next) => {
  try {
    const now = Date.now();
    if (cachedJobsIndex && (now - cachedJobsIndex.generatedAtMs) < JOBS_INDEX_TTL_MS) {
      res.type('text/html');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return res.send(cachedJobsIndex.html);
    }

    const jobs = await prisma.job.findMany({
      where: { status: 'OPEN' },
      orderBy: [
        { eventDate: 'asc' },
        { createdAt: 'desc' }
      ],
      take: 20,
      include: {
        role: { select: { name: true } }
      }
    });

    const cards = jobs.map((job) => {
      const date = job.eventDate
        ? job.eventDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
        : 'Flexible';

      const time = (job.shiftStart && job.shiftEnd) ? `${job.shiftStart} - ${job.shiftEnd}` : 'TBC';

      const pay = job.payRate
        ? `£${Number(job.payRate)}/${job.payType === 'HOURLY' ? 'hr' : job.payType === 'DAILY' ? 'day' : 'fixed'}`
        : 'Competitive';

      const spotsLeft = Math.max(0, job.staffNeeded - job.staffConfirmed);
      const spotsClass = spotsLeft <= 2 ? 'urgent' : '';

      const typeClass = job.type === 'INTERNAL' ? 'internal' : 'external';
      const typeLabel = job.type === 'INTERNAL' ? 'VERGO' : (job.companyName || 'External');

      return `
        <div class="job-card">
          <div class="job-header">
            <div>
              <h3 class="job-title">${escapeHtml(job.title)}</h3>
              <span class="job-role">${escapeHtml(job.role.name)}</span>
            </div>
            <span class="job-type ${typeClass}">${escapeHtml(typeLabel)}</span>
          </div>

          <div class="job-meta">
            <span>📍 ${escapeHtml(job.location)}</span>
            <span>📅 ${escapeHtml(date)}</span>
            <span>⏰ ${escapeHtml(time)}</span>
          </div>

          <p class="job-description">${escapeHtml(job.description)}</p>

          <div class="job-footer">
            <div>
              <span class="job-pay">${escapeHtml(pay)}</span>
              <span class="spots-left ${spotsClass}"> · ${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} left</span>
            </div>
            <a href="/jobs/${encodeURIComponent(job.id)}" class="btn btn-primary btn-small">View & Apply</a>
          </div>
        </div>
      `;
    }).join('');

    const body = jobs.length > 0
      ? `<div class="jobs-grid">${cards}</div>`
      : `
        <div class="empty-state">
          <h3>No jobs available</h3>
          <p>Check back soon for new opportunities.</p>
        </div>
      `;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" type="image/png" href="/logo-small.png">

  <title>Jobs | VERGO Ltd</title>
  <meta name="description" content="Browse event staffing opportunities in London & surrounding areas. Apply to join the VERGO Ltd team.">
  <link rel="canonical" href="https://vergoltd.com/jobs">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="/vergo-styles.css">
  <link rel="stylesheet" href="/vergo-header.css">
  <link rel="stylesheet" href="/vergo-a11y.css">
  <link rel="stylesheet" href="/vergo-mobile.css">
  <link rel="stylesheet" href="/pages/css/jobs.css">
  <link rel="stylesheet" href="/vergo-platform.css">
</head>
<body class="platform">
  <a href="#main-content" class="skip-link">Skip to main content</a>
  <header></header>

  <main id="main-content">
    <div class="page-header">
      <h1>Available Jobs</h1>
      <p>Find your next opportunity in London's events industry</p>
    </div>

    <div id="user-bar" class="user-bar logged-out">
      <div class="user-actions">
        <a href="user-login" class="btn btn-secondary btn-small">Log In</a>
        <a href="user-register" class="btn btn-primary btn-small">Create Account</a>
      </div>
    </div>

    <div class="filters" aria-label="Job filters">
      <div class="filter-group">
        <label>Role</label>
        <select id="filter-role">
          <option value="">All Roles</option>
        </select>
      </div>
      <div class="filter-group">
        <label>Type</label>
        <select id="filter-type">
          <option value="">All Types</option>
          <option value="INTERNAL">VERGO Jobs</option>
          <option value="EXTERNAL">External Jobs</option>
        </select>
      </div>
    </div>

    <noscript>
      <div class="empty-state">
        <p>Filters and pagination require JavaScript. Open a job to view details and apply.</p>
      </div>
    </noscript>

    <div id="jobs-container" data-ssr="1">
      ${body}
    </div>

    <div id="pagination" class="pagination d-none"></div>
  </main>

  <footer role="contentinfo"></footer>

  <script src="/pages/js/jobs.js"></script>
  <script src="/vergo-utils.js"></script>
  <script src="/vergo-nav.js"></script>
  <script src="/vergo-footer.js"></script>
  <script src="/vergo-analytics.js"></script>
</body>
</html>`;

    cachedJobsIndex = { html, generatedAtMs: now };
    res.type('text/html');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.send(html);
  } catch (err) {
    return next(err);
  }
});

// ============================================
// SEO: Server-rendered job pages (crawlable)
// ============================================
app.get('/jobs/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(404).send('Not found');

    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        role: { select: { name: true } }
      }
    });

    if (!job || job.status !== 'OPEN') {
      return res.status(404).send('Not found');
    }

    const title = `${job.title} | VERGO Ltd`;
    const descriptionText = job.description?.slice(0, 160) || 'View job details and apply.';
    const canonicalUrl = `https://vergoltd.com/jobs/${encodeURIComponent(job.id)}`;

    const company = (job.type === 'EXTERNAL' && job.companyName) ? job.companyName : 'VERGO Ltd';
    const pay = job.payRate
      ? `£${Number(job.payRate)}/${job.payType === 'HOURLY' ? 'hr' : job.payType === 'DAILY' ? 'day' : 'fixed'}`
      : 'Competitive';

    const date = job.eventDate ? job.eventDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Flexible';
    const time = (job.shiftStart && job.shiftEnd) ? `${job.shiftStart} - ${job.shiftEnd}` : 'To be confirmed';

    const typeClass = job.type === 'INTERNAL' ? 'internal' : 'external';
    const typeLabel = job.type === 'INTERNAL' ? 'VERGO Job' : 'External';

    const jobPostingJsonLd: any = {
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      title: job.title,
      description: job.description,
      datePosted: job.publishedAt ? job.publishedAt.toISOString() : job.createdAt.toISOString(),
      validThrough: job.closingDate ? job.closingDate.toISOString() : undefined,
      hiringOrganization: {
        '@type': 'Organization',
        name: company,
        sameAs: job.type === 'EXTERNAL' && job.externalUrl ? job.externalUrl : 'https://vergoltd.com',
      },
      jobLocation: {
        '@type': 'Place',
        address: {
          '@type': 'PostalAddress',
          addressLocality: job.location,
          addressCountry: 'GB',
        }
      },
    };

    if (job.payRate) {
      jobPostingJsonLd.baseSalary = {
        '@type': 'MonetaryAmount',
        currency: 'GBP',
        value: {
          '@type': 'QuantitativeValue',
          value: Number(job.payRate),
          unitText: job.payType === 'HOURLY' ? 'HOUR' : job.payType === 'DAILY' ? 'DAY' : 'JOB',
        }
      };
    }

    // Remove undefined keys so the JSON-LD is clean.
    Object.keys(jobPostingJsonLd).forEach((k) => jobPostingJsonLd[k] === undefined && delete jobPostingJsonLd[k]);
    const jsonLd = JSON.stringify(jobPostingJsonLd, null, 2).replace(/</g, '\\u003c');

    // Route-level CSP override to allow job-specific JSON-LD via nonce.
    const nonce = crypto.randomBytes(16).toString('base64');
    res.setHeader('Content-Security-Policy', buildJobPageCspHeader(nonce));

    const applyCta = (job.type === 'EXTERNAL' && job.externalUrl && /^https?:\/\//i.test(job.externalUrl))
      ? `<a href="${escapeHtml(job.externalUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-block">Apply on External Site →</a>`
      : `<a href="/job-detail?id=${encodeURIComponent(job.id)}" class="btn btn-primary btn-block">View & Apply →</a>`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" type="image/png" href="/logo-small.png">

  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(descriptionText)}">
  <link rel="canonical" href="${canonicalUrl}">

  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:title" content="${escapeHtml(job.title)}">
  <meta property="og:description" content="${escapeHtml(descriptionText)}">
  <meta property="og:image" content="https://vergoltd.com/logo.png">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="/vergo-styles.css">
  <link rel="stylesheet" href="/vergo-a11y.css">
  <link rel="stylesheet" href="/vergo-mobile.css">
  <link rel="stylesheet" href="/pages/css/job-detail.css">
  <link rel="stylesheet" href="/vergo-platform.css">

  <script type="application/ld+json" nonce="${nonce}">${jsonLd}</script>
</head>
<body class="platform">
  <a href="#main-content" class="skip-link">Skip to main content</a>
  <header></header>

  <main id="main-content">
    <a href="/jobs" class="back-link">← Back to Jobs</a>

    <div class="job-container">
      <div class="job-header">
        <div class="job-badges">
          <span class="badge badge-role">${escapeHtml(job.role.name)}</span>
          <span class="badge badge-${typeClass}">${typeLabel}</span>
        </div>
        <h1 class="job-title">${escapeHtml(job.title)}</h1>
        <p class="job-company">${escapeHtml(company)}</p>
      </div>

      <div class="job-meta-grid">
        <div class="meta-item">
          <span class="meta-label">Location</span>
          <span class="meta-value">📍 ${escapeHtml(job.location)}${job.venue ? ' - ' + escapeHtml(job.venue) : ''}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Date</span>
          <span class="meta-value">📅 ${escapeHtml(date)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Time</span>
          <span class="meta-value">⏰ ${escapeHtml(time)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Pay</span>
          <span class="meta-value highlight">${escapeHtml(pay)}</span>
        </div>
      </div>

      <div class="job-body">
        <div class="section">
          <h3>Description</h3>
          <p>${escapeHtml(job.description).replace(/\\n/g, '<br>')}</p>
        </div>
        ${job.requirements ? `
        <div class="section">
          <h3>Requirements</h3>
          <p>${escapeHtml(job.requirements).replace(/\\n/g, '<br>')}</p>
        </div>` : ''}
      </div>

      <div class="apply-section">
        <div class="apply-box">
          <h3>Apply for this position</h3>
          ${applyCta}
        </div>
      </div>
    </div>
  </main>

  <footer role="contentinfo"></footer>
  <script src="/vergo-nav.js"></script>
  <script src="/vergo-footer.js"></script>
  <script src="/vergo-analytics.js"></script>
</body>
</html>`;

    res.type('text/html');
    return res.send(html);
  } catch (err) {
    return next(err);
  }
});

// Auth endpoints
app.use('/api/v1/auth', auth);

// Contact form endpoints
app.use('/api/v1/contact', contact);
app.use('/api/v1/contacts', contacts);

app.use('/api/v1/jobs', jobs);

// Protect admin.html BEFORE static middleware
app.get([
  '/admin',
  '/admin-clients',
  '/admin-jobs',
  '/admin-job-applications',
], adminPageAuth, (req, res) => {
  const fileByPath: Record<string, string> = {
    '/admin': 'admin.html',
    '/admin-clients': 'admin-clients.html',
    '/admin-jobs': 'admin-jobs.html',
    '/admin-job-applications': 'admin-job-applications.html',
  };
  const file = fileByPath[req.path] ?? 'admin.html';
  res.sendFile(path.join(publicDir, file));
});

app.use('/api/v1/user', userAuth);

// Applications API
app.use('/api/v1/applications', applications);
// Legacy join-our-team form endpoint
app.use('/api/applications', applications);

// Admin "Events" tab API
app.use('/api/v1/events', events);

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

app.get(['/hire-us', '/hire-us.html'], (_req, res) => {
  res.redirect(301, '/hire-staff');
});

app.use((req, res, next) => {
  if (req.path.endsWith('.bak')) {
    return res.status(404).send('Not found');
  }
  return next();
});

// Canonicalise SEO pages: redirect .html -> clean URLs (keep querystring).
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (!req.path.endsWith('.html')) return next();

  // Only redirect known static HTML pages from the public directory.
  const relPath = req.path.replace(/^\//, '');
  const filePath = resolvePublicFile(relPath);
  if (!filePath || !fs.existsSync(filePath)) return next();

  const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  if (req.path === '/index.html') {
    return res.redirect(301, '/' + qs);
  }

  const clean = req.path.replace(/\.html$/, '');
  return res.redirect(301, clean + qs);
});

// Canonical homepage
app.get('/index', (_req, res) => res.redirect(301, '/'));
app.get('/', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Static frontend (last)
// Clean URLs - serve .html files without extension
app.use((req, res, next) => {
  // Skip API routes and root
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api') || req.path === '/') {
    return next();
  }

  // Check if .html file exists for this path
  const relPath = req.path.replace(/^\//, '');
  if (!relPath || relPath.endsWith('/')) return next();

  const htmlRelPath = relPath + '.html';
  const htmlPath = resolvePublicFile(htmlRelPath);
  if (!htmlPath) return next();

  if (fs.existsSync(htmlPath)) {
    const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    req.url = req.path + '.html' + qs;
  }
  next();
});

app.use(express.static(publicDir, {
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
  if (err instanceof ZodError) {
    logger.warn({ err }, 'Request validation failed');
    return res.status(400).json({
      error: 'Invalid request',
      details: err.issues,
    });
  }
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
