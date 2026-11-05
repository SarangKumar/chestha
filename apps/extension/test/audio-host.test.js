import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * The audio facade, from the point of view of a tab that is only *watching*.
 *
 * This is the regression test for the bug that survived two attempts: a second
 * New Tab reported "Paused" for a mix another tab was playing. The cause was
 * not the record or the ownership rules — it was that this module decided
 * whether to use the shared host lazily, inside `ensureContext`, which a tab
 * that never pressed play never calls. So it kept answering from its own
 * silent engine.
 *
 * The stub is set before the import because the decision is made at first use
 * and the module is cached for the process.
 */
const listeners = [];
const writes = [];
let changeListener = null;

const PLAYING = {
  v: 1,
  at: Date.now(),
  playing: true,
  blocked: false,
  count: 1,
  streaming: true,
  loop: true,
  volume: 0.6,
  title: 'Immigrant Punk',
  subtitle: 'Your music',
  credit: 'Gogol Bordello',
  media: { position: 40, duration: 212 },
};

let stored = PLAYING;

globalThis.chrome = {
  runtime: {
    id: 'test-extension',
    lastError: null,
    sendMessage: () => {},
    onMessage: { addListener: (fn) => listeners.push(fn) },
  },
  // Its presence is what tells the facade an offscreen host is possible.
  offscreen: {},
  storage: {
    local: {
      get: (_key, callback) => callback({ 'chestha.island.audio': stored }),
      set: (values) => { writes.push(values); },
    },
    onChanged: { addListener: (fn) => { changeListener = fn; } },
  },
};

const host = await import('../src/audio/host.js');

test('a tab that has started nothing still reports what is playing', () => {
  // No ensureContext, no applyMix — exactly what a second New Tab does.
  const state = host.getEngineState();

  assert.equal(state.running, true, 'the shared record is the answer, not this page’s engine');
  assert.equal(host.isPlaying(), true);
});

test('the position comes from the shared record too', () => {
  assert.deepEqual(host.playbackOf('track_1'), { currentTime: 40, duration: 212 });
});

test('the island reads the record through one accessor', () => {
  assert.equal(host.audioSnapshot()?.title, 'Immigrant Punk');
});

test('state identity is stable, because a fresh object every call is a render loop', () => {
  assert.equal(host.getEngineState(), host.getEngineState());
});

test('a change to the record is picked up without a reload', () => {
  assert.ok(changeListener, 'the facade watches the record');

  changeListener({ 'chestha.island.audio': { newValue: { ...PLAYING, playing: false } } }, 'local');
  assert.equal(host.getEngineState().running, false);

  changeListener({ 'chestha.island.audio': { newValue: PLAYING } }, 'local');
  assert.equal(host.getEngineState().running, true);
});

test('a host that has stopped reporting is silence, not the last thing heard', () => {
  changeListener(
    { 'chestha.island.audio': { newValue: { ...PLAYING, at: Date.now() - 60_000 } } },
    'local',
  );

  assert.equal(host.getEngineState().running, false);
  assert.equal(host.audioSnapshot(), null);
});

test('the host broadcasts reach the facade as well as the record', () => {
  assert.ok(listeners.length >= 1, 'it listens for the host’s messages');

  listeners[0](
    { type: 'audio/state', snapshot: { ...PLAYING, title: 'Light rain' } },
    { id: 'test-extension' },
  );
  assert.equal(host.audioSnapshot()?.title, 'Light rain');
});

test('a message from somewhere else is ignored', () => {
  const before = host.audioSnapshot()?.title;

  listeners[0](
    { type: 'audio/state', snapshot: { ...PLAYING, title: 'Injected' } },
    { id: 'some-other-extension' },
  );
  assert.equal(host.audioSnapshot()?.title, before);
});

test('a page writes the record when storage has fallen behind', () => {
  // The overlay on other sites can only read storage — it never sees the
  // host's broadcasts. If the host's own write does not land, every workspace
  // tab knows what is playing and every other page shows an empty island,
  // which is exactly what "works in the start tab, not on dribbble" looks
  // like. Any page that knows more than storage does writes what it knows.
  writes.length = 0;

  // Storage is behind: the last thing seen there is a minute old, while the
  // host's broadcasts are arriving here now.
  changeListener(
    { 'chestha.island.audio': { newValue: { ...PLAYING, at: Date.now() - 60_000 } } },
    'local',
  );
  listeners[0](
    { type: 'audio/state', snapshot: { ...PLAYING, at: Date.now(), title: 'Mirrored' } },
    { id: 'test-extension' },
  );

  assert.equal(writes.length, 1, 'the page backed the record up');
  assert.equal(writes[0]['chestha.island.audio'].title, 'Mirrored');
});

test('and does not keep writing once storage is current', () => {
  writes.length = 0;

  // Its own write came back through onChanged, so storage is up to date.
  changeListener(
    { 'chestha.island.audio': { newValue: { ...PLAYING, at: Date.now() } } },
    'local',
  );
  listeners[0](
    { type: 'audio/state', snapshot: { ...PLAYING, at: Date.now() } },
    { id: 'test-extension' },
  );

  assert.equal(writes.length, 0, 'no second writer fighting the host');
});
