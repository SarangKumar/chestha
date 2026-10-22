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
export const SOUNDS = [
  { id: 'brown', name: 'Brown noise', description: 'Deep and low, like distant surf.', recipe: { noise: 'brown' } },
  { id: 'pink', name: 'Pink noise', description: 'Balanced and even — the usual choice for focus.', recipe: { noise: 'pink' } },
  { id: 'white', name: 'White noise', description: 'Bright and flat. Good for masking speech.', recipe: { noise: 'white' } },
  { id: 'rain', name: 'Rain', description: 'Brown noise shaped into steady rainfall.', recipe: { noise: 'brown', highpass: 450, lowpass: 7000, shimmer: 0.35 } },
  { id: 'waves', name: 'Waves', description: 'Slow swell, rising and falling.', recipe: { noise: 'brown', lowpass: 1100, swell: { rate: 0.08, depth: 0.65 } } },
  { id: 'wind', name: 'Wind', description: 'Low moving air, filtered and drifting.', recipe: { noise: 'brown', lowpass: 520, sweep: { rate: 0.05, low: 220, high: 900 } } },
];

export const SOUND_IDS = SOUNDS.map((s) => s.id);

export function soundById(id) {
  return SOUNDS.find((s) => s.id === id) ?? null;
}

export function clampVolume(value, fallback = 0.5) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

/** A mix maps a known sound id to its own volume. Unknown ids are dropped. */
export function normalizeMix(mix) {
  if (!mix || typeof mix !== 'object') return {};
  const out = {};
  for (const [id, volume] of Object.entries(mix)) {
    if (!SOUND_IDS.includes(id)) continue;
    out[id] = clampVolume(volume);
  }
  return out;
}

export function activeSoundIds(mix) {
  return Object.keys(normalizeMix(mix));
}

/**
 * Summing several noise sources at full gain clips. Rather than letting the
 * master volume multiply uncontrolled, each voice is scaled by 1/sqrt(n), which
 * keeps perceived loudness roughly constant as sounds are added or removed.
 * The engine also runs a compressor as a backstop.
 */
export function mixGain(mix, soundId, masterVolume = 1) {
  const normalized = normalizeMix(mix);
  const count = Object.keys(normalized).length;
  if (count === 0 || !(soundId in normalized)) return 0;
  return normalized[soundId] * clampVolume(masterVolume, 1) * (1 / Math.sqrt(count));
}

export function createPreset(name, mix) {
  const trimmed = String(name ?? '').trim();
  const normalized = normalizeMix(mix);
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
export function applyPreset(preset) {
  const mix = normalizeMix(preset?.mix);
  const requested = Object.keys(preset?.mix ?? {});
  const missing = requested.filter((id) => !SOUND_IDS.includes(id));
  return { mix, missing };
}
