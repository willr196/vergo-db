import crypto from 'node:crypto'
import { doubleCsrf } from 'csrf-csrf'
import { assertStrongSecret } from '../env'

const nodeEnv = process.env.NODE_ENV ?? 'development'

if (nodeEnv === 'production' && !process.env.CSRF_SECRET) {
  throw new Error('CSRF_SECRET required in production')
}

let CSRF_SECRET = process.env.CSRF_SECRET
if (!CSRF_SECRET) {
  // Stable value for deterministic tests; ephemeral elsewhere so we never fall
  // back to a predictable default in an environment that might be reachable.
  CSRF_SECRET = nodeEnv === 'test'
    ? 'test-only-csrf-secret-test-only-csrf-secret'
    : crypto.randomBytes(32).toString('hex')
  if (nodeEnv !== 'test') {
    console.warn('[SECURITY] CSRF_SECRET not set; using an ephemeral random secret (admins will need to reload once after a restart)')
  }
}
if (nodeEnv !== 'test') {
  assertStrongSecret('CSRF_SECRET', CSRF_SECRET)
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
