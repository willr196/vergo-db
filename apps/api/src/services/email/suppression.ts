/**
 * One switch that decides whether this process is allowed to put mail on the wire.
 *
 * Under NODE_ENV=test nothing is sent, whatever RESEND_API_KEY happens to be
 * exported in the shell — a test run must never reach a real inbox, and posting
 * a fixture booking to the quotes route otherwise mails the VERGO address for
 * real and bounces a confirmation off the fixture's example.com recipient.
 *
 * Set ALLOW_TEST_EMAILS=1 to send from a test run on purpose.
 */
export function emailSendingSuppressed(): boolean {
  return process.env.NODE_ENV === 'test' && process.env.ALLOW_TEST_EMAILS !== '1';
}
