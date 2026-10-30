import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AREAS, AREA_MERGE, SYNC_AREAS, areaStrategy, isSyncableArea, mergeArea,
  mergeEventArea, mergeMapArea, mergeRecordArea, mergeReplaceArea, mergeSetArea,
  planAreaSync, planSync,
} from '../src/index.js';

const T = (day) => `2026-10-${String(day).padStart(2, '0')}T09:00:00.000Z`;

// ─── Which areas merge how ───────────────────────────────────────────────────

test('every storage area takes part in sync', () => {
  assert.deepEqual(SYNC_AREAS, AREAS);
  for (const area of ['tasks', 'dashboard', 'settings', 'dsa.progress', 'grove.garden']) {
    assert.equal(isSyncableArea(area), true, `${area} must sync`);
  }
  assert.equal(isSyncableArea('not-an-area'), false);
});

test('every area declares a merge strategy, so a new area forces a decision', () => {
  // The table is the contract: an area added to schema.js without a descriptor
  // would otherwise silently fall back to overwriting user data.
  assert.deepEqual(AREAS.filter((a) => !AREA_MERGE[a]), []);
  assert.deepEqual(Object.keys(AREA_MERGE).filter((a) => !AREAS.includes(a)), []);
});

test('strategy follows the shape an area actually stores', () => {
  // Only `tasks` is a bare id-keyed list.
  assert.equal(areaStrategy('tasks'), 'records');
  // `tags` is a list of plain strings, which carry no timestamp to compare.
  assert.equal(areaStrategy('tags'), 'set');
  // `notes` is a single text blob; there is no field-level merge of a widget grid.
  assert.equal(areaStrategy('notes'), 'replace');
  assert.equal(areaStrategy('dashboard'), 'replace');
  // Record collections elsewhere sit nested beside derived caches.
  assert.equal(areaStrategy('dsa.progress'), 'nested');
  assert.equal(areaStrategy('grove.ledger'), 'nested');
  // An unknown area replaces rather than guessing a merge.
  assert.equal(areaStrategy('not-an-area'), 'replace');
});

// ─── Planning ────────────────────────────────────────────────────────────────

test('a clean client on the current revision does nothing', () => {
  assert.equal(planAreaSync({ baseRev: 4, dirty: false }, { rev: 4 }).action, 'noop');
});

test('local edits on the current revision are a plain push', () => {
  assert.equal(planAreaSync({ baseRev: 4, dirty: true }, { rev: 4 }).action, 'push');
});

test('a clean client behind the server pulls', () => {
  assert.equal(planAreaSync({ baseRev: 4, dirty: false }, { rev: 7 }).action, 'pull');
});

test('edits on both sides are a merge, never a silent overwrite', () => {
  const plan = planAreaSync({ baseRev: 4, dirty: true }, { rev: 7 });
  assert.equal(plan.action, 'merge');
  assert.match(plan.reason, /Both sides/);
});

test('a server behind the revision this device saw is a merge, not a push', () => {
  // A restored backup or a different database. Pushing would overwrite real
  // data, so this is escalated rather than resolved quietly.
  const plan = planAreaSync({ baseRev: 9, dirty: false }, { rev: 2 });
  assert.equal(plan.action, 'merge');
  assert.match(plan.reason, /behind/);
});

test('missing revisions are treated as zero, so a first sync pushes', () => {
  assert.equal(planAreaSync({ dirty: true }, {}).action, 'push');
  assert.equal(planAreaSync({}, {}).action, 'noop');
});

test('a whole-workspace plan covers every area, including unmentioned ones', () => {
  const plan = planSync({ tasks: { baseRev: 1, dirty: true } }, { tasks: { rev: 1 }, settings: { rev: 3 } });
  assert.deepEqual(Object.keys(plan).sort(), [...SYNC_AREAS].sort());
  assert.equal(plan.tasks.action, 'push');
  assert.equal(plan.settings.action, 'pull', 'an area the client never saw still pulls');
  assert.equal(plan.notes.action, 'noop');
});

