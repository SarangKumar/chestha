import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ISLAND_COMMANDS, ISLAND_KEY, ISLAND_MODES, ISLAND_VERSION,
  buildIslandSnapshot, coerceIslandSnapshot, isIslandCommand, isIslandStale,
  islandHasContent, islandOwnedElsewhere, islandTitle, mayPublishIsland,
} from '../src/index.js';

/**
 * The snapshot is the only thing that crosses from the workspace into every
 * other tab, so the tests that matter are about what it must *not* carry and
 * what a reader must survive — not about how it looks.
 */

const CATALOGUE = [
  { id: 'light-rain', name: 'Light rain', group: 'Rain & water', credit: 'Mixkit' },
  { id: 'campfire-crackle', name: 'Campfire crackle', group: 'Fire', credit: 'Mixkit' },
  { id: 'track_1', name: 'Immigrant Punk', group: 'Your music', credit: 'Gogol Bordello', stream: true },
];

const TODAY = '2026-11-05';

const task = (over) => ({
  id: 'task_1', title: 'Ship the island', due: TODAY, completedAt: null, ...over,
});

const ALL = { sounds: true, tasks: true };

test('the snapshot carries only what the island draws', () => {
  const snapshot = buildIslandSnapshot({
    sound: { lastMix: { 'light-rain': 0.5 }, presets: [], masterVolume: 0.6, playing: true },
    catalogue: CATALOGUE,
    tasks: [task({ notes: 'a private note', tags: ['secret-client'] })],
    today: TODAY,
    allowed: ALL,
  });

  const serialised = JSON.stringify(snapshot);
  assert.ok(!serialised.includes('private note'), 'task notes must not cross');
  assert.ok(!serialised.includes('secret-client'), 'tags must not cross');
  assert.deepEqual(Object.keys(snapshot.tasks.pending[0]).sort(), ['id', 'overdue', 'title']);
});

test('a gated half is empty rather than absent, so the reader needs no special case', () => {
  const snapshot = buildIslandSnapshot({
    sound: { lastMix: { 'light-rain': 0.5 }, presets: [] },
    catalogue: CATALOGUE,
    tasks: [task()],
    today: TODAY,
    allowed: { sounds: false, tasks: false },
  });

  assert.equal(snapshot.sound, null);
  assert.deepEqual(snapshot.tasks.pending, []);
  assert.equal(islandHasContent(snapshot), false);
});

test('the pending list is clipped but the count is not, so "+N more" stays true', () => {
  const tasks = Array.from({ length: 7 }, (_, index) => task({ id: `task_${index}`, title: `Task ${index}` }));
  const snapshot = buildIslandSnapshot({ tasks, today: TODAY, allowed: ALL });

  assert.equal(snapshot.tasks.pending.length, 3);
  assert.equal(snapshot.tasks.pendingCount, 7);
});

test('an overdue task is marked, and a completed one is not pending', () => {
  const snapshot = buildIslandSnapshot({
    tasks: [
      task({ id: 'late', title: 'Late', due: '2026-11-01' }),
      // Built from a local Date so the instant lands on TODAY in any timezone —
      // the completion day is local, which is the whole point of the helper.
      task({ id: 'done', title: 'Done', completedAt: new Date(2026, 10, 5, 9).toISOString() }),
    ],
    today: TODAY,
    allowed: ALL,
  });

  assert.equal(snapshot.tasks.pending.find((t) => t.id === 'late')?.overdue, true);
  assert.equal(snapshot.tasks.pending.some((t) => t.id === 'done'), false);
  assert.equal(snapshot.tasks.done, 1);
});

test('an overdue task appears once, not once per selector it matches', () => {
  const snapshot = buildIslandSnapshot({
    tasks: [task({ id: 'late', title: 'Late', due: '2026-11-01' })],
    today: TODAY,
    allowed: ALL,
  });

  assert.equal(snapshot.tasks.pending.length, 1);
  assert.equal(snapshot.tasks.pendingCount, 1);
});

test('overdue tasks come first, because a late one is the more urgent line', () => {
  const snapshot = buildIslandSnapshot({
    tasks: [
      task({ id: 'now', title: 'Due today' }),
      task({ id: 'late', title: 'Late', due: '2026-10-30' }),
    ],
    today: TODAY,
    allowed: ALL,
  });

  assert.deepEqual(snapshot.tasks.pending.map((t) => t.id), ['late', 'now']);
});

