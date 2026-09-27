'use strict';

/**
 * Reads a post source file into the structure the templates and linter work
 * with: frontmatter, the "In short" bullets, the body blocks, and the FAQ.
 *
 * The required shape is set by docs/VERGO-BLOG-SYSTEM.md. It is enforced here
 * (structure) and in lint.js (house style), so a malformed post fails the build
 * rather than shipping.
 */

const { parseBlocks, blockToText, stripInline } = require('./markdown');

class PostError extends Error {}

const REQUIRED_FIELDS = ['slug', 'title', 'metaTitle', 'metaDescription', 'published', 'updated'];
const KNOWN_FIELDS = new Set([...REQUIRED_FIELDS, 'summary', 'draft', 'ogImage']);

const SUMMARY_HEADING = 'in short';
const FAQ_HEADING = 'faq';

function splitFrontmatter(raw, file) {
  const text = String(raw).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  if (!text.startsWith('---\n')) {
    throw new PostError(`${file}: must start with a --- frontmatter block`);
  }
  const end = text.indexOf('\n---', 3);
  if (end === -1) throw new PostError(`${file}: unterminated frontmatter block`);

  const frontmatter = text.slice(4, end + 1);
  const body = text.slice(text.indexOf('\n', end + 1) + 1);
  return { frontmatter, body };
}

function parseFrontmatter(block, file) {
  const data = {};
  block.split('\n').forEach((line, index) => {
    if (!line.trim() || line.trimStart().startsWith('#')) return;
    const match = line.match(/^([A-Za-z][A-Za-z0-9_]*):\s*(.*)$/);
    if (!match) {
      throw new PostError(`${file}: frontmatter line ${index + 1} is not "key: value": ${line}`);
    }
    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1)
      || (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    if (!KNOWN_FIELDS.has(key)) {
      throw new PostError(`${file}: unknown frontmatter field "${key}"`);
    }
    if (key in data) throw new PostError(`${file}: duplicate frontmatter field "${key}"`);
    data[key] = value;
  });

  for (const field of REQUIRED_FIELDS) {
    if (!data[field]) throw new PostError(`${file}: frontmatter is missing "${field}"`);
  }

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(data.slug)) {
    throw new PostError(`${file}: slug "${data.slug}" must be lowercase kebab-case`);
  }
  for (const field of ['published', 'updated']) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data[field])) {
      throw new PostError(`${file}: ${field} must be an ISO date (YYYY-MM-DD), got "${data[field]}"`);
    }
  }
  if (Date.parse(data.updated) < Date.parse(data.published)) {
    throw new PostError(`${file}: updated (${data.updated}) is before published (${data.published})`);
  }
  data.draft = data.draft === 'true';

  return data;
}

/** Splits the body blocks into the summary bullets, the prose, and the FAQ. */
function sectionise(blocks, file) {
  const summaryIndex = blocks.findIndex(
    (b) => b.type === 'heading' && b.level === 2 && b.text.trim().toLowerCase() === SUMMARY_HEADING,
  );
  if (summaryIndex !== 0) {
    throw new PostError(`${file}: the first block must be "## In short"`);
  }

  const summaryList = blocks[1];
  if (!summaryList || summaryList.type !== 'list' || summaryList.ordered) {
    throw new PostError(`${file}: "## In short" must be followed by a bullet list`);
  }

  const faqIndex = blocks.findIndex(
    (b) => b.type === 'heading' && b.level === 2 && b.text.trim().toLowerCase() === FAQ_HEADING,
  );
  if (faqIndex === -1) throw new PostError(`${file}: missing a "## FAQ" section`);

  const body = blocks.slice(2, faqIndex);
  const faqBlocks = blocks.slice(faqIndex + 1);

  const faq = [];
  for (const block of faqBlocks) {
    if (block.type === 'heading' && block.level === 3) {
      faq.push({ question: stripInline(block.text), answerBlocks: [], line: block.line });
      continue;
    }
    if (!faq.length) {
      throw new PostError(`${file}: line ${block.line}: FAQ content must start with an "### Question" heading`);
    }
    faq[faq.length - 1].answerBlocks.push(block);
  }

  faq.forEach((entry) => {
    if (!entry.answerBlocks.length) {
      throw new PostError(`${file}: FAQ question "${entry.question}" has no answer`);
    }
    entry.answer = entry.answerBlocks.map(blockToText).join(' ').trim();
  });

  return {
    inShort: summaryList.items.map((item) => item.text),
    body,
    faq,
  };
}

function loadPost(file, raw) {
  const { frontmatter, body } = splitFrontmatter(raw, file);
  const meta = parseFrontmatter(frontmatter, file);
  const blocks = parseBlocks(body);
  const sections = sectionise(blocks, file);

  const words = [meta.title, ...sections.inShort.map(stripInline)]
    .concat(sections.body.map(blockToText))
    .concat(sections.faq.map((entry) => `${entry.question} ${entry.answer}`))
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;

  return {
    file,
    ...meta,
    route: `/blog/${meta.slug}`,
    ...sections,
    // One-line card copy for /blog. Falls back to the first "In short" bullet,
    // which is written to stand alone anyway.
    teaser: meta.summary || stripInline(sections.inShort[0]),
    blocks,
    wordCount: words,
  };
}

module.exports = { PostError, loadPost, parseFrontmatter, splitFrontmatter };
