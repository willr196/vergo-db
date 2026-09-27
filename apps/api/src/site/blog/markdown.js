'use strict';

/**
 * Minimal, deliberately strict Markdown renderer for VERGO blog posts.
 *
 * It supports exactly the subset the house style in docs/VERGO-BLOG-SYSTEM.md
 * calls for: H2/H3 headings, paragraphs, unordered and ordered lists, GFM
 * tables, blockquotes, links, bold, italic and inline code. Anything else is a
 * hard error rather than a silent passthrough, so a post can't quietly ship
 * with markup nobody styled.
 *
 * Deliberately not supported: raw HTML, images, footnotes, fenced code,
 * setext headings, H1 (the H1 comes from frontmatter `title`).
 */

class MarkdownError extends Error {}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fail(line, message) {
  throw new MarkdownError(`line ${line}: ${message}`);
}

// --- inline ---------------------------------------------------------------

// Split on inline code first so formatting inside `code` is left alone.
function renderInline(text, lineNo) {
  const parts = String(text).split(/(`[^`]+`)/g);

  return parts
    .map((part) => {
      if (part.length > 1 && part.startsWith('`') && part.endsWith('`')) {
        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      }
      return renderInlineText(part, lineNo);
    })
    .join('');
}

function renderInlineText(text, lineNo) {
  if (text.includes('`')) fail(lineNo, 'unbalanced backtick in inline code');

  let out = escapeHtml(text);

  // [label](/href) - relative, anchor, mailto, tel or https only.
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, href) => {
    if (!/^(\/|https:\/\/|mailto:|tel:|#)/.test(href)) {
      fail(lineNo, `link "${href}" must be relative, https, mailto, tel or an anchor`);
    }
    const external = href.startsWith('https://');
    const attrs = external ? ' target="_blank" rel="noopener"' : '';
    return `<a href="${href}"${attrs}>${label}</a>`;
  });

  if (out.replace(/<a [^>]*>[\s\S]*?<\/a>/g, '').includes('](')) {
    fail(lineNo, 'malformed link: expected [label](href)');
  }

  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');

  if (out.includes('*')) fail(lineNo, 'unbalanced asterisk (bold is **x**, italic is *x*)');

  return out;
}

// --- block ----------------------------------------------------------------

function splitTableRow(row, lineNo) {
  const trimmed = row.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let current = '';
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (ch === '\\' && trimmed[i + 1] === '|') {
      current += '|';
      i += 1;
      continue;
    }
    if (ch === '|') {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  if (!cells.length) fail(lineNo, 'empty table row');
  return cells;
}

function isTableDivider(line) {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line) && line.includes('|');
}

