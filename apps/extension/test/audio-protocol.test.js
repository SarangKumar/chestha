import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIO_KEY, AUDIO_VERSION, audioSnapshotFrom, coerceAudioSnapshot, isAudioStale,
} from '../src/audio/protocol.js';

/**
 * The record the offscreen audio host publishes.
 *
 * It is the only thing that knows whether sound is actually coming out of the
 * browser — the pages gave that up when playback moved out of them — so these
 * tests are about what a reader is entitled to conclude from it.
 */
const CATALOGUE = [
  { id: 'light-rain', name: 'Light rain', group: 'Rain & water', credit: 'Mixkit' },
  { id: 'campfire-crackle', name: 'Campfire crackle', group: 'Fire', credit: 'Mixkit' },
  { id: 'track_1', name: 'Immigrant Punk', group: 'Your music', credit: 'Gogol Bordello', stream: true },
];

test('a single track is named, so the overlay can say what is playing', () => {
  const snapshot = audioSnapshotFrom({
    engineState: { running: true },
    mix: { track_1: 0.8 },
    catalogue: CATALOGUE,
    playback: { currentTime: 40, duration: 212 },
  });

  assert.equal(snapshot.title, 'Immigrant Punk');
  assert.equal(snapshot.subtitle, 'Your music');
  assert.equal(snapshot.credit, 'Gogol Bordello');
  assert.equal(snapshot.playing, true);
  assert.equal(snapshot.streaming, true);
  assert.deepEqual(snapshot.media, { position: 40, duration: 212 });
});

test('a layered mix is counted rather than named after one of its parts', () => {
  const snapshot = audioSnapshotFrom({
    engineState: { running: true },
    mix: { 'light-rain': 0.4, 'campfire-crackle': 0.8 },
    catalogue: CATALOGUE,
  });

  assert.equal(snapshot.title, '2 sounds');
  assert.equal(snapshot.credit, 'Light rain · Campfire crackle');
  assert.equal(snapshot.streaming, false, 'ambience is not a stream');
  assert.equal(snapshot.media, null, 'and has no position worth drawing');
});

test('a running engine with an empty mix is not playing', () => {
  // The context can be running with nothing in it — after a stop, before the
  // next mix. A notch saying "Playing" then is the lie to avoid.
  const snapshot = audioSnapshotFrom({
    engineState: { running: true }, mix: {}, catalogue: CATALOGUE,
  });

  assert.equal(snapshot.playing, false);
  assert.equal(snapshot.title, '');
});

test('a position without a length is not carried, and one past the end is clamped', () => {
  const base = { engineState: { running: true }, mix: { track_1: 1 }, catalogue: CATALOGUE };

  assert.equal(audioSnapshotFrom({ ...base, playback: { currentTime: 5, duration: 0 } }).media, null);
  const over = coerceAudioSnapshot(
    audioSnapshotFrom({ ...base, playback: { currentTime: 9999, duration: 212 } }),
  );
  assert.equal(over.media.position, 212);
});

test('a record from another version is discarded whole', () => {
  const good = audioSnapshotFrom({
    engineState: { running: true }, mix: { track_1: 1 }, catalogue: CATALOGUE,
  });

  assert.equal(coerceAudioSnapshot({ ...good, v: AUDIO_VERSION + 1 }), null);
  assert.equal(coerceAudioSnapshot(good).title, 'Immigrant Punk');
});

test('reading junk returns null rather than throwing', () => {
  for (const junk of [null, undefined, 0, 'x', [], { v: 1, media: 'no' }]) {
    assert.doesNotThrow(() => coerceAudioSnapshot(junk));
  }
});

test('the host is assumed gone the moment it stops beating', () => {
  const now = 1_000_000;
  // It reports every second, so the window is deliberately short: audio that
  // has stopped should leave the overlay quickly, not in a minute and a half
  // like the island's own record.
  assert.equal(isAudioStale({ at: now }, now), false);
  assert.equal(isAudioStale({ at: now - 5_000 }, now), false);
  assert.equal(isAudioStale({ at: now - 20_000 }, now), true);
  assert.equal(isAudioStale(null, now), true);
});

test('the storage key is the one the content script hardcodes', () => {
  // scripts/extension/island.js cannot import this module — MV3 content
  // scripts have no imports — so it restates the key and the version. If one
  // moves without the other, the overlay silently shows no music.
  assert.equal(AUDIO_KEY, 'chestha.island.audio');
  assert.equal(AUDIO_VERSION, 1);
});