test('a named mix reports as saved; an edited one does not', () => {
  const preset = { id: 'p1', name: 'Rain + fire', mix: { 'light-rain': 0.4, 'campfire-crackle': 0.8 } };

  const asSaved = buildIslandSnapshot({
    sound: { lastMix: { 'light-rain': 0.4, 'campfire-crackle': 0.8 }, presets: [preset] },
    catalogue: CATALOGUE, allowed: ALL,
  });
  assert.equal(asSaved.sound.title, 'Rain + fire');
  assert.equal(asSaved.sound.saved, true);

  const edited = buildIslandSnapshot({
    sound: { lastMix: { 'light-rain': 0.9, 'campfire-crackle': 0.8 }, presets: [preset] },
    catalogue: CATALOGUE, allowed: ALL,
  });
  assert.equal(edited.sound.title, 'Unsaved mix');
  assert.equal(edited.sound.saved, false);
});

test('position is only carried for a track that has a length', () => {
  const base = {
    sound: { lastMix: { track_1: 0.8 }, presets: [] }, catalogue: CATALOGUE, allowed: ALL,
  };

  assert.equal(buildIslandSnapshot({ ...base, media: { position: 12, duration: 0 } }).media, null);
  assert.deepEqual(
    buildIslandSnapshot({ ...base, media: { position: 12, duration: 180 } }).media,
    { position: 12, duration: 180 },
  );
  // A position past the end is clamped rather than drawn overflowing.
  assert.equal(
    buildIslandSnapshot({ ...base, media: { position: 999, duration: 180 } }).media.position,
    180,
  );
});

test('the streaming flag is what the repeat control keys off', () => {
  const ambience = buildIslandSnapshot({
    sound: { lastMix: { 'light-rain': 0.5 }, presets: [] }, catalogue: CATALOGUE, allowed: ALL,
  });
  const music = buildIslandSnapshot({
    sound: { lastMix: { track_1: 0.5 }, presets: [] }, catalogue: CATALOGUE, allowed: ALL,
  });

  assert.equal(ambience.sound.streaming, false);
  assert.equal(music.sound.streaming, true);
});

test('a snapshot from another version is discarded, not half-read', () => {
  const current = buildIslandSnapshot({
    sound: { lastMix: { 'light-rain': 0.5 }, presets: [] }, catalogue: CATALOGUE, allowed: ALL,
  });

  assert.equal(coerceIslandSnapshot({ ...current, v: ISLAND_VERSION + 1 }).sound, null);
  assert.equal(coerceIslandSnapshot(current).sound.title, 'Light rain');
});

test('reading junk never throws and always returns something drawable', () => {
  for (const junk of [null, undefined, 0, 'string', [], { v: 1 }, { v: 1, tasks: 'no' }]) {
    const snapshot = coerceIslandSnapshot(junk);
    assert.equal(snapshot.v, ISLAND_VERSION);
    assert.ok(Array.isArray(snapshot.tasks.pending));
  }
});

test('a stale snapshot is not shown, because the audio it describes has stopped', () => {
  const now = 1_000_000;
  assert.equal(isIslandStale({ at: now }, now), false);
  assert.equal(isIslandStale({ at: now - 10_000 }, now), false);
  assert.equal(isIslandStale({ at: now - 120_000 }, now), true);
  assert.equal(isIslandStale({ at: 0 }, now), true);
  assert.equal(isIslandStale(null, now), true);
});

test('only the listed commands are forwardable', () => {
  for (const command of ISLAND_COMMANDS) assert.equal(isIslandCommand(command), true);
  for (const hostile of ['eval', 'delete', '__proto__', '', null]) {
    assert.equal(isIslandCommand(hostile), false);
  }
});

test('the storage key and modes are the ones the content script hardcodes', () => {
  // scripts/extension/island.js cannot import this module — MV3 content
  // scripts are classic scripts — so it restates these. If one changes here
  // and not there, the overlay silently reads nothing.
  assert.equal(ISLAND_KEY, 'chestha.island');
  assert.equal(ISLAND_VERSION, 1);
  assert.deepEqual(ISLAND_MODES, ['off', 'workspace', 'everywhere']);
});