// ─── Record merge ────────────────────────────────────────────────────────────

test('edits to different records on two devices both survive', () => {
  // This is the whole point of a per-record merge.
  const merged = mergeRecordArea(
    { records: [{ id: 'a', title: 'A edited here', updatedAt: T(5) }, { id: 'b', title: 'B', updatedAt: T(1) }] },
    { records: [{ id: 'a', title: 'A', updatedAt: T(1) }, { id: 'b', title: 'B edited there', updatedAt: T(6) }] },
  );
  const byId = Object.fromEntries(merged.records.map((r) => [r.id, r.title]));
  assert.deepEqual(byId, { a: 'A edited here', b: 'B edited there' });
});

test('the later edit of one record wins', () => {
  const merged = mergeRecordArea(
    { records: [{ id: 'a', title: 'older', updatedAt: T(1) }] },
    { records: [{ id: 'a', title: 'newer', updatedAt: T(9) }] },
  );
  assert.deepEqual(merged.records, [{ id: 'a', title: 'newer', updatedAt: T(9) }]);
  assert.equal(merged.stats.remoteWins, 1);
});

test('an exact tie is broken identically whichever device merges', () => {
  // Position-based tie-breaking would leave two devices each keeping their own
  // copy forever, so the rule has to be commutative.
  const one = { records: [{ id: 'a', title: 'from laptop', updatedAt: T(3) }] };
  const two = { records: [{ id: 'a', title: 'from phone', updatedAt: T(3) }] };
  const forward = mergeRecordArea(one, two).records[0].title;
  const backward = mergeRecordArea(two, one).records[0].title;
  assert.equal(forward, backward, 'both devices must reach the same answer');
  assert.equal(mergeRecordArea(one, two).records.length, 1, 'and not keep both');
});

test('a tie between identical records is stable and keeps one copy', () => {
  const record = { id: 'a', title: 'same', updatedAt: T(3) };
  const merged = mergeRecordArea({ records: [{ ...record }] }, { records: [{ ...record }] });
  assert.deepEqual(merged.records, [record]);
});

test('records present on only one side are kept', () => {
  const merged = mergeRecordArea(
    { records: [{ id: 'only-local', updatedAt: T(2) }] },
    { records: [{ id: 'only-remote', updatedAt: T(2) }] },
  );
  assert.deepEqual(merged.records.map((r) => r.id).sort(), ['only-local', 'only-remote']);
});

test('a delete needs a tombstone, and a tombstone stops resurrection', () => {
  // Without the tombstone, a record deleted on one device simply looks absent
  // and the other device's copy brings it back.
  const naive = mergeRecordArea({ records: [] }, { records: [{ id: 'a', updatedAt: T(1) }] });
  assert.equal(naive.records.length, 1, 'absence alone cannot express a delete');

  const withStone = mergeRecordArea(
    { records: [], tombstones: [{ id: 'a', deletedAt: T(4) }] },
    { records: [{ id: 'a', updatedAt: T(1) }] },
  );
  assert.deepEqual(withStone.records, []);
  assert.equal(withStone.stats.deleted, 1);
});

test('an edit after the delete revives the record', () => {
  // The user touched it last; honouring the delete would discard that work.
  const merged = mergeRecordArea(
    { records: [], tombstones: [{ id: 'a', deletedAt: T(4) }] },
    { records: [{ id: 'a', title: 'edited later', updatedAt: T(8) }] },
  );
  assert.deepEqual(merged.records.map((r) => r.id), ['a']);
});

test('an edit before the delete does not revive it', () => {
  const merged = mergeRecordArea(
    { records: [], tombstones: [{ id: 'a', deletedAt: T(8) }] },
    { records: [{ id: 'a', updatedAt: T(4) }] },
  );
  assert.deepEqual(merged.records, []);
});

