import { newId } from '../ids.js';
import { MAX_CATEGORIES, normalizeCategories, normalizePostTags } from './categories.js';
import { POST_STATUSES } from './status.js';
import { slugFor } from './slug.js';

export const TITLE_MAX = 140;
export const EXCERPT_MAX = 280;
/** Generous but bounded: a post is an article, not a file upload. */
export const BODY_MAX = 100_000;

/** Words per minute for the reading estimate — the usual prose average. */
const WPM = 220;

function str(value) {
  return typeof value === 'string' ? value : '';
}

function isoInstant(value) {
  if (typeof value !== 'string') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : value;
}

/**
 * A new post is always a draft. There is no "create and publish" path: the
 * publish step runs `applyTransition`, which is the only place that can set
 * `publishedAt`, so a post cannot become public without passing its checks.
 */
export function createPost({ authorId, title = '', body = '', categories = [], tags = [], excerpt = '', coverUrl = null, isTaken, now = new Date().toISOString(), knownCategories } = {}) {
  const cleanTitle = str(title).trim().slice(0, TITLE_MAX);
  return {
    id: newId('post'),
    authorId: str(authorId),
    slug: slugFor(cleanTitle || 'untitled', isTaken),
    title: cleanTitle,
    body: str(body).slice(0, BODY_MAX),
    excerpt: str(excerpt).trim().slice(0, EXCERPT_MAX),
    coverUrl: str(coverUrl).trim() || null,
    categories: knownCategories
      ? normalizeCategories(categories, knownCategories)
      : normalizeCategories(categories),
    tags: normalizePostTags(tags),
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    firstPublishedAt: null,
    unpublishedAt: null,
  };
}

/**
 * Validates a record read back from storage, in the same spirit as
 * `coerceArea`: a malformed field degrades to its default rather than taking
 * the page down, and every repair is reported so it can be surfaced.
 *
 * @returns {{ value: object | null, issues: string[] }}
 */
export function coercePost(raw, { knownCategories } = {}) {
  const issues = [];
  if (!raw || typeof raw !== 'object') {
    return { value: null, issues: ['Post record was not an object.'] };
  }

  const title = str(raw.title).trim().slice(0, TITLE_MAX);
  const slug = str(raw.slug).trim();
  if (!slug) issues.push('Post had no slug and cannot be addressed.');

  let status = str(raw.status);
  if (!POST_STATUSES.includes(status)) {
    issues.push(`Unknown post status "${status}"; treated as a draft.`);
    status = 'draft';
  }

  const publishedAt = isoInstant(raw.publishedAt);
  // A published post with no timestamp cannot be ordered in a feed. Rather
  // than invent a date, demote it — invisible is recoverable, mis-dated is not.
  if (status === 'published' && !publishedAt) {
    issues.push('Published post had no publish date; treated as a draft.');
    status = 'draft';
  }

  const categories = knownCategories
    ? normalizeCategories(raw.categories, knownCategories)
    : normalizeCategories(raw.categories);
  if (Array.isArray(raw.categories) && raw.categories.length > categories.length) {
    issues.push(`Some categories were unknown or beyond the limit of ${MAX_CATEGORIES} and were dropped.`);
  }

  const value = {
    id: str(raw.id) || newId('post'),
    authorId: str(raw.authorId),
    slug,
    title,
    body: str(raw.body).slice(0, BODY_MAX),
    excerpt: str(raw.excerpt).trim().slice(0, EXCERPT_MAX),
    coverUrl: str(raw.coverUrl).trim() || null,
    categories,
    tags: normalizePostTags(raw.tags),
    status,
    createdAt: isoInstant(raw.createdAt) ?? new Date().toISOString(),
    updatedAt: isoInstant(raw.updatedAt) ?? isoInstant(raw.createdAt) ?? new Date().toISOString(),
    publishedAt: status === 'published' ? publishedAt : isoInstant(raw.publishedAt),
    firstPublishedAt: isoInstant(raw.firstPublishedAt) ?? isoInstant(raw.publishedAt),
    unpublishedAt: isoInstant(raw.unpublishedAt),
  };
  return { value: slug ? value : null, issues };
}

/**
 * Fields a caller is allowed to change on an existing post. Status is absent
 * on purpose — it moves only through `applyTransition` — and so are the
 * timestamps and `authorId`.
 */
export function applyPostEdit(post, patch = {}, { knownCategories, now = new Date().toISOString() } = {}) {
  const next = { ...post, updatedAt: now };
  if ('title' in patch) next.title = str(patch.title).trim().slice(0, TITLE_MAX);
  if ('body' in patch) next.body = str(patch.body).slice(0, BODY_MAX);
  if ('excerpt' in patch) next.excerpt = str(patch.excerpt).trim().slice(0, EXCERPT_MAX);
  if ('coverUrl' in patch) next.coverUrl = str(patch.coverUrl).trim() || null;
  if ('categories' in patch) {
    next.categories = knownCategories
      ? normalizeCategories(patch.categories, knownCategories)
      : normalizeCategories(patch.categories);
  }
  if ('tags' in patch) next.tags = normalizePostTags(patch.tags);
  return next;
}

/** Plain-text first paragraph, for a card when the author wrote no excerpt. */
export function derivedExcerpt(post, limit = EXCERPT_MAX) {
  const explicit = str(post?.excerpt).trim();
  if (explicit) return explicit;
  const text = plainText(post?.body);
  if (text.length <= limit) return text;
  // Cut on a word boundary so the ellipsis does not land mid-word.
  const cut = text.slice(0, limit);
  const space = cut.lastIndexOf(' ');
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Strips the Markdown an author is likely to have written. */
export function plainText(body) {
  return str(body)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/[*_~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whole minutes, never zero, so a card never reads "0 min read". */
export function readingMinutes(body) {
  const words = plainText(body).split(' ').filter(Boolean).length;
  return Math.max(1, Math.round(words / WPM));
}
