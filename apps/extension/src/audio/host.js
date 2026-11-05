import { isExtensionRuntime } from '../app/platform.js';
import * as local from './engine.js';
import {
  AUDIO_COMMAND, AUDIO_KEY, AUDIO_STATE, audioSnapshotFrom, coerceAudioSnapshot, isAudioStale,
} from './protocol.js';

/**
 * Where the app asks for audio, and the single place that knows what is
 * playing.
 *
 * Two problems shaped this file, and both were about *who is allowed to
 * answer the question*:
 *
 *  - **Playback must outlive the page.** It used to live in the New Tab's own
 *    AudioContext, so typing a search into the start page killed the music.
 *    Sound is made in an offscreen document now (`src/offscreen.js`), which
 *    Chrome keeps alive independently of any tab.
 *  - **Every tab must give the same answer.** Each tab used to read its own
 *    engine, so a second New Tab said "Paused" about a mix the first was
 *    playing. An earlier attempt fixed that only for tabs that had pressed
 *    play, because the decision to use the shared host was made lazily on the
 *    first `ensureContext`. A tab that only *watched* never made it, and went
 *    on reporting its own silence. **The decision is made eagerly now**, at
 *    first use of the module, so a tab that never starts anything still reads
 *    the shared record.
 *
 * The record is `chrome.storage.local`'s `chestha.island.audio`, and it is
 * written by **whoever is actually playing** — normally the offscreen
 * document, but this module publishes it too when it has fallen back to local
 * playback. That is what makes "one source of truth" true in both modes
 * rather than only in the tidy one, and it is what the overlay on other sites
 * reads.
 *
 * Falling back is deliberate and permanent for the session: if the offscreen
 * document cannot be created or cannot be reached after retrying, this plays
 * in the page instead. Audio working is worth more than audio working in the
 * right place.
 */

/** How long to keep trying to reach a freshly created offscreen document. */
const REACH_ATTEMPTS = 6;
const REACH_DELAY_MS = 150;

/** While this page is the one playing, it keeps the shared record warm. */
const LOCAL_BEAT_MS = 1000;

/** How far behind storage may fall before a watching page writes for it. */
const MIRROR_AFTER_MS = 3000;

let decided = null;      // 'offscreen' | 'local', chosen on first use
let snapshot = null;     // the shared record, as last seen
let listening = false;
let localBeat = null;
let localMix = {};
let localVolume = 0.6;
let localLoop = true;
let localCatalogue = [];
/** The `at` of the record as last *seen in storage*, not as last received. */
let storedAt = 0;

const listeners = new Set();
const emit = () => { for (const listener of listeners) listener(); };
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const canOffscreen = () => {
  try {
    return isExtensionRuntime() && Boolean(chrome.offscreen) && Boolean(chrome.runtime?.sendMessage);
  } catch {
    return false;
  }
};

/**
 * Which mode this page is in, decided on first use rather than on first play.
 *
 * This is the fix for the second New Tab saying "Paused": deciding lazily left
 * a watching tab reading its own engine forever.
 */
function mode() {
  if (!decided) {
    decided = canOffscreen() ? 'offscreen' : 'local';
    if (decided === 'offscreen') listen();
  }
  return decided;
}

const remote = () => mode() === 'offscreen';

/**
 * The record, if whoever wrote it is still reporting.
 *
 * In `local` mode the record is this page's own and is current by
 * construction, so the staleness rule — which exists to notice that *another*
 * context went away — would only ever be wrong about it.
 */
function live() {
  if (!snapshot) return null;
  if (mode() === 'local') return snapshot;
  return isAudioStale(snapshot) ? null : snapshot;
}

function fallBackToLocal(reason) {
  if (decided === 'local') return;
  decided = 'local';
  snapshot = null;
  console.warn(`[chestha] audio host unreachable (${reason}); playing in this tab instead`);
  emit();
}

function listen() {
  if (listening || !canOffscreen()) return;
  listening = true;
  try {
    chrome.runtime.onMessage.addListener((message, sender) => {
      if (sender?.id && sender.id !== chrome.runtime.id) return false;
      if (message?.type !== AUDIO_STATE) return false;
      snapshot = coerceAudioSnapshot(message.snapshot);
      emit();
      mirror();
      return false;
    });
    // The host may have been playing since before this page existed, so its
    // last record is read rather than waited for.
    chrome.storage?.local?.get(AUDIO_KEY, (values) => {
      if (chrome.runtime.lastError) return;
      const stored = coerceAudioSnapshot(values?.[AUDIO_KEY]);
      if (stored) { snapshot = stored; storedAt = stored.at; emit(); }
    });
    // And watched, because a page in `local` mode publishes the same record:
    // every tab reads one answer whichever side is making the sound.
    chrome.storage?.onChanged?.addListener((changes, area) => {
      if (area !== 'local' || !(AUDIO_KEY in changes)) return;
      snapshot = coerceAudioSnapshot(changes[AUDIO_KEY].newValue);
      storedAt = snapshot?.at ?? 0;
      emit();
    });
  } catch {
    listening = false;
    fallBackToLocal('messaging unavailable');
  }
}

