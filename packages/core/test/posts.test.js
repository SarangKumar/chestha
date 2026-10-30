import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_CATEGORIES, MAX_TAGS, SEED_CATEGORIES, applyPostEdit, applyTransition,
  canChangeSlug, canTransition, coercePost, createPost, derivedExcerpt,
  isPubliclyVisible, nextStatuses, normalizeCategories, normalizePostTags,
  plainText, publishBlocker, readingMinutes, slugFor, slugify,
} from '../src/index.js';

const KNOWN = SEED_CATEGORIES.map((c) => c.slug);
const NOW = '2026-10-30T09:00:00.000Z';
const LATER = '2026-11-02T09:00:00.000Z';

const draft = (over = {}) => ({
  ...createPost({ authorId: 'u1', title: 'Why date-only dates', body: 'Because timezones.', categories: ['dsa'], now: NOW }),
  ...over,
});

// ─── Slugs ───────────────────────────────────────────────────────────────────

test('slugify produces readable ASCII, stripping accents and punctuation', () => {
  assert.equal(slugify('Why Date-Only Dates?'), 'why-date-only-dates');
  assert.equal(slugify('déjà vu — part 2'), 'deja-vu-part-2');
  assert.equal(slugify("Sarang's notes"), 'sarangs-notes');
  assert.equal(slugify('   '), '');
});

test('a title with no ASCII falls back rather than yielding an unreadable URL', () => {
  // Percent-encoded slugs are unusable once pasted, so we do not produce one.
  assert.equal(slugFor('日本語のみ'), 'post');
});

test('slug collisions get a readable counter, not a hash', () => {
  const taken = new Set(['why-date-only-dates', 'why-date-only-dates-2']);
  assert.equal(slugFor('Why date-only dates', (s) => taken.has(s)), 'why-date-only-dates-3');
});

test('a slug that would collide with a post-area route is pushed aside', () => {
  assert.equal(slugFor('New'), 'new-post');
  assert.equal(slugFor('Drafts'), 'drafts-post');
});

test('slugs freeze once a post has ever been public', () => {
  assert.equal(canChangeSlug(draft()), true);
  assert.equal(canChangeSlug(draft({ status: 'published', firstPublishedAt: NOW })), false);
  // An unpublished post's slug is already in the wild, so it stays frozen.
  assert.equal(canChangeSlug(draft({ status: 'unpublished', firstPublishedAt: NOW })), false);
  // Even back in draft, a previously published post keeps its slug.
  assert.equal(canChangeSlug(draft({ status: 'draft', firstPublishedAt: NOW })), false);
});

// ─── Status is intent, visibility is derived ─────────────────────────────────

test('a new post is always a draft with no publish date', () => {
  const post = createPost({ authorId: 'u1', title: 'T', body: 'B', categories: ['dsa'], now: NOW });
  assert.equal(post.status, 'draft');
  assert.equal(post.publishedAt, null);
  assert.equal(post.firstPublishedAt, null);
  assert.equal(isPubliclyVisible(post), false);
});

test('only a published post is publicly visible', () => {
  assert.equal(isPubliclyVisible(draft({ status: 'published' })), true);
  assert.equal(isPubliclyVisible(draft({ status: 'draft' })), false);
  assert.equal(isPubliclyVisible(draft({ status: 'unpublished' })), false);
});

test('the legal moves are draft→published and published↔unpublished', () => {
  assert.deepEqual(nextStatuses(draft({ status: 'draft' })), ['published']);
  assert.deepEqual(nextStatuses(draft({ status: 'published' })), ['unpublished']);
  assert.deepEqual(nextStatuses(draft({ status: 'unpublished' })), ['published']);
  // A published post cannot be quietly turned back into a draft: that would
  // lose the distinction between "never public" and "was public".
  assert.equal(canTransition(draft({ status: 'published' }), 'draft'), false);
});

test('publishing stamps both dates; re-publishing preserves the original', () => {
  const first = applyTransition(draft(), 'published', NOW);
  assert.equal(first.ok, true);
  assert.equal(first.patch.publishedAt, NOW);
  assert.equal(first.patch.firstPublishedAt, NOW);

  const live = { ...draft(), ...first.patch };
  const down = applyTransition(live, 'unpublished', LATER);
  assert.equal(down.patch.unpublishedAt, LATER);

  const again = applyTransition({ ...live, ...down.patch }, 'published', LATER);
  assert.equal(again.patch.publishedAt, LATER, 'the current publish date moves');
  assert.equal(again.patch.firstPublishedAt, NOW, 'the original date is set once, ever');
  assert.equal(again.patch.unpublishedAt, null);
});

test('a transition to the status a post already holds is refused with copy', () => {
  const result = applyTransition(draft({ status: 'draft' }), 'draft');
  assert.equal(result.ok, false);
  assert.match(result.reason, /already a draft/i);
});

