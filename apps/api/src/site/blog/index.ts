import fs from 'node:fs';
import path from 'node:path';
import { renderSiteHtml } from '../render';

/**
 * The blog, rendered on request from apps/api/content/blog/*.md.
 *
 * The markdown parser, the post loader, the editorial lint and the page
 * templates (markdown.js, post.js, lint.js, template.js) are the ones the old
 * build step used, unchanged, so the pages come out as they did. What changed
 * is when: a post is published by committing its .md and deploying, with no
 * generated HTML to rebuild and commit alongside it.
 *
 * A post with lint errors, or marked draft: true, isn't served. The unit tests
 * run the same lint over every post, so an error fails CI before it ships.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { loadPost, splitFrontmatter } = require('./post');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { lintPost } = require('./lint');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { renderIndex, renderPost } = require('./template');

export const BLOG_DIR = path.join(process.cwd(), 'content', 'blog');

export interface BlogPost {
  slug: string;
  route: string;
  title: string;
  published: string;
  updated: string;
  draft?: boolean;
  wordCount: number;
  [key: string]: unknown;
}

export interface BlogProblem {
  name: string;
  errors: string[];
}

interface Loaded {
  signature: string;
  posts: BlogPost[];
  problems: BlogProblem[];
  warnings: BlogProblem[];
}

let cache: Loaded | null = null;

function sourceFiles(): string[] {
  try {
    return fs
      .readdirSync(BLOG_DIR)
      .filter((name) => name.endsWith('.md') && !name.startsWith('_') && name !== 'README.md')
      .sort();
  } catch {
    return [];
  }
}

/** Every post, parsed and linted; re-read only when a file changes. */
export function loadBlog(): Loaded {
  const files = sourceFiles();
  const signature = files.map((f) => `${f}:${fs.statSync(path.join(BLOG_DIR, f)).mtimeMs}`).join('|');
  if (cache && cache.signature === signature) return cache;

  const posts: BlogPost[] = [];
  const problems: BlogProblem[] = [];
  const warnings: BlogProblem[] = [];
  for (const name of files) {
    const raw = fs.readFileSync(path.join(BLOG_DIR, name), 'utf8');
    try {
      const post = loadPost(name, raw) as BlogPost;
      const { body } = splitFrontmatter(raw, name);
      const result = lintPost(post, body) as { errors: string[]; warnings: string[] };
      if (result.warnings.length) warnings.push({ name, errors: result.warnings });
      if (result.errors.length) {
        problems.push({ name, errors: result.errors });
        continue;
      }
      posts.push(post);
    } catch (err) {
      problems.push({ name, errors: [err instanceof Error ? err.message : String(err)] });
    }
  }

  const slugs = posts.map((p) => p.slug);
  const duplicates = slugs.filter((s, i) => slugs.indexOf(s) !== i);
  if (duplicates.length) problems.push({ name: 'content/blog', errors: [`duplicate slugs: ${[...new Set(duplicates)].join(', ')}`] });
  for (const p of problems) console.warn(`[BLOG] ${p.name} not served: ${p.errors.join('; ')}`);

  cache = { signature, posts, problems, warnings };
  return cache;
}

/**
 * Drafts show on a local development server only (as noindex, from the
 * template), so a post can be previewed before draft: true comes off.
 */
function showDrafts(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';
}

/** Posts to serve, newest first, as the old build ordered them. Drafts only in development. */
export function publishedPosts(): BlogPost[] {
  return loadBlog()
    .posts.filter((p) => !p.draft || showDrafts())
    .sort((a, b) => (a.published < b.published ? 1 : a.published > b.published ? -1 : a.slug.localeCompare(b.slug)));
}

/**
 * /blog or /blog/<slug> as served, shared blocks and {{TOKENS}} filled in;
 * null if there's no such published post.
 */
export function renderBlogPage(pagePath: string): string | null {
  if (pagePath === '/blog') {
    return renderSiteHtml(renderIndex(publishedPosts()), { path: '/blog' });
  }
  const m = /^\/blog\/([a-z0-9-]+)$/.exec(pagePath);
  if (!m) return null;
  const post = publishedPosts().find((p) => p.slug === m[1]);
  return post ? renderSiteHtml(renderPost(post), { path: post.route }) : null;
}

export function isBlogPage(pagePath: string): boolean {
  if (pagePath === '/blog') return true;
  const m = /^\/blog\/([a-z0-9-]+)$/.exec(pagePath);
  return Boolean(m && publishedPosts().some((p) => p.slug === m[1]));
}
