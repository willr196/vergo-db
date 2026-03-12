import type { NextFunction, Request, Response } from 'express';

type HttpsRedirectOptions = {
  nodeEnv: string;
  webOrigin: string;
  allowedHosts?: string[];
  exemptPaths?: string[];
};

const DEFAULT_EXEMPT_PATHS = ['/health', '/readyz'];

function firstHeaderValue(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return rawValue?.split(',')[0]?.trim() || null;
}

function normalizeHost(host: string) {
  return host.trim().toLowerCase().replace(/\.$/, '').replace(/:(80|443)$/i, '');
}

function requestIsSecure(req: Pick<Request, 'secure' | 'headers'>) {
  if (req.secure) return true;
  return firstHeaderValue(req.headers['x-forwarded-proto'])?.toLowerCase() === 'https';
}

function resolveRedirectHost(req: Pick<Request, 'headers'>, webOrigin: string, allowedHosts: string[]) {
  const configuredHost = normalizeHost(new URL(webOrigin).host);
  const requestedHost = firstHeaderValue(req.headers['x-forwarded-host']) ?? firstHeaderValue(req.headers.host);
  if (!requestedHost) {
    return configuredHost;
  }

  const normalizedRequestedHost = normalizeHost(requestedHost);
  const normalizedAllowedHosts = new Set([
    configuredHost,
    ...allowedHosts.map((host) => normalizeHost(host)),
  ]);

  if (normalizedAllowedHosts.has(normalizedRequestedHost)) {
    return normalizedRequestedHost;
  }

  return configuredHost;
}

export function buildHttpsRedirectLocation(
  req: Pick<Request, 'headers' | 'originalUrl'>,
  webOrigin: string,
  allowedHosts: string[] = []
) {
  const host = resolveRedirectHost(req, webOrigin, allowedHosts);
  const originalUrl = req.originalUrl || '/';
  const path = originalUrl.startsWith('/') ? originalUrl : `/${originalUrl}`;
  return `https://${host}${path}`;
}

export function enforceHttpsRedirect(options: HttpsRedirectOptions) {
  const exemptPaths = new Set(options.exemptPaths ?? DEFAULT_EXEMPT_PATHS);
  const allowedHosts = options.allowedHosts ?? [];

  return (req: Request, res: Response, next: NextFunction) => {
    if (options.nodeEnv !== 'production') {
      return next();
    }

    if (exemptPaths.has(req.path) || requestIsSecure(req)) {
      return next();
    }

    return res.redirect(308, buildHttpsRedirectLocation(req, options.webOrigin, allowedHosts));
  };
}
