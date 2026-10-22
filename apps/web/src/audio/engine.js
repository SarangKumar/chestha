import { SOUNDS, mixGain, soundById } from '@vistaar/core';

/**
 * A single AudioContext for the whole application, living outside React so that
 * navigating between sections cannot create a second one or duplicate a voice.
 *
 * All audio is synthesised from noise buffers — nothing is fetched, so playback
 * works offline and no asset can 404.
 */

const NOISE_SECONDS = 4;
const RAMP = 0.08; // seconds; avoids clicks on gain changes

let ctx = null;
let master = null;
let compressor = null;
const voices = new Map(); // soundId -> { gain, nodes[], source }
const buffers = new Map(); // noise colour -> AudioBuffer
const listeners = new Set();

let state = {
  supported: typeof window !== 'undefined' && Boolean(window.AudioContext ?? window.webkitAudioContext),
  running: false,
  blocked: false,
  error: null,
};

function emit() {
  for (const listener of listeners) listener();
}

function setState(patch) {
  state = { ...state, ...patch };
  emit();
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getEngineState() {
  return state;
}

/** Noise generators. Pink uses the Paul Kellet approximation; brown is a leaky integrator. */
function fillNoise(data, colour) {
  if (colour === 'white') {
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return;
  }
  if (colour === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < data.length; i += 1) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    return;
  }
  // brown
  let last = 0;
  for (let i = 0; i < data.length; i += 1) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    data[i] = last * 3.5;
  }
}

function noiseBuffer(colour) {
  if (buffers.has(colour)) return buffers.get(colour);
  const length = Math.floor(ctx.sampleRate * NOISE_SECONDS);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  fillNoise(buffer.getChannelData(0), colour);
  buffers.set(colour, buffer);
  return buffer;
}

/**
 * Creates the context on first use. Browsers refuse to start audio without a
 * user gesture, so this must be called from a click or key handler; a refusal is
 * reported rather than swallowed.
 */
export async function ensureContext() {
  if (!state.supported) return false;
  if (!ctx) {
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    ctx = new Ctor();
    compressor = ctx.createDynamicsCompressor();
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
    } catch (error) {
      setState({ blocked: true, error: 'The browser would not start audio. Press play again.' });
      return false;
    }
  }
  const running = ctx.state === 'running';
  setState({ running, blocked: !running, error: running ? null : state.error });
  return running;
}

function buildVoice(sound) {
  const { recipe } = sound;
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(recipe.noise ?? 'brown');
  source.loop = true;

  const nodes = [];
  let node = source;

  if (recipe.highpass) {
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = recipe.highpass;
    node.connect(hp); node = hp; nodes.push(hp);
  }
  if (recipe.lowpass) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = recipe.lowpass;
    node.connect(lp); node = lp; nodes.push(lp);

    // A slow sweep of the cutoff is what makes wind sound like moving air.
    if (recipe.sweep) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = recipe.sweep.rate;
      depth.gain.value = (recipe.sweep.high - recipe.sweep.low) / 2;
      lp.frequency.value = (recipe.sweep.high + recipe.sweep.low) / 2;
      lfo.connect(depth); depth.connect(lp.frequency);
      lfo.start();
      nodes.push(lfo, depth);
    }
  }

  const gain = ctx.createGain();
  gain.gain.value = 0;
  node.connect(gain);

  // Amplitude swell, for waves.
  if (recipe.swell) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = recipe.swell.rate;
    depth.gain.value = recipe.swell.depth;
    lfo.connect(depth); depth.connect(gain.gain);
    lfo.start();
    nodes.push(lfo, depth);
  }

  gain.connect(master);
  source.start();
  nodes.push(source, gain);
  return { gain, nodes, source };
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
export function applyMix(mix, masterVolume) {
  if (!ctx) return;
  for (const sound of SOUNDS) {
    const wanted = mix[sound.id] !== undefined;
    const voice = voices.get(sound.id);

    if (wanted && !voice) {
      const created = buildVoice(sound);
      voices.set(sound.id, created);
      setGain(created, mixGain(mix, sound.id, masterVolume));
    } else if (wanted && voice) {
      setGain(voice, mixGain(mix, sound.id, masterVolume));
    } else if (!wanted && voice) {
      stopVoice(sound.id);
    }
  }
}

function stopVoice(id) {
  const voice = voices.get(id);
  if (!voice) return;
  voices.delete(id);
  const now = ctx.currentTime;
  voice.gain.gain.cancelScheduledValues(now);
  voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
  voice.gain.gain.linearRampToValueAtTime(0, now + RAMP);
  // Release the nodes after the fade so stopping is silent, not abrupt.
  setTimeout(() => {
    for (const node of voice.nodes) {
      try { node.stop?.(); } catch { /* already stopped */ }
      try { node.disconnect(); } catch { /* already disconnected */ }
    }
  }, (RAMP + 0.05) * 1000);
}

export function setMasterVolume(mix, masterVolume) {
  if (!ctx) return;
  for (const sound of SOUNDS) {
    const voice = voices.get(sound.id);
    if (voice) setGain(voice, mixGain(mix, sound.id, masterVolume));
  }
}

/** Pause keeps the mix; the context is suspended so nothing is rebuilt on resume. */
export async function pause() {
  if (!ctx || ctx.state !== 'running') return;
  await ctx.suspend();
  setState({ running: false });
}

export async function resume() {
  const ok = await ensureContext();
  return ok;
}

/** Stop clears every voice. The caller decides whether to also clear the mix. */
export function stopAll() {
  for (const id of [...voices.keys()]) stopVoice(id);
}

export function activeVoiceIds() {
  return [...voices.keys()];
}

/** Used on teardown; the app is long-lived so this is rarely needed. */
export async function dispose() {
  stopAll();
  if (ctx) {
    try { await ctx.close(); } catch { /* already closed */ }
    ctx = null; master = null; compressor = null;
    buffers.clear();
  }
  setState({ running: false });
}

export function isSoundKnown(id) {
  return Boolean(soundById(id));
}
