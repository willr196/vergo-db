'use strict';

/**
 * House-style and hard-rule checks from docs/VERGO-BLOG-SYSTEM.md.
 *
 * Errors block the build. Warnings print and let it through, and are for the
 * judgement calls a regex shouldn't get the final say on.
 *
 * This catches mechanical breaches only. It cannot check the rule that matters
 * most - that nothing about VERGO is invented - which stays a human job.
 */

const { blockToText, stripInline } = require('./markdown');

const MIN_WORDS = 1200;
const MAX_WORDS = 1800;

// "Never write this" - HOUSE STYLE.
const BANNED_PHRASES = [
  "in today's fast-paced",
  'look no further',
  'we pride ourselves on',
  'game-changing',
  'game changing',
  'cutting-edge',
  'cutting edge',
];

// Banned words, matched whole-word and case-insensitively.
const BANNED_WORDS = ['unlock', 'unlocks', 'unlocking', 'elevate', 'elevates', 'elevating', 'seamless', 'seamlessly', 'bespoke'];

// "Never name a client" - HARD RULES. Names that must never reach a post.
const FORBIDDEN_NAMES = ['popcorn', 'schmodel'];

// Statutory figures need the caveat line and a GOV.UK source.
const STATUTORY_MARKERS = [
  'national living wage',
  'employer nic',
  "employer's nic",
  'employment allowance',
  'auto-enrolment',
  'auto enrolment',
  'national insurance',
  '12.07',
];
const CAVEAT_PATTERN = /correct for 2026\/27/i;
const GOV_UK_PATTERN = /https:\/\/(www\.)?gov\.uk\//i;

// The two required internal links.
const INTERNAL_LINK_PATTERN = /\]\((\/hire(?:\/quote)?)\)/g;

function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * @param {object} post - as returned by post.js loadPost()
 * @param {string} rawBody - the markdown body, frontmatter stripped
 */
