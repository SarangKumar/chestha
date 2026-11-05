/**
 * The contract between the audio host and everything that watches it.
 *
 * Audio runs in an offscreen document now (see `src/offscreen.js`), so "what
 * is playing" is no longer a question a page can answer from its own engine.
 * It is answered here, in one record, written to `chrome.storage.local` by the
 * host and read by every workspace page and by the overlay injected into other
 * sites.
 *
 * It is deliberately **separate from the island's own record**. The island's
 * snapshot carries the mode and the day's tasks and is written by a workspace
 * page; this one carries playback and is written by the host. Keeping them
 * apart is what stops two New Tabs disagreeing about the music: there is one
 * writer for audio, so there is one answer, and neither tab can overwrite it
 * with a view of an engine it happens to own.
 *
 * `at` is a heartbeat, not a timestamp of the last change: a record that stops
 * being refreshed means the host is gone and the audio with it, so readers
 * treat an old one as silence rather than as the last thing they heard.
 */

export const AUDIO_KEY = 'chestha.island.audio';
export const AUDIO_STATE = 'audio/state';
export const AUDIO_COMMAND = 'audio/command';
export const AUDIO_VERSION = 1;

/** Older than this and the host is assumed gone. It beats every second. */
export const AUDIO_STALE_MS = 15_000;

const clean = (value, max = 160) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Builds the record from the host's own state.
 *
 * The title is derived here, from the catalogue the host resolved, rather than
 * sent by a page: the point of the offscreen host is that it outlives every
 * page, and a label that only existed while a tab was open would leave the
 * overlay showing a nameless bar exactly when it is most useful. A page that
 * *is* open still knows better for a saved mix — it has the presets — and the
 * island prefers its own name when it has one.
 */
export function audioSnapshotFrom({
  engineState = {}, mix = {}, catalogue = [], masterVolume = 0.6, playback = null,
  loop = true, now = Date.now(),
} = {}) {
  const ids = Object.keys(mix ?? {});
  const sounds = ids.map((id) => catalogue.find((item) => item?.id === id)).filter(Boolean);
  const single = sounds.length === 1 ? sounds[0] : null;

  return {
    v: AUDIO_VERSION,
    at: now,
    playing: Boolean(engineState.running) && ids.length > 0,
    blocked: Boolean(engineState.blocked),
    count: sounds.length,
    streaming: sounds.some((item) => item.stream === true),
    loop: loop !== false,
    volume: Math.min(1, Math.max(0, Number(masterVolume) || 0)),
    title: clean(single ? single.name : sounds.length ? `${sounds.length} sounds` : ''),
    subtitle: clean(single ? single.group : ''),
    credit: clean(single ? single.credit : sounds.map((item) => item.name).join(' · ')),
    media: playback && playback.duration > 0
      ? { position: Math.max(0, Number(playback.currentTime) || 0), duration: playback.duration }
      : null,
  };
}

/** Defensive read, for the same reason the island's has one. */
export function coerceAudioSnapshot(raw) {
  if (!raw || typeof raw !== 'object' || raw.v !== AUDIO_VERSION) return null;
  const duration = Number(raw.media?.duration);
  return {
    v: AUDIO_VERSION,
    at: Number(raw.at) || 0,
    playing: raw.playing === true,
    blocked: raw.blocked === true,
    count: Math.max(0, Math.floor(Number(raw.count) || 0)),
    streaming: raw.streaming === true,
    loop: raw.loop !== false,
    volume: Math.min(1, Math.max(0, Number(raw.volume) || 0)),
    title: clean(raw.title),
    subtitle: clean(raw.subtitle),
    credit: clean(raw.credit),
    media: Number.isFinite(duration) && duration > 0
      ? {
        position: Math.min(Math.max(0, Number(raw.media.position) || 0), duration),
        duration,
      }
      : null,
  };
}

/** Whether the host has stopped reporting, which means it is gone. */
export function isAudioStale(snapshot, now = Date.now(), staleMs = AUDIO_STALE_MS) {
  if (!snapshot?.at) return true;
  return now - snapshot.at > staleMs;
}
