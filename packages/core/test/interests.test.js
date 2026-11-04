import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INTEREST_GROUPS, INTEREST_TAGS, MAX_INTERESTS, normalizeInterests,
  normalizePostTags, interestLabel, isInterestTag,
} from '@chestha/core';

test('every interest slug survives post-tag normalisation unchanged', () => {
  // This is the whole contract: an interest is matched against a post's tags,
  // so a slug the tag normaliser would rewrite could never match anything.
  for (const tag of INTEREST_TAGS) {
    assert.deepEqual(normalizePostTags([tag]), [tag], `"${tag}" is not a valid post tag`);
  }
});

test('the catalogue has no duplicates across groups', () => {
  assert.equal(new Set(INTEREST_TAGS).size, INTEREST_TAGS.length);
});

test('every group has a label and at least a few tags to show', () => {
  for (const group of INTEREST_GROUPS) {
    assert.ok(group.id && group.label, 'a group is missing an id or label');
    assert.ok(group.tags.length >= 3, `group "${group.id}" is too small to be a heading`);
  }
});

test('unknown slugs are dropped rather than failing the whole submission', () => {
  assert.deepEqual(normalizeInterests(['react', 'not-a-real-tag', 'dsa']), ['react', 'dsa']);
});

test('order is the catalogue’s, so the same picks store identically', () => {
  const a = normalizeInterests(['dsa', 'react']);
  const b = normalizeInterests(['react', 'dsa']);
  assert.deepEqual(a, b);
});

test('duplicates and hashes and casing all collapse', () => {
  assert.deepEqual(normalizeInterests(['#React', 'react', 'REACT']), ['react']);
});

test('the cap is enforced', () => {
  const all = normalizeInterests(INTEREST_TAGS);
  assert.equal(all.length, Math.min(INTEREST_TAGS.length, MAX_INTERESTS));
});

test('rubbish input is an empty list, not a throw', () => {
  assert.deepEqual(normalizeInterests(null), []);
  assert.deepEqual(normalizeInterests('react'), []);
  assert.deepEqual(normalizeInterests([null, 42, {}]), []);
});

test('labels render with a hash and do not double it', () => {
  assert.equal(interestLabel('react'), '#react');
  assert.equal(interestLabel('#react'), '#react');
});

test('membership ignores hash and casing', () => {
  assert.ok(isInterestTag('#React'));
  assert.ok(!isInterestTag('definitely-not'));
});
