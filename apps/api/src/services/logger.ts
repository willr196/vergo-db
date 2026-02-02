// Structured logging with Pino

import pino from 'pino';
import { env } from '../env';

// Sensitive fields to redact from logs
const REDACT_PATHS = [
  'password',
  'passwordHash',
  'token',
  'resetToken',
  'verifyToken',
  'secret',
  'authorization',
  'cookie',
  'req.headers.authorization',
  'req.headers.cookie',
];

// Create the base logger
export const logger = pino({
  level: env.logLevel,
  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED]',
  },
  ...(env.nodeEnv !== 'production' ? {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    },
  } : {}),
});

// Child loggers for specific services
export const emailLogger = logger.child({ service: 'email' });
export const queueLogger = logger.child({ service: 'email-queue' });
export const webhookLogger = logger.child({ service: 'webhook' });
export const authLogger = logger.child({ service: 'auth' });
export const schedulerLogger = logger.child({ service: 'scheduler' });

/**
 * Partially mask an email address for logging
 * "user@example.com" -> "u***@example.com"
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  if (local.length <= 1) return `${local}***@${domain}`;
  return `${local[0]}***@${domain}`;
}

/**
 * Create a request logger middleware for Express
 */
export function requestLogger() {
  return (req: any, res: any, next: any) => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      const logData = {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      };

      if (res.statusCode >= 500) {
        logger.error(logData, 'Request error');
      } else if (res.statusCode >= 400) {
        logger.warn(logData, 'Request warning');
      } else if (req.url !== '/health') {
        // Skip logging health checks to reduce noise
        logger.info(logData, 'Request completed');
      }
    });

    next();
  };
}
