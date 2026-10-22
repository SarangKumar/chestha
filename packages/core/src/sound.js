import { newId } from './ids.js';

/**
 * Every sound here is synthesised in the browser from filtered noise. That means
 * no audio files to download, no licence to verify, no external request, and
 * perfect looping — which is why there are no recorded loops (rain, café, fire)
 * in this set. Those would need licensed assets and a size budget; this does not.
 *
 * `recipe` is consumed by the Web Audio engine in the web app. Keeping the
 * catalogue here lets presets be validated against known ids without a DOM.
 */
/**
 * Each sound is a stack of layers. A layer is either shaped noise or a tone,
 * optionally filtered, optionally modulated by an LFO, and optionally "grained"
 * — short scheduled bursts, which is what gives fire its crackle and crickets
 * their pulse.
 *
 * `builtin: true` marks a synthesised sound. A user-supplied file dropped into
 * apps/web/public/audio/ appears alongside these with `file` set instead; see
 * the manifest in that folder.
 */
export const SOUNDS = [
  {
    id: 'brown', name: 'Brown noise', group: 'Noise', builtin: true,
    description: 'Deep and low, like distant surf.',
    layers: [{ noise: 'brown', gain: 1 }],
  },
  {
    id: 'pink', name: 'Pink noise', group: 'Noise', builtin: true,
    description: 'Balanced and even — the usual choice for focus.',
    layers: [{ noise: 'pink', gain: 1 }],
  },
  {
    id: 'white', name: 'White noise', group: 'Noise', builtin: true,
    description: 'Bright and flat. Good for masking speech.',
    layers: [{ noise: 'white', gain: 0.8 }],
  },
  {
    id: 'rain', name: 'Light rain', group: 'Weather', builtin: true,
    description: 'Steady hiss with scattered droplets.',
    layers: [
      { noise: 'white', filters: [{ type: 'bandpass', freq: 2400, q: 0.6 }], gain: 0.5 },
      { noise: 'brown', filters: [{ type: 'lowpass', freq: 900 }], gain: 0.45 },
      { noise: 'white', filters: [{ type: 'bandpass', freq: 5200, q: 2.5 }], gain: 0.5,
        grains: { rate: 22, decay: 0.045, jitter: 0.7 } },
    ],
  },
  {
    id: 'downpour', name: 'Heavy rain', group: 'Weather', builtin: true,
    description: 'Dense rainfall with low rumble underneath.',
    layers: [
      { noise: 'white', filters: [{ type: 'bandpass', freq: 1800, q: 0.45 }], gain: 0.7 },
      { noise: 'brown', filters: [{ type: 'lowpass', freq: 420 }], gain: 0.75 },
      { noise: 'white', filters: [{ type: 'bandpass', freq: 4200, q: 1.8 }], gain: 0.4,
        grains: { rate: 60, decay: 0.03, jitter: 0.85 } },
    ],
  },
  {
    id: 'thunder', name: 'Distant storm', group: 'Weather', builtin: true,
    description: 'Rain with an occasional far-off rumble.',
    layers: [
      { noise: 'white', filters: [{ type: 'bandpass', freq: 2000, q: 0.5 }], gain: 0.45 },
      { noise: 'brown', filters: [{ type: 'lowpass', freq: 160 }], gain: 1,
        grains: { rate: 0.09, decay: 2.8, jitter: 0.9, attack: 0.35 } },
    ],
  },
  {
    id: 'waves', name: 'Ocean waves', group: 'Water', builtin: true,
    description: 'Slow swell, rising and falling.',
    layers: [
      { noise: 'brown', filters: [{ type: 'lowpass', freq: 1100 }], gain: 0.9,
        lfo: { target: 'gain', rate: 0.08, depth: 0.7 } },
      { noise: 'white', filters: [{ type: 'bandpass', freq: 1600, q: 0.8 }], gain: 0.3,
        lfo: { target: 'gain', rate: 0.08, depth: 0.55, phase: 0.25 } },
    ],
  },
  {
    id: 'stream', name: 'Stream', group: 'Water', builtin: true,
    description: 'Water moving quickly over stones.',
    layers: [
      { noise: 'white', filters: [{ type: 'bandpass', freq: 1500, q: 0.7 }], gain: 0.55 },
      { noise: 'white', filters: [{ type: 'bandpass', freq: 3400, q: 1.4 }], gain: 0.35,
        lfo: { target: 'filterFreq', rate: 0.6, depth: 900 } },
      { noise: 'brown', filters: [{ type: 'lowpass', freq: 600 }], gain: 0.3 },
    ],
  },
  {
    id: 'wind', name: 'Wind', group: 'Weather', builtin: true,
    description: 'Low moving air, filtered and drifting.',
    layers: [
      { noise: 'brown', filters: [{ type: 'lowpass', freq: 520 }], gain: 1,
        lfo: { target: 'filterFreq', rate: 0.05, depth: 340 } },
      { noise: 'white', filters: [{ type: 'bandpass', freq: 900, q: 1.2 }], gain: 0.22,
        lfo: { target: 'gain', rate: 0.07, depth: 0.6 } },
    ],
  },
  {
    id: 'fire', name: 'Fireplace', group: 'Room', builtin: true,
    description: 'A low bed of embers with irregular crackle.',
    layers: [
      { noise: 'brown', filters: [{ type: 'lowpass', freq: 380 }], gain: 0.8 },
      { noise: 'white', filters: [{ type: 'bandpass', freq: 2200, q: 3 }], gain: 0.75,
        grains: { rate: 7, decay: 0.07, jitter: 0.95 } },
    ],
  },
  {
    id: 'night', name: 'Summer night', group: 'Outdoors', builtin: true,
    description: 'Crickets over still air.',
    layers: [
      { noise: 'brown', filters: [{ type: 'lowpass', freq: 300 }], gain: 0.45 },
      { noise: 'white', filters: [{ type: 'bandpass', freq: 4600, q: 14 }], gain: 0.7,
        grains: { rate: 5.5, decay: 0.11, jitter: 0.35 } },
    ],
  },
  {
    id: 'fan', name: 'Room fan', group: 'Room', builtin: true,
    description: 'Even mechanical airflow.',
    layers: [
      { noise: 'pink', filters: [{ type: 'lowpass', freq: 700 }], gain: 0.85,
        lfo: { target: 'gain', rate: 7.5, depth: 0.1 } },
      { tone: 108, type: 'sine', gain: 0.1 },
    ],
  },
  {
    id: 'drone', name: 'Deep drone', group: 'Tonal', builtin: true,
    description: 'A slow, warm tone that drifts against itself.',
    layers: [
      { tone: 56, type: 'sine', gain: 0.32 },
      { tone: 56.4, type: 'sine', gain: 0.28 },
      { tone: 112, type: 'sine', gain: 0.12 },
      { noise: 'brown', filters: [{ type: 'lowpass', freq: 240 }], gain: 0.3 },
    ],
  },
  {
    id: 'heartbeat', name: 'Slow pulse', group: 'Tonal', builtin: true,
    description: 'A resting pulse, around sixty a minute.',
    layers: [
      { tone: 44, type: 'sine', gain: 1, grains: { rate: 1, decay: 0.2, jitter: 0, attack: 0.02, double: 0.26 } },
      { noise: 'brown', filters: [{ type: 'lowpass', freq: 180 }], gain: 0.22 },
    ],
  },
];