test('an incomplete post cannot be published', () => {
  assert.match(publishBlocker(draft({ title: '  ' })), /title/i);
  assert.match(publishBlocker(draft({ body: '' })), /Write something/i);
  assert.match(publishBlocker(draft({ categories: [] })), /category/i);
  assert.equal(publishBlocker(draft()), null);
  // The blocker is enforced by the transition, not merely advertised by it.
  assert.equal(applyTransition(draft({ categories: [] }), 'published').ok, false);
});

// ─── Categories are curated, tags are not ────────────────────────────────────

test('an unknown category is dropped, never implicitly created', () => {
  assert.deepEqual(normalizeCategories(['dsa', 'made-up'], KNOWN), ['dsa']);
  assert.deepEqual(normalizeCategories(['DSA', 'dsa'], KNOWN), ['dsa'], 'deduplicated');
  assert.deepEqual(normalizeCategories('not a list', KNOWN), []);
});

test('a post cannot be filed under everything', () => {
  const many = KNOWN.slice(0, MAX_CATEGORIES + 2);
  assert.equal(normalizeCategories(many, KNOWN).length, MAX_CATEGORIES);
});

test('tags are free-form but normalised and capped', () => {
  assert.deepEqual(normalizePostTags(['#React', 'react', ' Node JS ']), ['react', 'node-js']);
  assert.equal(normalizePostTags(Array.from({ length: 20 }, (_, i) => `t${i}`)).length, MAX_TAGS);
  // Language names that legitimately carry punctuation survive.
  assert.deepEqual(normalizePostTags(['c++', 'c#', 'node.js']), ['c++', 'c#', 'node.js']);
});

// ─── Reading a record back ───────────────────────────────────────────────────

test('a published post with no date is demoted rather than mis-dated', () => {
  const { value, issues } = coercePost({ ...draft(), status: 'published', publishedAt: null }, { knownCategories: KNOWN });
  assert.equal(value.status, 'draft');
  assert.match(issues.join(' '), /no publish date/i);
});

test('an unknown status degrades to draft with an issue, never throws', () => {
  const { value, issues } = coercePost({ ...draft(), status: 'live' }, { knownCategories: KNOWN });
  assert.equal(value.status, 'draft');
  assert.match(issues.join(' '), /Unknown post status/);
});

test('a post with no slug cannot be addressed and is rejected', () => {
  const { value, issues } = coercePost({ ...draft(), slug: '' }, { knownCategories: KNOWN });
  assert.equal(value, null);
  assert.match(issues.join(' '), /no slug/i);
});

test('a non-object record is rejected rather than coerced', () => {
  assert.equal(coercePost(null).value, null);
  assert.equal(coercePost('a post').value, null);
});

test('firstPublishedAt is recovered from publishedAt for older records', () => {
  const { value } = coercePost(
    { ...draft(), status: 'published', publishedAt: NOW, firstPublishedAt: undefined },
    { knownCategories: KNOWN },
  );
  assert.equal(value.firstPublishedAt, NOW);
});

// ─── Editing ─────────────────────────────────────────────────────────────────

test('an edit cannot change status, author or timestamps', () => {
  const live = { ...draft(), status: 'published', publishedAt: NOW, authorId: 'u1' };
  const edited = applyPostEdit(live, {
    title: 'New title', status: 'draft', authorId: 'intruder', publishedAt: LATER, createdAt: LATER,
  }, { knownCategories: KNOWN, now: LATER });
  assert.equal(edited.title, 'New title');
  assert.equal(edited.status, 'published', 'status moves only through applyTransition');
  assert.equal(edited.authorId, 'u1');
  assert.equal(edited.publishedAt, NOW);
  assert.equal(edited.updatedAt, LATER);
});

test('an absent key is left alone, so a partial patch is safe', () => {
  const edited = applyPostEdit(draft({ title: 'Kept' }), { body: 'new body' }, { knownCategories: KNOWN });
  assert.equal(edited.title, 'Kept');
  assert.equal(edited.body, 'new body');
});

// ─── Derived presentation ────────────────────────────────────────────────────

test('plain text strips the Markdown an author actually writes', () => {
  const body = '# Heading\n\nSome `code` and [a link](https://x.com).\n\n```js\nignored();\n```\n\n> quoted';
  assert.equal(plainText(body), 'Heading Some code and a link. quoted');
});

test('an excerpt prefers the author, falls back to the body, and cuts on a word', () => {
  assert.equal(derivedExcerpt({ excerpt: 'Mine', body: 'Other' }), 'Mine');
  const long = derivedExcerpt({ excerpt: '', body: 'alpha bravo charlie delta echo foxtrot' }, 20);
  assert.ok(long.endsWith('…'));
  assert.equal(long.includes('  '), false);
  assert.ok(long.length <= 21, 'the ellipsis is the only thing past the limit');
});

test('reading time is whole minutes and never zero', () => {
  assert.equal(readingMinutes(''), 1);
  assert.equal(readingMinutes('word '.repeat(220)), 1);
  assert.equal(readingMinutes('word '.repeat(660)), 3);
});