function startsNewBlock(line, next) {
  if (/^(#{2,4})\s+/.test(line)) return true;
  if (/^[-*]\s+/.test(line)) return true;
  if (/^\d+[.)]\s+/.test(line)) return true;
  if (/^>\s?/.test(line)) return true;
  if (line.includes('|') && next !== undefined && isTableDivider(next)) return true;
  return false;
}

/**
 * Parses markdown into a flat list of blocks. Rendering to HTML is a separate
 * step so callers (the linter, the FAQ and JSON-LD builders) can inspect
 * structure without re-parsing HTML.
 */
function parseBlocks(markdown) {
  const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  const lineNo = () => i + 1;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (/^\s*</.test(line)) fail(lineNo(), 'raw HTML is not allowed in post markdown');
    if (/^\s*```/.test(line)) fail(lineNo(), 'fenced code blocks are not supported');
    if (/^\s*!\[/.test(line)) fail(lineNo(), 'images are not supported; use a table or a list');
    if (/^# (?!#)/.test(line)) fail(lineNo(), 'do not write an H1; the headline comes from frontmatter `title`');

    const heading = line.match(/^(#{2,4})\s+(.*)$/);
    if (heading) {
      const text = heading[2].trim();
      if (!text) fail(lineNo(), 'empty heading');
      blocks.push({ type: 'heading', level: heading[1].length, text, line: lineNo() });
      i += 1;
      continue;
    }

    if (/^(\*\*\*|---|___)$/.test(line.trim())) {
      blocks.push({ type: 'hr', line: lineNo() });
      i += 1;
      continue;
    }

    // Table: a pipe row followed by a divider row.
    if (line.includes('|') && isTableDivider(lines[i + 1] || '')) {
      const startLine = lineNo();
      const header = splitTableRow(line, startLine);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        const cells = splitTableRow(lines[i], lineNo());
        if (cells.length !== header.length) {
          fail(lineNo(), `table row has ${cells.length} cells, header has ${header.length}`);
        }
        rows.push(cells);
        i += 1;
      }
      if (!rows.length) fail(startLine, 'table has no body rows');
      blocks.push({ type: 'table', header, rows, line: startLine });
      continue;
    }

    if (/^>\s?/.test(line)) {
      const startLine = lineNo();
      const parts = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        parts.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push({ type: 'quote', text: parts.join(' ').trim(), line: startLine });
      continue;
    }

    const isBullet = /^[-*]\s+/.test(line);
    const isOrdered = /^\d+[.)]\s+/.test(line);
    if (isBullet || isOrdered) {
      const ordered = isOrdered;
      const startLine = lineNo();
      const items = [];
      while (i < lines.length) {
        const itemMatch = ordered
          ? lines[i].match(/^\d+[.)]\s+(.*)$/)
          : lines[i].match(/^[-*]\s+(.*)$/);
        if (!itemMatch) {
          // An indented continuation line belongs to the previous item.
          if (items.length && /^\s{2,}\S/.test(lines[i])) {
            items[items.length - 1].text += ` ${lines[i].trim()}`;
            i += 1;
            continue;
          }
          break;
        }
        items.push({ text: itemMatch[1].trim(), line: lineNo() });
        i += 1;
      }
      blocks.push({ type: 'list', ordered, items, line: startLine });
      continue;
    }

    // Paragraph: consume until a blank line or the start of another block.
    const startLine = lineNo();
    const paragraph = [];
    while (i < lines.length && lines[i].trim()) {
      if (paragraph.length && startsNewBlock(lines[i], lines[i + 1])) break;
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraph.join(' '), line: startLine });
  }

  return blocks;
}

function slugifyHeading(text, used) {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-') || 'section';
  let candidate = base;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${n}`;
    n += 1;
  }
  used.add(candidate);
  return candidate;
}

function renderBlocks(blocks, options = {}) {
  const headingIds = options.headingIds !== false;
  const used = options.usedIds || new Set();

  return blocks
    .map((block) => {
      switch (block.type) {
        case 'heading': {
          const tag = `h${block.level}`;
          const id = headingIds ? ` id="${slugifyHeading(block.text, used)}"` : '';
          return `<${tag}${id}>${renderInline(block.text, block.line)}</${tag}>`;
        }
        case 'paragraph':
          return `<p>${renderInline(block.text, block.line)}</p>`;
        case 'hr':
          return '<hr>';
        case 'quote':
          return `<blockquote><p>${renderInline(block.text, block.line)}</p></blockquote>`;
        case 'list': {
          const tag = block.ordered ? 'ol' : 'ul';
          const items = block.items
            .map((item) => `      <li>${renderInline(item.text, item.line)}</li>`)
            .join('\n');
          return `<${tag}>\n${items}\n    </${tag}>`;
        }
        case 'table': {
          const head = block.header
            .map((cell) => `            <th scope="col">${renderInline(cell, block.line)}</th>`)
            .join('\n');
          const body = block.rows
            .map((row) => {
              const cells = row
                .map((cell, index) => (index === 0
                  ? `            <th scope="row">${renderInline(cell, block.line)}</th>`
                  : `            <td>${renderInline(cell, block.line)}</td>`))
                .join('\n');
              return `          <tr>\n${cells}\n          </tr>`;
            })
            .join('\n');
          return [
            '<div class="post-table" tabindex="0" role="region" aria-label="Table">',
            '      <table>',
            '        <thead>',
            '          <tr>',
            head,
            '          </tr>',
            '        </thead>',
            '        <tbody>',
            body,
            '        </tbody>',
            '      </table>',
            '    </div>',
          ].join('\n');
        }
        default:
          throw new MarkdownError(`unknown block type: ${block.type}`);
      }
    })
    .join('\n\n    ');
}

function stripInline(text) {
  return String(text)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

// Plain text of a block, for word counts, meta descriptions and JSON-LD.
function blockToText(block) {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
    case 'quote':
      return stripInline(block.text);
    case 'list':
      return block.items.map((item) => stripInline(item.text)).join(' ');
    case 'table':
      return [block.header, ...block.rows].map((row) => row.map(stripInline).join(' ')).join(' ');
    default:
      return '';
  }
}

module.exports = {
  MarkdownError,
  blockToText,
  escapeHtml,
  parseBlocks,
  renderBlocks,
  renderInline,
  slugifyHeading,
  stripInline,
};