test('tombstones are carried forward and keep the earliest delete', () => {
  const merged = mergeRecordArea(
    { records: [], tombstones: [{ id: 'a', deletedAt: T(9) }] },
    { records: [], tombstones: [{ id: 'a', deletedAt: T(3) }, { id: 'b', deletedAt: T(5) }] },
  );
  const stones = Object.fromEntries(merged.tombstones.map((s) => [s.id, s.deletedAt]));
  assert.equal(stones.a, T(3), 'the record was gone from the earliest delete onwards');
  assert.equal(stones.b, T(5));
});

test('malformed records are skipped instead of crashing the merge', () => {
  const merged = mergeRecordArea(
    { records: [null, 'nonsense', { noId: true }, { id: 'ok', updatedAt: T(1) }] },
    { records: undefined },
  );
  assert.deepEqual(merged.records.map((r) => r.id), ['ok']);
});

test('a record with an unparseable date still merges, treated as oldest', () => {
  const merged = mergeRecordArea(
    { records: [{ id: 'a', title: 'bad date', updatedAt: 'not a date' }] },
    { records: [{ id: 'a', title: 'good date', updatedAt: T(1) }] },
  );
  assert.equal(merged.records[0].title, 'good date');
});

// ─── Replace merge ───────────────────────────────────────────────────────────

test('the newer side wins whole, and the loser is handed back, not dropped', () => {
  const merged = mergeReplaceArea(
    { value: { theme: 'dark' }, updatedAt: T(9) },
    { value: { theme: 'light' }, updatedAt: T(2) },
  );
  assert.deepEqual(merged.value, { theme: 'dark' });
  assert.equal(merged.winner, 'local');
  // Nothing is silently destroyed: the caller can keep this for recovery.
  assert.deepEqual(merged.discarded, { theme: 'light' });
});

test('replace ties break on content too, so devices agree', () => {
  const a = { value: { theme: 'dark' }, updatedAt: T(3) };
  const b = { value: { theme: 'light' }, updatedAt: T(3) };
  assert.deepEqual(mergeReplaceArea(a, b).value, mergeReplaceArea(b, a).value);
  // The loser is still reported, whichever side it came from.
  assert.ok(mergeReplaceArea(a, b).discarded);
});

test('key order does not change which side wins a tie', () => {
  // A plain JSON.stringify would rank these differently despite being equal.
  const a = { value: { x: 1, y: 2 }, updatedAt: T(3) };
  const b = { value: { y: 2, x: 1 }, updatedAt: T(3) };
  assert.deepEqual(mergeReplaceArea(a, b).value, { x: 1, y: 2 });
});

// ─── Set, event and map merges ───────────────────────────────────────────────

test('scalar lists union, because a lost tag is worse than a stale one', () => {
  // A plain string has no timestamp, so there is nothing to compare and
  // nothing may be dropped.
  assert.deepEqual(mergeSetArea(['work', 'home'], ['home', 'reading']), ['work', 'home', 'reading']);
  assert.deepEqual(mergeSetArea(undefined, ['a']), ['a']);
  assert.deepEqual(mergeSetArea(['a'], null), ['a']);
});

test('a set merge keeps the local order so a device list does not reshuffle', () => {
  assert.deepEqual(mergeSetArea(['c', 'b'], ['a', 'b']), ['c', 'b', 'a']);
});

test('a set merge can dedupe composite items by identity', () => {
  const identity = (m) => `${m.listId}::${m.slug}`;
  const merged = mergeSetArea(
    [{ listId: 'l1', slug: 'two-sum' }],
    [{ listId: 'l1', slug: 'two-sum' }, { listId: 'l2', slug: 'two-sum' }],
    { identity },
  );
  assert.equal(merged.length, 2);
});

