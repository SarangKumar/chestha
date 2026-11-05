import { newId } from './ids.js';

/**
 * Every sound here is a real recording shipped with the app, served from its own
 * origin — nothing is fetched from the internet and nothing is synthesised. An
 * earlier version generated the whole library from filtered noise and tones;
 * those were accurate as noise but never restful, so they were dropped.
 *
 * `file` is a plain filename in apps/extension/public/audio/, resolved by the Web
 * Audio engine in the app and decoded once. Keeping the catalogue here lets
 * presets be validated against known ids without a DOM.
 *
 * `builtin: true` marks a sound that ships with the app. A user-supplied file
 * dropped into apps/extension/public/audio/ appears alongside these with
 * `builtin: false`; see the manifest in that folder.
 */
const CREDIT = 'Mixkit \u2014 Mixkit Free License';

const sound = (id, name, group, description, file) => ({
  id, name, group, description, file, credit: CREDIT, builtin: true,
});

export const SOUNDS = [
  sound('light-rain', 'Light rain', 'Rain & water',
    'Soft, even rainfall with no thunder.', 'light-rain.m4a'),
  sound('flowing-water', 'Flowing water', 'Rain & water',
    'A steady stream moving over its bed.', 'flowing-water.m4a'),

  sound('campfire-crackle', 'Campfire crackle', 'Fire',
    'Close-up burning wood, all crackle and no wind.', 'campfire-crackle.m4a'),
  sound('campfire-night-wind', 'Campfire in night wind', 'Fire',
    'Embers under moving air, recorded outdoors after dark.', 'campfire-night-wind.m4a'),

  sound('summer-crickets', 'Summer crickets', 'Night & wildlife',
    'A field of crickets on a still summer night.', 'summer-crickets.m4a'),
  sound('forest-wolves', 'Wolves in the forest', 'Night & wildlife',
    'Distant howling across dark woodland.', 'forest-wolves.m4a'),

  sound('street-footsteps', 'Street with footsteps', 'City',
    'Pavement ambience with people walking past.', 'street-footsteps.m4a'),
  sound('supermarket-murmur', 'Supermarket murmur', 'City',
    'Indoor crowd noise, conversation with no words.', 'supermarket-murmur.m4a'),
  sound('church-bell', 'Suburb church bell', 'City',
    'A bell ringing out over quiet houses.', 'church-bell.m4a'),
  sound('road-construction', 'Road construction', 'City',
    'Machinery and a reversing truck alert, from a distance.', 'road-construction.m4a'),

  sound('horror-ambience', 'Uneasy room', 'Eerie',
    'A long, low horror bed \u2014 tense rather than restful.', 'horror-ambience.m4a'),
  sound('space-atmosphere', 'Space atmosphere', 'Eerie',
    'Hollow, airless drift, as from inside a hull.', 'space-atmosphere.m4a'),
];

export const SOUND_IDS = SOUNDS.map((s) => s.id);

export const SOUND_GROUPS = [...new Set(SOUNDS.map((s) => s.group))];

export function soundById(id, extra = []) {
  return [...SOUNDS, ...extra].find((s) => s.id === id) ?? null;
}

/**
 * Validates a user-supplied audio manifest (apps/extension/public/audio/catalog.json).
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

/**
 * Whether two mixes are the same mix: the same sounds, at the same volumes.
 *
 * Volumes are compared with a tolerance rather than with `===` because they
 * come from a range input and a round trip through JSON. A slider nudged to
 * 0.5 and a stored 0.5000000001 are the same mix to every ear, and an equality
 * test that disagreed would tell someone their saved mix was unsaved.
 */
export function sameMix(a, b, knownIds = SOUND_IDS) {
  const left = normalizeMix(a, knownIds);
  const right = normalizeMix(b, knownIds);
  const ids = Object.keys(left);
  if (ids.length !== Object.keys(right).length) return false;
  return ids.every((id) => id in right && Math.abs(left[id] - right[id]) < 0.001);
}

/**
 * The saved preset the live mix currently *is*, or null when it matches none.
 *
 * This is what lets a surface say "Rain + fire" rather than "Unsaved mix", and
 * it is the only thing that can: the store keeps `lastMix` and `presets` apart
 * on purpose, so nothing else knows whether what you are hearing has a name.
 *
 * An empty mix matches nothing — silence is not a preset, even though a preset
 * can never be empty (`createPreset` refuses one).
 */
export function matchingPreset(presets, mix, knownIds = SOUND_IDS) {
  const normalized = normalizeMix(mix, knownIds);
  if (Object.keys(normalized).length === 0) return null;
  if (!Array.isArray(presets)) return null;
  return presets.find((preset) => sameMix(preset?.mix, normalized, knownIds)) ?? null;
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
