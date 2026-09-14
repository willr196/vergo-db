import { generateCsrfToken } from '../../middleware/csrf'

/**
 * Shared by the admin test suites so the double-submit handshake is described once.
 *
 * Require this lazily (after the suite's setRequiredEnv() call) — middleware/csrf.ts
 * reads NODE_ENV at module load to pick its deterministic test secret.
 */
export const ADMIN_TEST_SESSION_ID = 'admin-test-session'

/**
 * Mirrors the real handshake: the server hands the client a token tied to the session
 * id and sets the matching cookie; the client echoes the token back as a header.
 */
export function issueCsrfToken(sessionId: string = ADMIN_TEST_SESSION_ID) {
  let cookieValue = ''
  const fakeReq: any = { session: { id: sessionId }, cookies: {} }
  const fakeRes: any = { cookie: (_name: string, value: string) => { cookieValue = value } }
  const csrfToken = generateCsrfToken(fakeReq, fakeRes)
  return { csrfToken, cookieHeader: `vergo.csrf=${cookieValue}` }
}

/** The headers an authenticated admin write needs: the token plus its paired cookie. */
export function csrfHeaders(sessionId: string = ADMIN_TEST_SESSION_ID) {
  const { csrfToken, cookieHeader } = issueCsrfToken(sessionId)
  return { 'x-csrf-token': csrfToken, cookie: cookieHeader }
}
