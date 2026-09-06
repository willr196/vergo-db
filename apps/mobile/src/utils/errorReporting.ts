/**
 * Crash and error reporting.
 *
 * Mirrors apps/api/src/services/sentry.ts: no DSN means reporting is off, and
 * the app still runs normally. That keeps local development and Expo Go quiet
 * and means a missing environment variable can never break a build.
 *
 * The DSN comes from EXPO_PUBLIC_SENTRY_DSN. A Sentry DSN is a public
 * write-only key and is meant to ship in the client bundle.
 */

import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

// APP_ENV is set per EAS build profile in eas.json.
const ENVIRONMENT = process.env.APP_ENV || (__DEV__ ? 'development' : 'production');

let initialized = false;

/** Header names and body keys that must never leave the device. */
const SENSITIVE_KEYS = [
  'authorization',
  'cookie',
  'password',
  'currentpassword',
  'newpassword',
  'token',
  'accesstoken',
  'refreshtoken',
];

function scrub(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    out[key] = SENSITIVE_KEYS.includes(key.toLowerCase()) ? '[redacted]' : scrub(source[key]);
  }
  return out;
}

export function initErrorReporting(): void {
  if (initialized) return;
  if (!DSN) {
    console.log('[SENTRY] No DSN configured, error tracking disabled');
    return;
  }

  Sentry.init({
    dsn: DSN,
    environment: ENVIRONMENT,
    release: Constants.expoConfig?.version,
    tracesSampleRate: ENVIRONMENT === 'production' ? 0.1 : 1.0,
    // Workers are on venue wifi and phone data, often badly. Without this a
    // crash on a dead connection is simply lost.
    enableAutoSessionTracking: true,
    beforeSend(event) {
      if (event.request?.headers) event.request.headers = scrub(event.request.headers) as Record<string, string>;
      if (event.request?.data) event.request.data = scrub(event.request.data);
      if (event.extra) event.extra = scrub(event.extra) as Record<string, unknown>;
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.data) breadcrumb.data = scrub(breadcrumb.data) as Record<string, unknown>;
      return breadcrumb;
    },
  });

  initialized = true;
  console.log('[SENTRY] Error tracking initialized');
}

/**
 * Ties reports to a user so a support call can be traced to a session.
 * Only the id and account type are sent, never name, email or phone.
 */
export function setErrorReportingUser(userId: string | null, userType?: string | null): void {
  if (!initialized) return;
  Sentry.setUser(userId ? { id: userId, segment: userType ?? undefined } : null);
}

/**
 * Reports a handled error. Use for failures the app recovered from but that
 * the team still needs to see, such as a check-out that would not save.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (!initialized) {
    if (__DEV__) console.error('[SENTRY:dev]', error, context);
    return;
  }
  Sentry.captureException(error, context ? { extra: scrub(context) as Record<string, unknown> } : undefined);
}

/** Leaves a trail of what the user did before a crash. */
export function addBreadcrumb(message: string, data?: Record<string, unknown>): void {
  if (!initialized) return;
  Sentry.addBreadcrumb({ message, level: 'info', data: scrub(data) as Record<string, unknown> });
}

export { Sentry };