/**
 * Backs the record up to storage when storage has fallen behind.
 *
 * The overlay on other sites can only read storage — it cannot receive the
 * host's messages. So if the host's own write ever fails to land while its
 * broadcasts keep arriving here, every workspace tab knows what is playing
 * and every other page shows an empty island. That asymmetry is exactly what
 * "it works in the start tab but not on other sites" looks like, and it is
 * cheap to remove: any page that knows more than storage does writes what it
 * knows.
 *
 * Rate-limited against the host's own writes. A write of ours comes straight
 * back through `onChanged`, which moves `storedAt` forward and closes the
 * window, so this cannot run away with itself.
 */
function mirror() {
  if (!isExtensionRuntime() || !snapshot) return;
  if (Date.now() - storedAt < MIRROR_AFTER_MS) return;
  try {
    chrome.storage?.local?.set({ [AUDIO_KEY]: snapshot });
    storedAt = snapshot.at;
  } catch {
    /* storage went away under an extension reload */
  }
}

function ensureHost() {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: 'audio/ensure' }, (response) => {
        if (chrome.runtime.lastError) { resolve(false); return; }
        resolve(Boolean(response?.ok));
      });
    } catch {
      resolve(false);
    }
  });
}

function sendOnce(name, payload) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: AUDIO_COMMAND, command: name, payload }, (response) => {
        if (chrome.runtime.lastError) { resolve(null); return; }
        resolve(response ?? null);
      });
    } catch {
      resolve(null);
    }
  });
}

/**
 * Sends a command, retrying while the host is still coming up.
 *
 * `createDocument` resolves when the document exists, which is not the same
 * moment its script has registered a listener — so the first command after
 * creation could find nobody home. Treating that as "offscreen is broken" is
 * how a perfectly good host ended up abandoned on the first play.
 */
async function command(name, payload = {}) {
  for (let attempt = 0; attempt < REACH_ATTEMPTS; attempt += 1) {
    const response = await sendOnce(name, payload);
    if (response?.ok) return response;
    if (response && response.ok === false && response.reason !== 'unknown') return response;
    await wait(REACH_DELAY_MS);
  }
  return { ok: false, reason: 'unreachable' };
}

// ── publishing, when this page is the one playing ────────────────────────

/**
 * Publishes what this page is playing, when this page is the one playing.
 *
 * It sets `snapshot` as well as writing storage, and that is not an
 * optimisation: the island reads playback *only* through the record now, so a
 * page in local mode that wrote the record without keeping a copy would show
 * nothing playing while making the sound. The website build, which has no
 * `chrome` at all, depends entirely on the local half of this.
 */
function publishLocal() {
  snapshot = audioSnapshotFrom({
    engineState: local.getEngineState(),
    mix: localMix,
    catalogue: localCatalogue,
    masterVolume: localVolume,
    loop: localLoop,
    playback: localPlayback(),
  });
  emit();
  if (!isExtensionRuntime()) return;
  try {
    chrome.storage?.local?.set({ [AUDIO_KEY]: snapshot });
    storedAt = snapshot.at;
  } catch {
    /* storage went away under an extension reload */
  }
}

function localPlayback() {
  for (const id of Object.keys(localMix)) {
    const sound = localCatalogue.find((item) => item.id === id);
    if (!sound?.stream) continue;
    const at = local.playbackOf(id);
    if (at) return at;
  }
  return null;
}

/** Keeps the shared record warm while this page holds the audio. */
function beatLocally() {
  if (localBeat || mode() !== 'local') return;
  localBeat = setInterval(publishLocal, LOCAL_BEAT_MS);
}

// ── the engine surface ───────────────────────────────────────────────────

export function subscribe(listener) {
  listeners.add(listener);
  mode();
  const unsubscribeLocal = local.subscribe(() => {
    if (mode() === 'local') publishLocal();
    else emit();
  });
  return () => { listeners.delete(listener); unsubscribeLocal(); };
}

let lastState = null;

