import { mixGain } from '@chestha/core';

/**
 * One AudioContext for the whole application, living outside React so that
 * navigating between sections cannot create a second one or duplicate a voice.
 *
 * Every sound names a local `file`, fetched from the app's own origin and
 * decoded once, so playback works offline and nothing leaves the machine. The
 * only thing still synthesised here is the end-of-session chime.
 */

const RAMP = 0.08; // seconds; avoids clicks on gain changes

let ctx = null;
let master = null;
/**
 * Bumped whenever audio is stopped. A voice build that started before the bump
 * is discarded on completion instead of being inserted, which is what stops a
 * Stop pressed mid-build from being undone by the build finishing afterwards.
 */
let epoch = 0;
const voices = new Map();   // soundId -> { gain, nodes[] }
const files = new Map();    // url -> Promise<AudioBuffer>
const listeners = new Set();
let catalogue = [];

let state = {
  supported: typeof window !== 'undefined' && Boolean(window.AudioContext ?? window.webkitAudioContext),
  running: false,
  blocked: false,
  error: null,
  failed: {},   // soundId -> reason, for sounds whose file could not load
};

const emit = () => { for (const l of listeners) l(); };
const setState = (patch) => { state = { ...state, ...patch }; emit(); };

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getEngineState = () => state;

/** The engine needs the resolved catalogue, which may include user files. */
export function setCatalogue(sounds) {
  catalogue = sounds;
}

const findSound = (id) => catalogue.find((s) => s.id === id) ?? null;
const knownIds = () => catalogue.map((s) => s.id);

/** Decodes a local audio file once and caches it. Same origin only. */
function loadFile(url) {
  if (files.has(url)) return files.get(url);
  const work = (async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`could not be loaded (HTTP ${response.status})`);
    return ctx.decodeAudioData(await response.arrayBuffer());
  })();
  files.set(url, work);
  return work;
}

export async function ensureContext() {
  if (!state.supported) return false;
  if (!ctx) {
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    ctx = new Ctor();
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.ratio.value = 6;
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(compressor);
    compressor.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      setState({ blocked: true, error: 'The browser would not start audio. Press play again.' });
      return false;
    }
  }
  const running = ctx.state === 'running';
  setState({ running, blocked: !running, error: running ? null : state.error });
  return running;
}

async function buildVoice(sound) {
  const nodes = [];
  const voiceGain = ctx.createGain();
  voiceGain.gain.value = 0;
  voiceGain.connect(master);
  nodes.push(voiceGain);

  const buffer = await loadFile(`/audio/${sound.file}`);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(voiceGain);
  source.start();
  nodes.push(source);

  return { gain: voiceGain, nodes };
}

/** Releases a voice's nodes. */
function teardown(voice) {
  if (!voice) return;
  for (const node of voice.nodes) {
    try { node.stop?.(); } catch { /* already stopped */ }
    try { node.disconnect(); } catch { /* already disconnected */ }
  }
}

function setGain(voice, value) {
  const now = ctx.currentTime;
  voice.gain.gain.cancelScheduledValues(now);
  voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
  voice.gain.gain.linearRampToValueAtTime(value, now + RAMP);
}

/**
 * Reconciles live voices against the desired mix. Only the difference is acted
 * on, so changing one sound's volume never interrupts the others.
 */
export async function applyMix(mix, masterVolume) {
  if (!ctx) return;
  const ids = knownIds();

  for (const sound of catalogue) {
    const wanted = mix[sound.id] !== undefined;
    const voice = voices.get(sound.id);
    const target = mixGain(mix, sound.id, masterVolume, ids);

    if (wanted && !voice && !voices.has(sound.id)) {
      // Claim the slot before awaiting, so a fast double-click cannot build two.
      voices.set(sound.id, null);
      const builtAt = epoch;
      try {
        const created = await buildVoice(sound);
        // The slot may have been released while this was building — by Stop, or
        // by the sound being switched off. Discard rather than resurrect it.
        if (builtAt !== epoch || !voices.has(sound.id)) {
          teardown(created);
          continue;
        }
        voices.set(sound.id, created);
        setGain(created, mixGain(mix, sound.id, masterVolume, ids));
        if (state.failed[sound.id]) {
          const failed = { ...state.failed };
          delete failed[sound.id];
          setState({ failed });
        }
      } catch (error) {
        voices.delete(sound.id);
        setState({ failed: { ...state.failed, [sound.id]: error.message || 'could not be loaded' } });
      }
    } else if (wanted && voice) {
      setGain(voice, target);
    } else if (!wanted && voices.has(sound.id)) {
      // `has` rather than a truthiness check: the slot may hold the `null`
      // placeholder of a build still in flight, and that must be released too or
      // the build will insert a voice the user has already switched off.
      stopVoice(sound.id);
    }
  }
}

function stopVoice(id) {
  const voice = voices.get(id);
  voices.delete(id);
  if (!voice) return;
  // Fade out first; the nodes go once the fade has finished.
  const now = ctx.currentTime;
  voice.gain.gain.cancelScheduledValues(now);
  voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
  voice.gain.gain.linearRampToValueAtTime(0, now + RAMP);
  setTimeout(() => teardown(voice), (RAMP + 0.05) * 1000);
}

export function setMasterVolume(mix, masterVolume) {
  if (!ctx) return;
  const ids = knownIds();
  for (const [id, voice] of voices) {
    if (voice) setGain(voice, mixGain(mix, id, masterVolume, ids));
  }
}

export async function pause() {
  if (!ctx || ctx.state !== 'running') return;
  await ctx.suspend();
  setState({ running: false });
}

export const resume = () => ensureContext();

export function stopAll() {
  epoch += 1;
  for (const id of [...voices.keys()]) stopVoice(id);
  // Drop any slot still only claimed by an in-flight build.
  voices.clear();
}

export const activeVoiceIds = () => [...voices.keys()].filter((id) => voices.get(id));

export async function dispose() {
  epoch += 1;
  stopAll();
  if (ctx) {
    try { await ctx.close(); } catch { /* already closed */ }
    ctx = null; master = null;
    files.clear();
  }
  setState({ running: false });
}

export { findSound as soundInCatalogue };

/**
 * A short, quiet two-note chime for the end of a focus session.
 *
 * It goes through the same context, master gain and compressor as everything
 * else, so it cannot be louder than the mix it plays over and cannot clip it. It
 * is scheduled and forgotten — there is no voice to track, nothing to stop, and
 * nothing it can leave running.
 *
 * Like all audio here it needs the context to be running already. Ending a
 * session is a user gesture, so it normally is; when it is not (a timer reaching
 * zero in a tab that never played anything), this is silently a no-op rather
 * than an error. A missing chime is not worth a message.
 */
export async function chime() {
  if (!state.supported || !ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  for (const [index, frequency] of [587.33, 880].entries()) {   // D5 then A5
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    const at = now + index * 0.18;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.16, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.1);
    osc.connect(gain);
    gain.connect(master);
    osc.start(at);
    osc.stop(at + 1.2);
  }
}
