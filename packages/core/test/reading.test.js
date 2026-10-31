import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS, FEED_PAGE_SIZE, LAZY_AREAS, READING_CACHE_LIMIT, START_MODES,
  authorPageUrl, categoriesInPosts, categoryName, coerceArea, coerceFeedPost,
  defaultReading, describeCacheAge, describeReadingError, postPageUrl,
  postsFeedUrl, summarisePosts,
} from '../src/index.js';

const SITE = 'https://chestha.vercel.app/';
const NOW = new Date('2026-10-31T12:00:00.000Z');

const wirePost = (over = {}) => ({
  slug: 'why-date-only-dates',
  title: 'Why date-only dates',
  excerpt: 'Because timezones.',
  readingMinutes: 4,
  categories: ['dsa'],
  publishedAt: '2026-10-30T09:00:00.000Z',
  author: { handle: 'sarang', displayUsername: 'Sarang' },
  ...over,
});

// ─── URLs ────────────────────────────────────────────────────────────────────

test('the feed URL carries only the filter and the page size', () => {
  const url = new URL(postsFeedUrl(SITE));
  assert.equal(url.pathname, '/api/posts');
  assert.equal(url.searchParams.get('limit'), String(FEED_PAGE_SIZE));
  // Nothing identifying: no user, no device, no timestamp.
  assert.deepEqual([...url.searchParams.keys()], ['limit']);
});

test('a category reaches the feed URL escaped', () => {
  const url = new URL(postsFeedUrl(SITE, { category: 'focus & rest' }));
  assert.equal(url.searchParams.get('category'), 'focus & rest');
  assert.match(url.search, /focus\+%26\+rest|focus%20%26%20rest/);
});

test('post and author URLs escape the slug and handle', () => {
  assert.equal(postPageUrl(SITE, 'a b'), 'https://chestha.vercel.app/post/a%20b');
  assert.equal(authorPageUrl(SITE, 'a/b'), 'https://chestha.vercel.app/user/a%2Fb');
});

// ─── Normalising a response ──────────────────────────────────────────────────

test('a post without a slug is dropped, because it cannot be opened', () => {
  assert.equal(coerceFeedPost(wirePost({ slug: '   ' })), null);
  assert.equal(coerceFeedPost(null), null);
  assert.equal(coerceFeedPost('nonsense'), null);
});

test('every field but the slug degrades to something renderable', () => {
  const post = coerceFeedPost({ slug: 'bare' });
  assert.equal(post.title, '');
  assert.equal(post.excerpt, '');
  assert.equal(post.author.handle, '');
  assert.equal(post.readingMinutes, 1); // never 0 — "0 min read" reads as broken
  assert.deepEqual(post.categories, []);
  assert.equal(post.publishedAt, null);
});

test('a missing display name falls back to the handle rather than being blank', () => {
  const post = coerceFeedPost(wirePost({ author: { handle: 'sarang' } }));
  assert.equal(post.author.displayUsername, 'sarang');
});

test('reading minutes are clamped to a sane whole number', () => {
  assert.equal(coerceFeedPost(wirePost({ readingMinutes: 0 })).readingMinutes, 1);
  assert.equal(coerceFeedPost(wirePost({ readingMinutes: -5 })).readingMinutes, 1);
  assert.equal(coerceFeedPost(wirePost({ readingMinutes: 4.6 })).readingMinutes, 5);
  assert.equal(coerceFeedPost(wirePost({ readingMinutes: 1e9 })).readingMinutes, 999);
  assert.equal(coerceFeedPost(wirePost({ readingMinutes: 'ten' })).readingMinutes, 1);
});

test('an invalid published date becomes null rather than an Invalid Date', () => {
  assert.equal(coerceFeedPost(wirePost({ publishedAt: 'soon' })).publishedAt, null);
});

test('a post cannot smuggle in more categories than one may carry', () => {
  const post = coerceFeedPost(wirePost({ categories: ['a', 'b', 'c', 'd', 'e'] }));
  assert.equal(post.categories.length, 3);
});

test('the feed reads from a bare array or a wrapped object', () => {
  assert.equal(summarisePosts([wirePost()]).length, 1);
  assert.equal(summarisePosts({ posts: [wirePost()] }).length, 1);
});

test('a response that is not a list at all yields no posts rather than throwing', () => {
  for (const payload of [null, undefined, 'nope', 42, {}, { posts: 'nope' }]) {
    assert.deepEqual(summarisePosts(payload), []);
  }
});

test('an empty feed is empty, not an error', () => {
  assert.deepEqual(summarisePosts({ posts: [] }), []);
});

test('a repeated slug is one post, since the slug is the identity', () => {
  const posts = summarisePosts([wirePost(), wirePost({ title: 'Copy' })]);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].title, 'Why date-only dates'); // first wins
});

test('unusable rows are skipped without taking the good ones with them', () => {
  const posts = summarisePosts([null, wirePost({ slug: 'a' }), { slug: '' }, wirePost({ slug: 'b' })]);
  assert.deepEqual(posts.map((p) => p.slug), ['a', 'b']);
});

