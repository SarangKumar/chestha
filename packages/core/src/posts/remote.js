/**
 * Reading the published feed from the website, for the extension's Read mode.
 *
 * Like the GitHub and weather widgets, this module is pure: it builds URLs and
 * normalises payloads, and the `fetch` itself lives in the section component.
 * That keeps the whole thing testable without a network or a database.
 *
 * Read mode is opt-in in the same sense those widgets are. Nothing here is
 * called until the user switches the start screen to Read, so a user who stays
 * on the board makes no request at all. The endpoint serves only posts their
 * authors chose to publish, is read without credentials, and sends no identifier
 * — so what leaves the device is the fact that someone asked for the public
 * feed, and nothing about who.
 */

/** The public JSON feed on the website. Published posts only, no bodies. */
const FEED_PATH = '/api/posts';

/** How many posts a single request asks for. */
export const FEED_PAGE_SIZE = 60;

/** How many cached posts are kept. Enough to scroll, small enough to store. */
export const READING_CACHE_LIMIT = 60;

function str(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function isoInstant(value) {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : value;
}

function minutes(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(999, Math.max(1, Math.round(n)));
}

/**
 * `base` is the website origin, which differs between development and
 * production, so it is always passed in rather than baked in here.
 */
export function postsFeedUrl(base, { category = null, limit = FEED_PAGE_SIZE } = {}) {
  const url = new URL(FEED_PATH, base);
  if (category) url.searchParams.set('category', category);
  url.searchParams.set('limit', String(limit));
  return url.toString();
}

/** Where a post is read. The extension has no reader of its own by design. */
export function postPageUrl(base, slug) {
  return new URL(`/post/${encodeURIComponent(slug)}`, base).toString();
}

export function authorPageUrl(base, handle) {
  return new URL(`/user/${encodeURIComponent(handle)}`, base).toString();
}

/**
 * One post, in the shape that is both rendered and stored. A post without a
 * slug cannot be opened or identified, so that is what makes it valid; every
 * other field degrades to something renderable.
 *
 * This is the single definition of the shape — `coerceReading` in `schema.js`
 * validates the cache through it rather than keeping a second copy that could
 * drift.
 */
export function coerceFeedPost(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const slug = str(raw.slug).trim();
  if (!slug) return null;
  const handle = str(raw.author?.handle).trim();
  return {
    slug,
    title: str(raw.title).trim(),
    excerpt: str(raw.excerpt).trim(),
    author: {
      handle,
      displayUsername: str(raw.author?.displayUsername).trim() || handle,
    },
    readingMinutes: minutes(raw.readingMinutes),
    categories: Array.isArray(raw.categories)
      ? raw.categories.map((item) => str(item).trim()).filter(Boolean).slice(0, 3)
      : [],
    publishedAt: isoInstant(raw.publishedAt),
  };
}

/**
 * Normalise a feed response into a list of posts.
 *
 * Accepts either a bare array or `{ posts: [...] }` so the endpoint can grow a
 * wrapper (a cursor, a total) without breaking an installed extension — an
 * older build keeps reading a newer response.
 */
export function summarisePosts(payload, limit = READING_CACHE_LIMIT) {
  const list = Array.isArray(payload) ? payload : payload?.posts;
  if (!Array.isArray(list)) return [];

  // A slug is the identity, so a repeat is a fault in the response rather than
  // two posts that happen to look alike.
  const seen = new Set();
  const posts = [];
  for (const item of list) {
    const post = coerceFeedPost(item);
    if (!post || seen.has(post.slug)) continue;
    seen.add(post.slug);
    posts.push(post);
    if (posts.length >= limit) break;
  }
  return posts;
}

/**
 * Collect the categories present in a list of posts.
 *
 * Read mode filters against what it actually has rather than fetching the
 * curated taxonomy separately: offline, a chip that returns nothing would be a
 * worse answer than no chip.
 */
export function categoriesInPosts(posts) {
  const counts = new Map();
  for (const post of posts ?? []) {
    for (const slug of post?.categories ?? []) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([slug, count]) => ({ slug, count }));
}

/**
 * How old the cache is, in words.
 *
 * Deliberately finer than `shortAge` in `github.js`: that answers "when was
 * this post written", where a day is the right unit, and would flatten every
 * cache younger than a day to "today". Here the difference between two minutes
 * and twenty hours is the whole point, because it is what tells a reader
 * whether what they are looking at is current.
 */
export function describeCacheAge(fetchedAt, now = new Date()) {
  if (!fetchedAt) return '';
  const then = new Date(fetchedAt);
  if (Number.isNaN(then.getTime())) return '';

  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 90) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return 'an hour ago';
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/** A reason to show the reader, never a status code on its own. */
export function describeReadingError(status) {
  if (status === 404) return 'The reading feed has moved. Updating the extension should fix it.';
  if (status === 429) return 'Too many requests just now. It will work again shortly.';
  if (typeof status === 'number' && status >= 500) return 'The reading feed is down. Nothing is wrong on your side.';
  if (typeof status === 'number') return `The reading feed answered with an error (${status}).`;
  return 'Could not reach the reading feed. You may be offline.';
}
