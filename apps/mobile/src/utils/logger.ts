/**
 * Logger Utility
 * Centralized logging that can be disabled in production
 */

const isDevelopment = __DEV__;
type LogArgs = readonly unknown[];

export const logger = {
  log: (...args: LogArgs) => {
    if (isDevelopment) {
      console.warn('[log]', ...args);
    }
  },

  warn: (...args: LogArgs) => {
    if (isDevelopment) {
      console.warn(...args);
    }
  },

  error: (...args: LogArgs) => {
    if (isDevelopment) {
      console.error(...args);
    }
    // In production, you would send this to error tracking service (Sentry)
  },

  info: (...args: LogArgs) => {
    if (isDevelopment) {
      console.warn('[info]', ...args);
    }
  },
};

export default logger;
