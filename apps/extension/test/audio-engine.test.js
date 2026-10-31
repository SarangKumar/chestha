import test from 'node:test';
import assert from 'node:assert/strict';
import { SOUNDS } from '@chestha/core';

/**
 * A minimal stand-in for Web Audio, enough to exercise the engine's voice
 * bookkeeping. It records every node it creates so a test can assert that a
 * discarded build was actually released rather than left running.
 *
 * Every sound is a file now, so this also stubs `fetch` and `decodeAudioData`;
 * a test that wants a load to fail replaces `fetch` afterwards.
 */
function installFakeAudio() {
  const created = [];
  const node = (kind, extra = {}) => {
    const n = {
      kind,
      connected: [],
      stopped: false,
      disconnected: false,
      connect(target) { this.connected.push(target); },
      disconnect() { this.disconnected = true; },
      stop() { this.stopped = true; },
      start() { this.started = true; },
      ...extra,
    };
    created.push(n);
    return n;
  };
  const param = () => ({
    value: 0,
    cancelScheduledValues() {}, setValueAtTime() {},
    linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {},
  });

  class FakeContext {
    constructor() {
      this.state = 'running';
      this.sampleRate = 48000;
      this.currentTime = 0;
      this.destination = node('destination');
    }
    createGain() { return node('gain', { gain: param() }); }
    createBufferSource() { return node('source', { buffer: null, loop: false }); }
    createBiquadFilter() { return node('filter', { type: '', frequency: param(), Q: param() }); }
    createOscillator() { return node('oscillator', { type: 'sine', frequency: param() }); }
    createDynamicsCompressor() { return node('compressor', { threshold: param(), ratio: param() }); }
    async decodeAudioData() { return { duration: 60 }; }
    async resume() { this.state = 'running'; }
    async suspend() { this.state = 'suspended'; }
    async close() { this.state = 'closed'; }
  }

  globalThis.window = { AudioContext: FakeContext };
  globalThis.fetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) });
  return { created };
}

async function loadEngine(t) {
  // Fresh module state per test, so voices do not leak between them.
  const engine = await import(`../src/audio/engine.js?t=${Math.random()}`);
  t.after(() => engine.dispose());
  return engine;
}

test('a stop during a voice build discards it instead of resurrecting it', async (t) => {
  const { created } = installFakeAudio();
  const engine = await loadEngine(t);
  engine.setCatalogue(SOUNDS);
  await engine.ensureContext();

  // Start a build but do not await it, then stop while it is still in flight.
  const building = engine.applyMix({ 'campfire-crackle': 0.5 }, 1);
  engine.stopAll();
  await building;

  assert.deepEqual(engine.activeVoiceIds(), [], 'no voice survived the stop');

  // Everything the discarded build created must have been released, or the
  // looping source would keep playing.
  const sources = created.filter((n) => n.kind === 'source');
  assert.ok(sources.length > 0, 'the build did create sources');
  assert.ok(sources.every((n) => n.disconnected), 'all sources were disconnected');
});

test('switching a sound off mid-build discards that build', async (t) => {
  installFakeAudio();
  const engine = await loadEngine(t);
  engine.setCatalogue(SOUNDS);
  await engine.ensureContext();

  const building = engine.applyMix({ 'light-rain': 0.5 }, 1);
  await engine.applyMix({}, 1);   // user toggled it off before the build landed
  await building;

  assert.deepEqual(engine.activeVoiceIds(), [], 'the voice was not inserted');
});

test('stop clears every voice, including several at once', async (t) => {
  installFakeAudio();
  const engine = await loadEngine(t);
  engine.setCatalogue(SOUNDS);
  await engine.ensureContext();

  await engine.applyMix({ 'light-rain': 0.5, 'flowing-water': 0.5, 'space-atmosphere': 0.4 }, 1);
  assert.equal(engine.activeVoiceIds().length, 3, 'three voices playing');

  engine.stopAll();
  assert.deepEqual(engine.activeVoiceIds(), [], 'all stopped');
});

test('turning one sound off leaves the others running', async (t) => {
  installFakeAudio();
  const engine = await loadEngine(t);
  engine.setCatalogue(SOUNDS);
  await engine.ensureContext();

  await engine.applyMix({ 'light-rain': 0.5, 'flowing-water': 0.5 }, 1);
  await engine.applyMix({ 'flowing-water': 0.5 }, 1);

  assert.deepEqual(engine.activeVoiceIds(), ['flowing-water'], 'only the removed one stopped');
});

test('a repeated toggle never builds two voices for one sound', async (t) => {
  installFakeAudio();
  const engine = await loadEngine(t);
  engine.setCatalogue(SOUNDS);
  await engine.ensureContext();

  await Promise.all([
    engine.applyMix({ 'campfire-crackle': 0.5 }, 1),
    engine.applyMix({ 'campfire-crackle': 0.5 }, 1),
    engine.applyMix({ 'campfire-crackle': 0.5 }, 1),
  ]);

  assert.deepEqual(engine.activeVoiceIds(), ['campfire-crackle'], 'exactly one voice');
});

test('a sound whose file cannot load is reported, not left half-built', async (t) => {
  installFakeAudio();
  globalThis.fetch = async () => ({ ok: false, status: 404 });
  const engine = await loadEngine(t);
  engine.setCatalogue([
    ...SOUNDS,
    { id: 'missing', name: 'Missing', group: 'Your files', description: '', file: 'nope.mp3', builtin: false },
  ]);
  await engine.ensureContext();

  await engine.applyMix({ missing: 0.5 }, 1);

  assert.deepEqual(engine.activeVoiceIds(), [], 'no voice for a file that failed');
  assert.match(engine.getEngineState().failed.missing, /HTTP 404/, 'the reason is surfaced');
  delete globalThis.fetch;
});
