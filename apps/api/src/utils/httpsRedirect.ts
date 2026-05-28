import type { NextFunction, Request, Response } from 'express';

type HttpsRedirectOptions = {
  nodeEnv: string;
  webOrigin: string;
  canonicalHost?: string;
  redirectHosts?: string[];
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

function getRequestedHost(req: Pick<Request, 'headers'>) {
  return firstHeaderValue(req.headers['x-forwarded-host']) ?? firstHeaderValue(req.headers.host);
}

function requestIsSecure(req: Pick<Request, 'secure' | 'headers'>) {
  if (req.secure) return true;
  return firstHeaderValue(req.headers['x-forwarded-proto'])?.toLowerCase() === 'https';
}

function resolveRedirectHost(req: Pick<Request, 'headers'>, webOrigin: string, allowedHosts: string[]) {
  const configuredHost = normalizeHost(new URL(webOrigin).host);
  const requestedHost = getRequestedHost(req);
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

function buildRedirectLocation(req: Pick<Request, 'originalUrl'>, host: string) {
  const originalUrl = req.originalUrl || '/';
  const path = originalUrl.startsWith('/') ? originalUrl : `/${originalUrl}`;
  return `https://${normalizeHost(host)}${path}`;
}

function buildHttpsRedirectLocation(
  req: Pick<Request, 'headers' | 'originalUrl'>,
  webOrigin: string,
  allowedHosts: string[] = []
) {
  const host = resolveRedirectHost(req, webOrigin, allowedHosts);
  return buildRedirectLocation(req, host);
}

export function enforceHttpsRedirect(options: HttpsRedirectOptions) {
  const exemptPaths = new Set(options.exemptPaths ?? DEFAULT_EXEMPT_PATHS);
  const allowedHosts = options.allowedHosts ?? [];
  const redirectHosts = new Set((options.redirectHosts ?? []).map((host) => normalizeHost(host)));
  const canonicalHost = options.canonicalHost ? normalizeHost(options.canonicalHost) : null;

  return (req: Request, res: Response, next: NextFunction) => {
    if (options.nodeEnv !== 'production') {
      return next();
    }

    if (exemptPaths.has(req.path)) {
      return next();
    }

    const requestedHost = getRequestedHost(req);
    const normalizedRequestedHost = requestedHost ? normalizeHost(requestedHost) : null;

    if (
      canonicalHost &&
      normalizedRequestedHost &&
      redirectHosts.has(normalizedRequestedHost) &&
      normalizedRequestedHost !== canonicalHost
    ) {
      return res.redirect(308, buildRedirectLocation(req, canonicalHost));
    }

    if (requestIsSecure(req)) {
      return next();
    }

    return res.redirect(308, buildHttpsRedirectLocation(req, options.webOrigin, allowedHosts));
  };
}
