/** Thin fetch wrapper. Throws ApiError with the server's message on failure. */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string
  ) {
    super(message);
  }
}

// ── On the VERGO website ──────────────────────────────────────────────────
// The pages call the paths the desktop tool had ('/api/jobs/…'); on the
// website those live under /api/v1/scheduling. Writes carry the admin CSRF
// token, fetched once and refreshed if the session has rotated it.

const API_BASE = '/api/v1/scheduling/';
const toServer = (path: string) => (path.startsWith('/api/') ? API_BASE + path.slice('/api/'.length) : path);

let csrfToken: string | null = null;
async function fetchCsrfToken(): Promise<string | null> {
  const res = await fetch('/api/v1/auth/csrf-token', { credentials: 'same-origin' }).catch(() => null);
  const payload = res && res.ok ? await res.json().catch(() => null) : null;
  csrfToken = (payload?.data ?? payload)?.csrfToken ?? null;
  return csrfToken;
}

async function send(method: string, path: string, body: unknown, retried = false): Promise<Response> {
  const headers: Record<string, string> = body ? { 'content-type': 'application/json' } : {};
  if (method !== 'GET') headers['x-csrf-token'] = csrfToken ?? (await fetchCsrfToken()) ?? '';
  const response = await fetch(toServer(path), {
    method,
    credentials: 'same-origin',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 403 && method !== 'GET' && !retried) {
    const payload = await response.clone().json().catch(() => null);
    if (payload?.code === 'CSRF_TOKEN_INVALID') {
      await fetchCsrfToken();
      return send(method, path, body, true);
    }
  }
  return response;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await send(method, path, body);

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(
      response.status,
      (payload as { error?: string }).error ?? `Request failed (${response.status})`,
      (payload as { code?: string }).code
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};

// ── Formatting ────────────────────────────────────────────────────────────

export const gbp = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' });
};

export const shortDate = (iso: string | Date | null | undefined): string => {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

export const weekday = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** The Monday of the week containing `date`, as YYYY-MM-DD. */
export function mondayOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

export const addDays = (isoDate: string, days: number): string => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const todayIso = (): string => new Date().toISOString().slice(0, 10);