/**
 * The shape `engine.getEngineState()` returns, so nothing reading it had to
 * change — but the answer is the shared one.
 *
 * `running` is true when *anyone* is playing: the shared record if there is a
 * live one, this page's own engine otherwise. That is the single source of
 * truth the island reads, and it is why a tab that has started nothing still
 * says "Playing".
 *
 * The identity is cached, because `useSyncExternalStore` compares by
 * reference and a fresh object on every call is an infinite render loop.
 */
export function getEngineState() {
  mode();
  const shared = live();
  const own = local.getEngineState();

  const next = {
    supported: own.supported,
    running: shared ? shared.playing : own.running,
    blocked: shared ? shared.blocked : own.blocked,
    error: own.error,
    failed: own.failed,
  };

  if (
    lastState
    && lastState.running === next.running
    && lastState.blocked === next.blocked
    && lastState.error === next.error
    && lastState.failed === next.failed
    && lastState.supported === next.supported
  ) {
    return lastState;
  }
  lastState = next;
  return next;
}

/** The offscreen host resolves its own catalogue; this is for local playback. */
export function setCatalogue(sounds) {
  localCatalogue = Array.isArray(sounds) ? sounds : [];
  local.setCatalogue(localCatalogue);
}

export async function ensureContext() {
  if (mode() === 'local') return local.ensureContext();

  const ok = await ensureHost();
  if (!ok) {
    fallBackToLocal('the offscreen document could not be created');
    return local.ensureContext();
  }
  return true;
}

export async function applyMix(mix, masterVolume) {
  localMix = mix ?? {};
  localVolume = typeof masterVolume === 'number' ? masterVolume : localVolume;

  if (mode() === 'local') {
    await local.applyMix(mix, masterVolume);
    publishLocal();
    beatLocally();
    return undefined;
  }

  const result = await command('play', { mix, volume: masterVolume, loop: localLoop });
  if (!result.ok) {
    // `blocked` means the host has a context it cannot start. Local playback
    // begins from a real user gesture and may well succeed, so it is worth
    // trying rather than reporting silence.
    fallBackToLocal(result.reason ?? 'the host could not start');
    await local.ensureContext();
    await local.applyMix(mix, masterVolume);
    publishLocal();
    beatLocally();
  }
  return undefined;
}

export async function pause() {
  if (mode() === 'local') { await local.pause(); publishLocal(); return; }
  await command('pause');
}

export function stopAll() {
  localMix = {};
  if (mode() === 'local') {
    local.stopAll();
    publishLocal();
    return;
  }
  command('stop');
}

export function setMasterVolume(mix, masterVolume) {
  localVolume = typeof masterVolume === 'number' ? masterVolume : localVolume;
  if (mode() === 'local') { local.setMasterVolume(mix, masterVolume); return; }
  command('volume', { volume: masterVolume });
}

export function setLoopTracks(enabled) {
  localLoop = enabled !== false;
  local.setLoopTracks(enabled);
  if (mode() === 'offscreen') command('loop', { loop: enabled });
}

export function playbackOf(id) {
  const shared = live();
  if (shared) return shared.media ? { currentTime: shared.media.position, duration: shared.media.duration } : null;
  return local.playbackOf(id);
}

export function seek(id, seconds) {
  if (mode() === 'local') return local.seek(id, seconds);
  command('seek', { id, seconds });
  return true;
}

/**
 * Resumes whatever was last playing, without naming it again.
 *
 * The Grove uses this to bring back a session mix it paused. Remotely it is a
 * `play` with no mix: the host still holds the last one, which is the point of
 * it outliving the page.
 */
export async function resume() {
  if (mode() === 'local') return local.resume();
  const result = await command('play', {});
  return Boolean(result.ok);
}

/**
 * Whether anything is audible anywhere — what `activeVoiceIds().length > 0`
 * was really asking, and now a question about every tab rather than this one.
 */
export function isPlaying() {
  const shared = live();
  if (shared) return shared.playing;
  return local.activeVoiceIds().length > 0;
}

/** Local only: the shared record does not carry voice identity. */
export const activeVoiceIds = local.activeVoiceIds;

/** The end-of-session chime is a half-second tone and belongs in this page. */
export const chime = local.chime;

/**
 * What is playing, as the island draws it, or null when nothing is.
 *
 * An empty mix is nothing: the host keeps reporting after a stop — that is
 * how a reader tells "stopped" from "the host is gone" — and a record with no
 * sounds in it must not put a player on screen.
 */
export function audioSnapshot() {
  const current = live();
  return current && current.count > 0 ? current : null;
}

/** Whether the sound outlives this page. False when it has fallen back. */
export const playsInBackground = () => mode() === 'offscreen';
