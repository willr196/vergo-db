import crypto from 'node:crypto'
import { doubleCsrf } from 'csrf-csrf'
import { assertStrongSecret } from '../env'

const nodeEnv = process.env.NODE_ENV ?? 'development'

/**
 * This module deliberately does not throw on a bad CSRF_SECRET.
 *
 * adminAuth imports it, and the server imports adminAuth at boot, so a throw here
 * took the entire public site down over an admin-only secret (2026-09-15). Instead
 * we record the problem, let the process start, and fail every admin state change
 * closed — the public site keeps serving, and the admin panel stays shut until the
 * secret is fixed.
 */
let misconfigured: string | null = null

// Trimmed, because an empty or whitespace-only secret is the failure we actually hit:
// it is "set" as far as Fly is concerned but useless here.
let CSRF_SECRET = process.env.CSRF_SECRET?.trim()

if (!CSRF_SECRET) {
  if (nodeEnv === 'production') {
    misconfigured = 'CSRF_SECRET is missing or empty'
  }
  // Stable value for deterministic tests; ephemeral elsewhere so we never fall
  // back to a predictable default in an environment that might be reachable.
  CSRF_SECRET = nodeEnv === 'test'
    ? 'test-only-csrf-secret-test-only-csrf-secret'
    : crypto.randomBytes(32).toString('hex')
  if (nodeEnv !== 'test' && !misconfigured) {
    console.warn('[SECURITY] CSRF_SECRET not set; using an ephemeral random secret (admins will need to reload once after a restart)')
  }
} else if (nodeEnv !== 'test') {
  try {
    assertStrongSecret('CSRF_SECRET', CSRF_SECRET)
  } catch (err) {
    misconfigured = err instanceof Error ? err.message : String(err)
    // Keep the library working on a throwaway secret rather than leaving it
    // holding a value we have already judged unfit.
    CSRF_SECRET = crypto.randomBytes(32).toString('hex')
  }
}

if (misconfigured) {
  console.error(
    `[SECURITY] ${misconfigured}. The admin panel is disabled until this is set to a ` +
    'random value of at least 32 bytes; the public site is unaffected.'
  )
}

/** Non-null when the admin panel is shut off for a CSRF configuration problem. */
export function csrfConfigError() {
  return misconfigured
}

const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => CSRF_SECRET as string,
  // Ties each token to the admin's session, so a stolen token is useless without the session cookie too.
  getSessionIdentifier: (req) => req.session.id,
  cookieName: 'vergo.csrf',
  cookieOptions: {
    httpOnly: true,
    secure: nodeEnv === 'production',
    sameSite: 'strict',
    path: '/',
  },
})

export { generateCsrfToken }

/**
 * Defense-in-depth on top of sameSite=strict: validates the x-csrf-token header
 * against the vergo.csrf cookie for state-changing methods. GET/HEAD/OPTIONS are
 * always allowed through untouched.
 */
export function csrfProtection(req: Parameters<typeof doubleCsrfProtection>[0], res: Parameters<typeof doubleCsrfProtection>[1], next: Parameters<typeof doubleCsrfProtection>[2]) {
  if (misconfigured) {
    return res.status(503).json({
      error: 'The admin panel is unavailable because of a server configuration problem. Please contact the administrator.',
      code: 'CSRF_MISCONFIGURED',
    })
  }
  const fail = () => res.status(403).json({
    error: 'Your session needs refreshing before you can do that — reload the page and try again.',
    code: 'CSRF_TOKEN_INVALID',
  })
  try {
    // Malformed cookies/session state (missing req.cookies, no session id) can make the
    // library's own validation throw synchronously rather than call back with an error —
    // always fail closed instead of letting that escape as an unhandled exception.
    doubleCsrfProtection(req, res, (err?: unknown) => (err ? fail() : next()))
  } catch {
    fail()
  }
}
