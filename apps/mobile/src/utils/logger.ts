/**
 * Logger Utility
 * Centralized logging that can be disabled in production
 */

const isDevelopment = __DEV__;

export const logger = {
  log: (...args: any[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },

  warn: (...args: any[]) => {
    if (isDevelopment) {
      console.warn(...args);
    }
  },

  error: (...args: any[]) => {
    if (isDevelopment) {
      console.error(...args);
    }
    // In production, you would send this to error tracking service (Sentry)
  },

  info: (...args: any[]) => {
    if (isDevelopment) {
      console.info(...args);
    }
  },
};

export default logger;