export const SOUND_IDS = SOUNDS.map((s) => s.id);

export const SOUND_GROUPS = [...new Set(SOUNDS.map((s) => s.group))];

export function soundById(id, extra = []) {
  return [...SOUNDS, ...extra].find((s) => s.id === id) ?? null;
}

/**
 * Validates a user-supplied audio manifest (apps/web/public/audio/manifest.json).
 * Files are optional; the built-in set works with none of them present.
 */
export function coerceAudioManifest(raw) {
  if (!raw || !Array.isArray(raw.sounds)) return [];
  const out = [];
  const seen = new Set(SOUND_IDS);
  for (const item of raw.sounds) {
    if (!item || typeof item !== 'object') continue;
    const id = String(item.id ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    const file = String(item.file ?? '').trim();
    if (!id || !file || seen.has(id)) continue;
    if (file.includes('..') || file.startsWith('/') || /^[a-z]+:/i.test(file)) continue; // local files only
    seen.add(id);
    out.push({
      id,
      name: String(item.name ?? '').trim() || id,
      group: String(item.group ?? '').trim() || 'Your files',
      description: String(item.description ?? '').trim(),
      credit: String(item.credit ?? '').trim(),
      file,
      builtin: false,
      layers: [],
    });
  }
  return out;
}

export function clampVolume(value, fallback = 0.5) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

/** A mix maps a known sound id to its own volume. Unknown ids are dropped. */
export function normalizeMix(mix, knownIds = SOUND_IDS) {
  if (!mix || typeof mix !== 'object') return {};
  const out = {};
  for (const [id, volume] of Object.entries(mix)) {
    if (!knownIds.includes(id)) continue;
    out[id] = clampVolume(volume);
  }
  return out;
}

export function activeSoundIds(mix, knownIds = SOUND_IDS) {
  return Object.keys(normalizeMix(mix, knownIds));
}

/**
 * Summing several noise sources at full gain clips. Rather than letting the
 * master volume multiply uncontrolled, each voice is scaled by 1/sqrt(n), which
 * keeps perceived loudness roughly constant as sounds are added or removed.
 * The engine also runs a compressor as a backstop.
 */
export function mixGain(mix, soundId, masterVolume = 1, knownIds = SOUND_IDS) {
  const normalized = normalizeMix(mix, knownIds);
  const count = Object.keys(normalized).length;
  if (count === 0 || !(soundId in normalized)) return 0;
  return normalized[soundId] * clampVolume(masterVolume, 1) * (1 / Math.sqrt(count));
}

export function createPreset(name, mix, knownIds = SOUND_IDS) {
  const trimmed = String(name ?? '').trim();
  const normalized = normalizeMix(mix, knownIds);
  if (!trimmed) return { ok: false, error: 'A preset needs a name.' };
  if (Object.keys(normalized).length === 0) {
    return { ok: false, error: 'Nothing is playing, so there is no mix to save.' };
  }
  return { ok: true, preset: { id: newId('preset'), name: trimmed, mix: normalized } };
}

export function renamePreset(presets, id, name) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return { ok: false, error: 'A preset needs a name.' };
  if (!presets.some((p) => p.id === id)) return { ok: false, error: 'That preset no longer exists.' };
  return { ok: true, presets: presets.map((p) => (p.id === id ? { ...p, name: trimmed } : p)) };
}

export function deletePreset(presets, id) {
  return presets.filter((p) => p.id !== id);
}

/**
 * Restoring a preset replaces the current mix entirely. Sounds the preset names
 * but this build no longer ships are reported rather than silently dropped, and
 * the stored preset is never rewritten.
 */
export function applyPreset(preset, knownIds = SOUND_IDS) {
  const mix = normalizeMix(preset?.mix, knownIds);
  const requested = Object.keys(preset?.mix ?? {});
  const missing = requested.filter((id) => !knownIds.includes(id));
  return { mix, missing };
}
