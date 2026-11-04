import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { familyOf, parsePack, problemUrl, sourceById } from '@chestha/core';

/**
 * Striver's 180 Sheet is the one bundled list whose membership is our own
 * transcription of a published page rather than a licensed dataset, and the
 * one that ships deliberately incomplete. Both facts are easy to erode
 * quietly — by someone "fixing" the count, or by filling an omission with a
 * problem that merely shares a technique — so they are pinned here.
 */

const SHEET = new URL('../../../scripts/data/striver-180.json', import.meta.url);
const PACK = new URL('../../../apps/extension/public/dsa-packs/curated-core.json', import.meta.url);

const sheet = JSON.parse(readFileSync(SHEET, 'utf8'));
const mapped = sheet.entries.filter((e) => e.slug);

test('the transcription is the length the sheet listing is, not the length its name claims', () => {
  assert.equal(sheet.entries.length, 179);
  assert.equal(sheet.transcribedCount, 179);
  // The sheet is branded 180 and its own section counters sum to 179. Recording
  // both keeps the discrepancy visible instead of inviting an invented entry.
  assert.equal(sheet.publishedCount, 180);
});

test('every entry has a LeetCode problem or a stated reason it has none', () => {
  for (const entry of sheet.entries) {
    assert.ok(entry.title, 'every entry is titled');
    assert.ok(['Basic', 'Core', 'Pro'].includes(entry.tier), `${entry.title}: tier`);
    assert.ok(entry.section && entry.group, `${entry.title}: placement`);
    if (!entry.slug) {
      assert.ok(entry.noLeetcode, `${entry.title} has no slug, so it must say why`);
      assert.ok(!('url' in entry), `${entry.title} has no slug, so it must have no url`);
    }
  }
});

test('each url is built from its slug rather than guessed', () => {
  // A link assembled from a title is a dead link, so the two fields must agree.
  for (const entry of mapped) assert.equal(entry.url, problemUrl(entry.slug), entry.title);
});

test('no LeetCode problem is counted twice', () => {
  // The sheet asks Power Set twice, under recursion and under bit manipulation.
  // Membership is keyed by problem, so the second is recorded as a duplicate
  // rather than mapped again.
  assert.equal(new Set(mapped.map((e) => e.slug)).size, mapped.length);
});

test('the list shares the striver family and declares its real size', () => {
  assert.equal(familyOf('striver-180'), 'striver');
  const source = sourceById('striver-180');
  assert.ok(source?.bundled, 'it ships');
  assert.equal(source.family, 'striver');
  assert.equal(source.expected, mapped.length, 'the declared size is the shipped size');
});

test('the bundled pack carries exactly the mapped entries, in sheet order', () => {
  const { ok, pack } = parsePack(readFileSync(PACK, 'utf8'));
  assert.equal(ok, true);

  const list = pack.lists.find((l) => l.id === 'striver-180');
  assert.ok(list, 'the pack contains the list');
  assert.equal(list.family, 'striver');

  const memberships = pack.memberships
    .filter((m) => m.listId === 'striver-180')
    .sort((a, b) => a.order - b.order);
  assert.deepEqual(memberships.map((m) => m.slug), mapped.map((e) => e.slug));
  assert.deepEqual(memberships.map((m) => m.order), mapped.map((_, i) => i));

  // Nothing was invented to pad the list out to 180.
  const slugs = new Set(pack.questions.map((q) => q.slug));
  assert.ok(memberships.every((m) => slugs.has(m.slug)), 'no dangling memberships');
  assert.ok(pack.provenance?.striver180?.note, 'the pack records where the list came from');
});
