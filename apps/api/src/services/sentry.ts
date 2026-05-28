// Sentry error tracking integration

import * as Sentry from '@sentry/node';
import { env } from '../env';

let initialized = false;

/**
 * Initialize Sentry error tracking
 * Call this early in the application startup
 */
export function initSentry(): void {
  if (!env.sentryDsn) {
    console.log('[SENTRY] No DSN configured, error tracking disabled');
    return;
  }

  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.nodeEnv,
    tracesSampleRate: env.nodeEnv === 'production' ? 0.1 : 1.0,
    beforeSend(event) {
      // Scrub sensitive data from error reports
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
      return event;
    },
  });

  initialized = true;
  console.log('[SENTRY] Error tracking initialized');
}

/**
 * Express error handler middleware for Sentry
 * Add this BEFORE your general error handler
 */
export function sentryErrorHandler() {
  if (!initialized) {
    return (_err: any, _req: any, _res: any, next: any) => next(_err);
  }
  return Sentry.expressErrorHandler();
}

/**
 * Flush pending Sentry events (for graceful shutdown)
 */
export async function flushSentry(timeout = 2000): Promise<void> {
  if (!initialized) return;
  await Sentry.flush(timeout);
}
