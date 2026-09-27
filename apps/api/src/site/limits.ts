/**
 * Length limits for text edited in the admin "Site content" section, so the
 * site can't creep back to long copy. The server enforces them on every save;
 * the admin page gets the same numbers (GET /api/v1/admin/site-content) for
 * its live counters, and counts words and sentences the same way.
 */

export const LIMITS = {
  reviewWords: 60,
  faqAnswerWords: 45,
  faqAnswerSentences: 2,
  recentWorkWords: 12,
  bannerWords: 10,
} as const;

/** Words in text, ignoring tags and {{TOKENS}} (a token counts as one word). */
export function countWords(text: string): number {
  const plain = text.replace(/<[^>]+>/g, ' ').replace(/\{\{[A-Z0-9_]+\}\}/g, 'X').trim();
  return plain ? plain.split(/\s+/).length : 0;
}

/** Sentences, split the way the site consistency test splits them. */
export function countSentences(text: string): number {
  const plain = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().replace(/\be\.g\./g, 'eg');
  return plain ? plain.split(/(?<=[.!?])\s+(?=[A-Z"£0-9])/).filter((s) => s.trim()).length : 0;
}

/** Problems with a piece of text, as sentences an editor can act on; empty when it's fine. */
export function checkLength(kind: 'review' | 'faqAnswer' | 'recentWork' | 'banner', text: string): string[] {
  const words = countWords(text);
  const problems: string[] = [];
  const over = (limit: number, what: string) => {
    if (words > limit) problems.push(`${what} is ${words} words; the limit is ${limit}.`);
  };
  if (kind === 'review') over(LIMITS.reviewWords, 'The review');
  if (kind === 'recentWork') over(LIMITS.recentWorkWords, 'The item');
  if (kind === 'banner') over(LIMITS.bannerWords, 'The banner text');
  if (kind === 'faqAnswer') {
    over(LIMITS.faqAnswerWords, 'The answer');
    const sentences = countSentences(text);
    if (sentences > LIMITS.faqAnswerSentences) {
      problems.push(`The answer is ${sentences} sentences; the limit is ${LIMITS.faqAnswerSentences}.`);
    }
  }
  return problems;
}