test('event streams union and need no conflict policy', () => {
  // An event is a fact that happened and is never edited.
  const a = [{ id: 'e1', slug: 'two-sum', kind: 'solve', at: T(1) }];
  const b = [{ id: 'e2', slug: 'two-sum', kind: 'solve', at: T(2) }];
  assert.equal(mergeEventArea(a, b).length, 2);
  // The same event arriving twice is not counted twice.
  assert.equal(mergeEventArea(a, a).length, 1);
  assert.equal(mergeEventArea(undefined, undefined).length, 0);
});

test('a keyed map takes the later value per key, keeping both keys', () => {
  const merged = mergeMapArea(
    { 'two-sum': { rung: 1, updatedAt: T(5) }, 'lru-cache': { rung: 2, updatedAt: T(1) } },
    { 'two-sum': { rung: 3, updatedAt: T(9) } },
  );
  assert.equal(merged['two-sum'].rung, 3);
  assert.equal(merged['lru-cache'].rung, 2, 'a key only one side has survives');
});

// ─── mergeArea routes by descriptor ──────────────────────────────────────────

test('mergeArea merges tasks per record without the caller knowing the shape', () => {
  const merged = mergeArea(
    'tasks',
    { value: [{ id: 'a', title: 'mine', updatedAt: T(9) }], updatedAt: T(9) },
    { value: [{ id: 'b', title: 'theirs', updatedAt: T(8) }], updatedAt: T(8) },
  );
  assert.equal(merged.kind, 'records');
  assert.deepEqual(merged.value.map((t) => t.id).sort(), ['a', 'b']);
});

test('mergeArea unions tags', () => {
  const merged = mergeArea('tags', { value: ['work'] }, { value: ['home'] });
  assert.deepEqual(merged.value, ['work', 'home']);
});

test('a nested area merges its collections and replaces its derived caches', () => {
  // dsa.progress holds an irreplaceable event stream next to a rebuildable
  // cache: the stream must union, the cache must not be merged field-wise.
  const merged = mergeArea(
    'dsa.progress',
    {
      value: {
        events: [{ id: 'e1', slug: 'two-sum', kind: 'solve', at: T(1) }],
        schedules: { 'two-sum': { rung: 1, updatedAt: T(1) } },
        questionState: { stale: true },
      },
      updatedAt: T(1),
    },
    {
      value: {
        events: [{ id: 'e2', slug: 'lru-cache', kind: 'solve', at: T(2) }],
        schedules: { 'two-sum': { rung: 2, updatedAt: T(5) } },
        questionState: { fresh: true },
      },
      updatedAt: T(5),
    },
  );
  assert.equal(merged.value.events.length, 2, 'solving history is never lost');
  assert.equal(merged.value.schedules['two-sum'].rung, 2);
  assert.deepEqual(merged.value.questionState, { fresh: true }, 'the newer whole side');
});

test('a replace area reports which side won and hands back the loser', () => {
  const merged = mergeArea(
    'dashboard',
    { value: { widgets: ['mine'] }, updatedAt: T(9) },
    { value: { widgets: ['theirs'] }, updatedAt: T(2) },
  );
  assert.equal(merged.kind, 'replace');
  assert.deepEqual(merged.value, { widgets: ['mine'] });
  assert.deepEqual(merged.discarded, { widgets: ['theirs'] });
});

test('an unknown area replaces rather than guessing, and does not throw', () => {
  const merged = mergeArea('not-an-area', { value: 1, updatedAt: T(1) }, { value: 2, updatedAt: T(2) });
  assert.equal(merged.value, 2);
});

test('mergeArea tolerates a missing side, as on a first sync', () => {
  assert.deepEqual(mergeArea('tasks', { value: [{ id: 'a', updatedAt: T(1) }] }, undefined).value.length, 1);
  assert.deepEqual(mergeArea('tasks', undefined, { value: [{ id: 'a', updatedAt: T(1) }] }).value.length, 1);
  assert.doesNotThrow(() => mergeArea('dsa.progress', undefined, undefined));
});