test('a response longer than the cache limit is truncated, not stored whole', () => {
  const many = Array.from({ length: 200 }, (_, i) => wirePost({ slug: `p${i}` }));
  assert.equal(summarisePosts(many).length, READING_CACHE_LIMIT);
});

// ─── Categories present in a list ────────────────────────────────────────────

test('categories are collected from the posts actually held, commonest first', () => {
  const found = categoriesInPosts([
    wirePost({ slug: 'a', categories: ['dsa', 'focus'] }),
    wirePost({ slug: 'b', categories: ['dsa'] }),
    wirePost({ slug: 'c', categories: ['career'] }),
  ]);
  assert.deepEqual(found, [
    { slug: 'dsa', count: 2 },
    { slug: 'career', count: 1 },
    { slug: 'focus', count: 1 },
  ]);
});

test('no posts means no chips, so a filter is never offered over nothing', () => {
  assert.deepEqual(categoriesInPosts([]), []);
  assert.deepEqual(categoriesInPosts(undefined), []);
});

test('a category slug resolves to its name, and an unknown one to itself', () => {
  assert.equal(categoryName('dsa'), 'DSA & interviews');
  assert.equal(categoryName('home-automation'), 'home-automation');
  assert.equal(categoryName(''), '');
  assert.equal(categoryName(null), '');
});

// ─── The stored cache ────────────────────────────────────────────────────────

test('the reading cache is lazy, so an unused Read mode costs nothing at boot', () => {
  assert.ok(LAZY_AREAS.includes('reading'));
});

test('a missing or corrupt cache degrades to an empty one', () => {
  for (const raw of [null, undefined, 'nonsense', 42]) {
    const { value, issues } = coerceArea('reading', raw);
    assert.deepEqual(value, defaultReading());
    assert.deepEqual(issues, []);
  }
});

test('a cache whose posts are not a list is cleared, visibly', () => {
  const { value, issues } = coerceArea('reading', { posts: 'nope' });
  assert.deepEqual(value.posts, []);
  assert.equal(issues.length, 1);
});

test('the cache re-validates posts on read, because they came off disk', () => {
  const { value } = coerceArea('reading', {
    posts: [wirePost(), { slug: '' }, null, wirePost()],
    fetchedAt: '2026-10-31T11:00:00.000Z',
    category: ' dsa ',
  });
  assert.equal(value.posts.length, 1);
  assert.equal(value.fetchedAt, '2026-10-31T11:00:00.000Z');
  assert.equal(value.category, 'dsa');
});

test('an unusable fetch time becomes null, so no age is claimed for it', () => {
  assert.equal(coerceArea('reading', { fetchedAt: 'whenever' }).value.fetchedAt, null);
});

test('an overlong stored cache is trimmed on read as well as on write', () => {
  const many = Array.from({ length: 200 }, (_, i) => wirePost({ slug: `p${i}` }));
  assert.equal(coerceArea('reading', { posts: many }).value.posts.length, READING_CACHE_LIMIT);
});

// ─── The start-screen preference ─────────────────────────────────────────────

test('the start screen defaults to the board, never to the feed', () => {
  assert.equal(DEFAULT_SETTINGS.startMode, 'board');
  assert.deepEqual(START_MODES, ['board', 'read']);
});

test('a stored start mode is re-validated, and anything unknown means board', () => {
  assert.equal(coerceArea('settings', { startMode: 'read' }).value.startMode, 'read');
  for (const bad of ['feed', '', null, 7, {}]) {
    assert.equal(coerceArea('settings', { startMode: bad }).value.startMode, 'board');
  }
});

test('settings with no start mode at all still open on the board', () => {
  assert.equal(coerceArea('settings', {}).value.startMode, 'board');
});

// ─── Words for the reader ────────────────────────────────────────────────────

test('cache age is finer than a day, which is the point of having it', () => {
  const at = (iso) => describeCacheAge(iso, NOW);
  assert.equal(at('2026-10-31T11:59:30.000Z'), 'just now');
  assert.equal(at('2026-10-31T11:40:00.000Z'), '20 minutes ago');
  assert.equal(at('2026-10-31T11:00:00.000Z'), 'an hour ago');
  assert.equal(at('2026-10-31T04:00:00.000Z'), '8 hours ago');
  assert.equal(at('2026-10-30T09:00:00.000Z'), 'yesterday');
  assert.equal(at('2026-10-25T09:00:00.000Z'), '6 days ago');
});

test('no fetch time and no valid one both describe as nothing', () => {
  assert.equal(describeCacheAge(null), '');
  assert.equal(describeCacheAge('whenever'), '');
});

test('every failure has a reason that does not just restate the status code', () => {
  for (const status of [404, 429, 500, 503, 418, null]) {
    const message = describeReadingError(status);
    assert.ok(message.length > 20, `too terse for ${status}`);
    assert.ok(/[.!]$/.test(message), `not a sentence for ${status}`);
  }
  assert.match(describeReadingError(null), /offline/);
  assert.match(describeReadingError(500), /down/);
});
