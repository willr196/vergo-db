// ============================================
// VERGO index.ts — PERFORMANCE PATCHES
// ============================================
// Apply these changes to apps/api/src/index.ts
//
// This file shows the EXACT lines to add/change.
// Use Claude Code: "Apply the changes from this patch file to src/index.ts"

// ============================================
// PATCH 1: Add import (near top with other imports)
// ============================================
// ADD this line after: import cors from 'cors';
//
//   import compression from 'compression';


// ============================================
// PATCH 2: Add compression middleware
// ============================================
// ADD this line after: app.use(cors({ ... }));
// AND before: app.use(express.json({ limit: '5mb' }));
//
//   // Gzip compression for all responses
//   app.use(compression());


// ============================================
// PATCH 3: Replace static file serving
// ============================================
// FIND this line:
//
//   app.use(express.static(pub, { extensions: ['html'] }));
//
// REPLACE with:
//
//   // Static files with performance cache headers
//   app.use(express.static(pub, {
//     extensions: ['html'],
//     maxAge: '7d',
//     setHeaders: (res, filePath) => {
//       if (filePath.endsWith('.html')) {
//         res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
//         res.setHeader('Pragma', 'no-cache');
//         res.setHeader('Expires', '0');
//       } else if (filePath.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|webp|woff|woff2)$/)) {
//         res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
//       }
//     }
//   }));


// ============================================
// PATCH 4: Add performance response headers (optional but recommended)
// ============================================
// ADD after the helmet() line:
//
//   // Performance headers
//   app.use((req, res, next) => {
//     res.setHeader('X-DNS-Prefetch-Control', 'on');
//     next();
//   });


// ============================================
// FULL RESULT: Top section of index.ts should look like:
// ============================================

/*
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';                    // <-- NEW
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { env } from './env';
// ... other imports ...

const app = express();
app.disable('x-powered-by');

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(helmet({ contentSecurityPolicy: false }));

app.use(cors({
  origin: [
    env.webOrigin,
    `http://localhost:${env.port}`,
    'http://localhost:8080',
    'https://vergo-app.fly.dev'
  ],
  credentials: true
}));

// Gzip compression for all responses                      // <-- NEW
app.use(compression());                                    // <-- NEW

app.use(express.json({ limit: '5mb' }));
app.use(rateLimit({ windowMs: 60_000, max: 120 }));

// ... session config ...

// ... routes ...

// Static files with performance cache headers             // <-- UPDATED
const pub = path.join(process.cwd(), 'public');
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
*/