function lintPost(post, rawBody) {
  const errors = [];
  const warnings = [];

  const add = (list, message) => list.push(message);

  // --- required structure -------------------------------------------------

  if (post.inShort.length < 4 || post.inShort.length > 5) {
    add(errors, `"In short" must have 4 to 5 bullets, found ${post.inShort.length}`);
  }
  post.inShort.forEach((bullet, index) => {
    const words = countWords(stripInline(bullet));
    if (words < 8) {
      add(errors, `"In short" bullet ${index + 1} is ${words} words; each bullet must stand alone out of context`);
    }
  });

  const h2s = post.body.filter((b) => b.type === 'heading' && b.level === 2);
  if (h2s.length < 3) {
    add(errors, `body needs at least 3 H2 sections, found ${h2s.length}`);
  }
  const nonQuestionH2s = h2s.filter((b) => !b.text.trim().endsWith('?'));
  if (nonQuestionH2s.length) {
    add(warnings, `H2 headings should be phrased as questions people type: ${nonQuestionH2s.map((b) => `"${b.text}"`).join(', ')}`);
  }

  const tables = post.body.filter((b) => b.type === 'table');
  if (!tables.length) {
    add(errors, 'every post needs at least one table of real figures');
  }

  if (post.faq.length !== 5) {
    add(errors, `FAQ must have exactly 5 questions, found ${post.faq.length}`);
  }
  post.faq.forEach((entry) => {
    if (!entry.question.endsWith('?')) {
      add(errors, `FAQ heading "${entry.question}" must be a question`);
    }
    const sentences = entry.answer.split(/(?<=[.!?])\s+/).filter(Boolean).length;
    if (sentences < 2 || sentences > 4) {
      add(warnings, `FAQ answer to "${entry.question}" is ${sentences} sentence(s); the brief asks for 2 to 4`);
    }
  });

  const internalLinks = [...rawBody.matchAll(INTERNAL_LINK_PATTERN)];
  if (internalLinks.length < 2) {
    add(errors, `needs two internal links to /hire or /hire/quote (one mid-post, one at the end), found ${internalLinks.length}`);
  } else {
    const lastLink = internalLinks[internalLinks.length - 1];
    if (lastLink.index < rawBody.length * 0.5) {
      add(warnings, 'both internal links sit in the first half of the post; one should be at the end');
    }
  }

  if (post.wordCount < MIN_WORDS || post.wordCount > MAX_WORDS) {
    add(errors, `post is ${post.wordCount} words; the brief is ${MIN_WORDS} to ${MAX_WORDS}`);
  }

  // --- meta ---------------------------------------------------------------

  if (post.metaTitle.length > 60) {
    add(errors, `metaTitle is ${post.metaTitle.length} characters; must be under 60`);
  }
  if (post.metaDescription.length > 155) {
    add(errors, `metaDescription is ${post.metaDescription.length} characters; must be under 155`);
  }
  if (post.metaDescription.length < 70) {
    add(warnings, `metaDescription is only ${post.metaDescription.length} characters; aim for 120 to 155`);
  }

  // --- house style --------------------------------------------------------

  const prose = [
    post.title,
    post.metaTitle,
    post.metaDescription,
    post.inShort.join(' '),
    post.body.map(blockToText).join(' '),
    post.faq.map((entry) => `${entry.question} ${entry.answer}`).join(' '),
  ].join('\n');
  const lower = prose.toLowerCase();

  BANNED_PHRASES.forEach((phrase) => {
    if (lower.includes(phrase)) add(errors, `banned phrase: "${phrase}"`);
  });
  BANNED_WORDS.forEach((word) => {
    if (new RegExp(`\\b${word}\\b`, 'i').test(prose)) add(errors, `banned word: "${word}"`);
  });

  if (/[—–]/.test(prose)) {
    add(errors, 'em-dash or en-dash found; use a full stop or a comma');
  }
  if (prose.includes('!')) {
    add(errors, 'exclamation mark found');
  }
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u.test(prose)) {
    add(errors, 'emoji found');
  }
  if (/\bit'?s not just\b[^.]*\bit'?s\b/i.test(prose)) {
    add(errors, 'banned construction: "It\'s not just X, it\'s Y"');
  }

  // Rhetorical question opening a section: an H2 question is required, but the
  // first prose line under it should answer, not ask again.
  post.body.forEach((block, index) => {
    if (block.type !== 'heading' || block.level !== 2) return;
    const next = post.body[index + 1];
    if (next && next.type === 'paragraph' && blockToText(next).trim().endsWith('?')) {
      add(warnings, `section "${block.text}" opens with a rhetorical question`);
    }
  });

  // --- hard rules ---------------------------------------------------------

  FORBIDDEN_NAMES.forEach((name) => {
    if (new RegExp(`\\b${name}\\b`, 'i').test(prose)) {
      add(errors, `hard rule: never name a client ("${name}")`);
    }
  });

  if (/\b(?:VAT|value added tax)\b/i.test(prose) && !/not VAT registered/i.test(prose)) {
    add(warnings, 'VAT is mentioned: VERGO is not VAT registered, never imply prices are ex-VAT');
  }

  if (/\bex[- ]VAT\b|\bplus VAT\b/i.test(prose)) {
    add(errors, 'hard rule: VERGO is not VAT registered, so never write "ex VAT" or "plus VAT"');
  }

  const mentionsStatutory = STATUTORY_MARKERS.some((marker) => lower.includes(marker));
  if (mentionsStatutory) {
    if (!CAVEAT_PATTERN.test(prose)) {
      add(errors, 'statutory figures are used but the "correct for 2026/27, verify before relying on it" caveat is missing');
    }
    if (!GOV_UK_PATTERN.test(rawBody)) {
      add(errors, 'statutory figures are used but no GOV.UK source is linked');
    }
  }

  // Every external statistic must carry a link (THE RULE THAT MATTERS MOST).
  post.body.forEach((block) => {
    if (block.type !== 'paragraph') return;
    const text = block.text;
    if (!/\b\d+(\.\d+)?\s?%/.test(text)) return;
    if (/\]\(https:\/\//.test(text)) return;
    add(warnings, `line ${block.line}: percentage with no cited source; external statistics must link to a verifiable source`);
  });

  return { errors, warnings };
}

module.exports = { lintPost, MIN_WORDS, MAX_WORDS };
