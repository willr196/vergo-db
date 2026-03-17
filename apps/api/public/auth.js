/**
 * VERGO Auth Utility
 * JWT-based authentication for worker and client dashboards.
 *
 * Usage:
 *   <script src="/auth.js"></script>
 *   const user = VERGOAuth.requireAuth('worker'); // or 'client' or null for any
 *   const user = VERGOAuth.getUser();
 *   const res  = await VERGOAuth.authFetch('/api/v1/...', { method: 'POST', body: ... });
 *   VERGOAuth.logout();
 */

(function () {
  'use strict';

  const TOKEN_KEY = 'vergo_jwt';
  const REFRESH_KEY = 'vergo_refresh';
  const USER_KEY = 'vergo_user';
  const LOGIN_PAGE = '/portal-login.html';

  // --- Token helpers ---

  function decodePayload(token) {
    try {
      const part = token.split('.')[1];
      if (!part) return null;
      // Base64url → base64 → JSON
      const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(b64));
    } catch {
      return null;
    }
  }

  function isTokenExpired(payload) {
    if (!payload || !payload.exp) return true;
    return Date.now() / 1000 > payload.exp;
  }

  // --- Public API ---

  /**
   * Returns { userId, userType, name, email } from stored JWT, or null if invalid.
   * userType is 'worker' or 'client'.
   */
  function getUser() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;

    const payload = decodePayload(token);
    if (!payload || payload.tokenType !== 'access') return null;
    if (isTokenExpired(payload)) return null;

    const userType = payload.type === 'user' ? 'worker' : 'client';

    // Read name from stored user object (richer than JWT)
    let name = '';
    let companyName = null;
    try {
      const stored = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
      if (stored) {
        name = stored.name || '';
        companyName = stored.companyName || null;
      }
    } catch {
      // ignore
    }

    return {
      userId: payload.sub,
      userType,
      name,
      email: payload.email || '',
      companyName,
    };
  }

  /**
   * Redirects to /portal-login.html if no valid token.
   * If expectedType is set ('worker' or 'client'), also redirects to correct dashboard
   * if the token belongs to the wrong user type.
   * Returns the user object if auth passes, null otherwise (redirect already fired).
   */
  function requireAuth(expectedType) {
    const user = getUser();

    if (!user) {
      // Distinguish: token exists but invalid/expired vs. never logged in
      const hasToken = !!localStorage.getItem(TOKEN_KEY);
      const dest = LOGIN_PAGE + (hasToken ? '?expired=1' : '?error=missing_token');
      window.location.replace(dest);
      return null;
    }

    if (expectedType && user.userType !== expectedType) {
      const dest = user.userType === 'worker' ? '/dashboard-worker.html' : '/dashboard-client.html';
      window.location.replace(dest);
      return null;
    }

    return user;
  }

  /**
   * Attempts to refresh the access token using the stored refresh token.
   * Returns true on success, false on failure.
   */
  async function tryRefresh() {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (!refreshToken) return false;

    try {
      const res = await fetch('/api/v1/web/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) return false;

      const data = await res.json();
      if (!data.ok || !data.token) return false;

      localStorage.setItem(TOKEN_KEY, data.token);
      if (data.refreshToken) localStorage.setItem(REFRESH_KEY, data.refreshToken);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Authenticated fetch. Attaches Bearer token.
   * Automatically attempts one refresh on 401 before giving up.
   */
  async function authFetch(url, options) {
    options = options || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const res = await fetch(url, Object.assign({}, options, { headers }));

    if (res.status === 401) {
      const refreshed = await tryRefresh();
      if (!refreshed) {
        // Clear tokens and fire-and-forget revocation (single redirect)
        const rt = localStorage.getItem(REFRESH_KEY);
        if (rt) {
          fetch('/api/v1/web/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: rt }),
          }).catch(() => {});
        }
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_KEY);
        localStorage.removeItem(USER_KEY);
        window.location.replace(LOGIN_PAGE + '?expired=1');
        return null;
      }
      // Retry with new token
      const newToken = localStorage.getItem(TOKEN_KEY);
      if (newToken) headers['Authorization'] = 'Bearer ' + newToken;
      return fetch(url, Object.assign({}, options, { headers }));
    }

    return res;
  }

  /**
   * Clears all auth tokens and redirects to /portal-login.html.
   */
  function logout() {
    const refreshToken = localStorage.getItem(REFRESH_KEY);

    // Fire-and-forget revocation
    if (refreshToken) {
      fetch('/api/v1/web/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      }).catch(() => {});
    }

    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    window.location.replace('/portal-login.html');
  }

  // Expose globally
  window.VERGOAuth = {
    getUser,
    requireAuth,
    authFetch,
    logout,
    tryRefresh,
  };
})();