/**
 * Ownership. Audio lives in one page's AudioContext, so with two workspace
 * tabs open only one of them is making sound — and before this existed, each
 * published its own view of the same mix and the last writer won, which is
 * what made one tab say "Playing" while the other said "Paused".
 */
test('a snapshot records which tab wrote it', () => {
  const snapshot = buildIslandSnapshot({
    owner: 'tab-a',
    sound: { lastMix: { 'light-rain': 0.5 }, presets: [], playing: true },
    catalogue: CATALOGUE,
    allowed: ALL,
  });

  assert.equal(snapshot.owner, 'tab-a');
  assert.equal(coerceIslandSnapshot(snapshot).owner, 'tab-a');
});

test('audio is owned elsewhere only when another tab is really playing, now', () => {
  const now = 1_000_000;
  const playingElsewhere = { owner: 'tab-b', at: now, sound: { playing: true } };

  assert.equal(islandOwnedElsewhere(playingElsewhere, 'tab-a', now), true);
  // My own record is not somebody else's.
  assert.equal(islandOwnedElsewhere(playingElsewhere, 'tab-b', now), false);
  // Paused is not owned: either tab may take over.
  assert.equal(islandOwnedElsewhere({ ...playingElsewhere, sound: { playing: false } }, 'tab-a', now), false);
  // Stale is not owned: that tab is gone and its audio with it.
  assert.equal(islandOwnedElsewhere({ ...playingElsewhere, at: now - 120_000 }, 'tab-a', now), false);
  // An unowned or missing record never blocks anyone.
  assert.equal(islandOwnedElsewhere({ owner: '', at: now, sound: { playing: true } }, 'tab-a', now), false);
  assert.equal(islandOwnedElsewhere(null, 'tab-a', now), false);
});

test('a silent tab does not overwrite the record of a playing one', () => {
  const now = 1_000_000;
  const theirs = { owner: 'tab-b', at: now, sound: { playing: true } };

  // This is the bug the rule exists for: without it, the silent tab's
  // heartbeat overwrote the playing tab's every thirty seconds and the
  // overlay flipped between Playing and Paused on its own.
  assert.equal(mayPublishIsland({ sound: { playing: false } }, theirs, 'tab-a', now), false);
  // Whoever has the audio always owns the record.
  assert.equal(mayPublishIsland({ sound: { playing: true } }, theirs, 'tab-a', now), true);
  // And a tab is never blocked by its own previous write.
  assert.equal(mayPublishIsland({ sound: { playing: false } }, theirs, 'tab-b', now), true);
  // Nothing stored, nothing to protect.
  assert.equal(mayPublishIsland({ sound: null }, null, 'tab-a', now), true);
});

test('the title is in the snapshot, because the pill shows it rather than a status word', () => {
  const snapshot = buildIslandSnapshot({
    sound: { lastMix: { track_1: 0.8 }, presets: [], playing: true },
    catalogue: CATALOGUE,
    allowed: ALL,
  });

  assert.equal(snapshot.sound.title, 'Immigrant Punk');
  assert.equal(snapshot.sound.credit, 'Gogol Bordello');
});

/**
 * Naming what is playing. This is the rule that kept two New Tabs
 * disagreeing after the shared engine and the shared record were both in
 * place: the island was still asking its own store what the mix was, and a
 * tab opened after the music started has no idea.
 */
test('a tab holding the same mix may name it better than the host can', () => {
  const shared = { count: 2, title: '2 sounds' };

  assert.equal(islandTitle(shared, 'Rain + fire', 2), 'Rain + fire');
});

test('a tab that does not know the mix shows the host’s words, not silence', () => {
  const shared = { count: 2, title: '2 sounds' };

  // The second New Tab: its store was loaded before the music started.
  assert.equal(islandTitle(shared, '', 0), '2 sounds');
});

test('a tab holding a different mix does not name this one', () => {
  const shared = { count: 1, title: 'Immigrant Punk' };

  // It has a mix of its own, never started. Its name is for something else.
  assert.equal(islandTitle(shared, 'Rain + fire', 2), 'Immigrant Punk');
});

test('nothing playing has no name at all', () => {
  assert.equal(islandTitle(null, 'Rain + fire', 2), '');
});
