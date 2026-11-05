import { MAX_TRACKS, coerceTrackList, editTrack, trackToSound, validateTrackFile } from '@chestha/core';

/**
 * Storage for the user's own audio files: the bytes in IndexedDB, the credit
 * metadata beside them, and a blob URL per track for the audio engine to play.
 *
 * ## Why its own database
 *
 * `packages/core/src/storage.js` owns the `chestha` database at version 1, one
 * record per state area. Adding an object store there would mean bumping that
 * version, and an upgrade is blocked while an older tab holds the database
 * open — `openStorage` treats `onblocked` as a failure and falls back to
 * in-memory storage, so a user with a second tab open would silently stop
 * persisting their whole workspace. A separate database at its own version
 * cannot do that to them.
 *
 * ## Why these never sync
 *
 * The metadata lives here, next to the bytes, rather than in the synced `sound`
 * area. Audio files are far too large to push to the server, and syncing the
 * metadata alone would hand another device a list of tracks it can name and
 * never play. A track belongs to the machine it was added on. Presets that
 * name one do sync, and `applyPreset` already reports sounds it cannot resolve.
 */

const DB_NAME = 'chestha-audio';
const DB_VERSION = 1;
const TRACKS = 'tracks';
const BLOBS = 'blobs';

let state = {
  ready: false,
  tracks: [],
  sounds: [],       // catalogue entries, blob URLs resolved
  error: null,
  available: true,  // false when IndexedDB is unusable in this window
};

const listeners = new Set();
const urls = new Map();   // track id -> blob URL
let inFlight = null;

const emit = () => { for (const listener of listeners) listener(); };

function setState(patch) {
  state = { ...state, ...patch };
  emit();
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getTrackState = () => state;

function openDatabase() {
  return new Promise((resolve, reject) => {
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TRACKS)) db.createObjectStore(TRACKS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('The audio library could not be opened.'));
    request.onblocked = () => reject(new Error('Another tab is holding the audio library open.'));
  });
}

let dbPromise = null;

function database() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('This browser does not expose IndexedDB.'));
  }
  if (!dbPromise) {
    dbPromise = openDatabase().catch((error) => {
      dbPromise = null;   // let a later attempt try again
      throw error;
    });
  }
  return dbPromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('The audio library request failed.'));
  });
}

/** Runs `work` in one transaction over both stores, so bytes and metadata move together. */
async function transact(mode, work) {
  const db = await database();
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction([TRACKS, BLOBS], mode);
    } catch (error) {
      reject(error);
      return;
    }
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error ?? new Error('The audio library transaction was aborted.'));
    tx.onerror = () => reject(tx.error ?? new Error('The audio library transaction failed.'));
    Promise.resolve(work(tx.objectStore(TRACKS), tx.objectStore(BLOBS)))
      .then((value) => { result = value; })
      .catch((error) => { try { tx.abort(); } catch { /* already aborting */ } reject(error); });
  });
}

/**
 * A blob URL per track, created once and reused.
 *
 * The URL is what the engine plays from, and it is valid only in this document,
 * so it is created here rather than stored. Revoking it is the only way to let
 * the blob be collected, which `forget` below does on delete.
 */
function urlFor(id, blob) {
  const existing = urls.get(id);
  if (existing) return existing;
  const url = URL.createObjectURL(blob);
  urls.set(id, url);
  return url;
}

function forget(id) {
  const url = urls.get(id);
  if (!url) return;
  urls.delete(id);
  // The engine fades a voice out over ~130ms before releasing its nodes, so
  // revoking immediately could pull the blob out from under an element that is
  // still winding down. A short delay costs nothing and keeps the fade clean.
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function resolve(tracks) {
  return tracks
    .map((track) => {
      const url = urls.get(track.id);
      return url ? trackToSound(track, url) : null;
    })
    .filter(Boolean);
}

/** Reads every track and its bytes, and publishes the resolved catalogue. */
export function loadTracks() {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const records = await transact('readonly', async (tracks, blobs) => {
        const stored = coerceTrackList(await requestToPromise(tracks.getAll()));
        const out = [];
        for (const track of stored) {
          const blob = await requestToPromise(blobs.get(track.id));
          // Metadata with no bytes is a half-finished write from an interrupted
          // add. It is not playable, so it is not offered; `removeTrack` on the
          // same id would clear it.
          if (blob instanceof Blob) out.push({ track, blob });
        }
        return out;
      });
      for (const { track, blob } of records) urlFor(track.id, blob);
      const tracks = records.map((r) => r.track);
      setState({ ready: true, available: true, error: null, tracks, sounds: resolve(tracks) });
    } catch (error) {
      setState({
        ready: true,
        available: false,
        tracks: [],
        sounds: [],
        error: error?.message ?? 'The audio library is unavailable in this browser window.',
      });
    }
    return state;
  })();
  return inFlight;
}

/**
 * Stores one picked file.
 *
 * The file is validated before any of it is read, and the bytes and metadata
 * are written in a single transaction so a failure cannot leave a track that
 * names a file it does not have.
 *
 * @returns {Promise<{ok: true, track: object} | {ok: false, error: string}>}
 */
export async function addTrack(file) {
  const checked = validateTrackFile(file, state.tracks.map((t) => t.id));
  // `full` lets a caller adding several files stop at the cap and report it
  // once, instead of repeating the same refusal for every remaining file.
  if (!checked.ok) return { ...checked, full: state.tracks.length >= MAX_TRACKS };

  const { draft } = checked;
  try {
    await transact('readwrite', async (tracks, blobs) => {
      await requestToPromise(blobs.put(file, draft.id));
      await requestToPromise(tracks.put(draft));
    });
  } catch (error) {
    return { ok: false, error: describeFailure(error) };
  }

  urlFor(draft.id, file);
  const next = [...state.tracks, draft];
  setState({ tracks: next, sounds: resolve(next), error: null });
  return { ok: true, track: draft };
}

/** Saves edited credit fields. The bytes are untouched. */
export async function updateTrack(id, patch) {
  const current = state.tracks.find((t) => t.id === id);
  if (!current) return { ok: false, error: 'That track no longer exists.' };

  const edited = editTrack(current, patch);
  if (!edited.ok) return edited;

  try {
    await transact('readwrite', (tracks) => requestToPromise(tracks.put(edited.track)));
  } catch (error) {
    return { ok: false, error: describeFailure(error) };
  }

  const next = state.tracks.map((t) => (t.id === id ? edited.track : t));
  setState({ tracks: next, sounds: resolve(next) });
  return { ok: true, track: edited.track };
}

/**
 * Deletes a track and its bytes.
 *
 * The record is returned so the caller can offer an undo — but undo has to
 * re-add the file, which is why the UI asks for confirmation instead. Bytes
 * cannot be resurrected from metadata.
 */
export async function removeTrack(id) {
  try {
    await transact('readwrite', async (tracks, blobs) => {
      await requestToPromise(tracks.delete(id));
      await requestToPromise(blobs.delete(id));
    });
  } catch (error) {
    return { ok: false, error: describeFailure(error) };
  }
  forget(id);
  const next = state.tracks.filter((t) => t.id !== id);
  setState({ tracks: next, sounds: resolve(next) });
  return { ok: true };
}

function describeFailure(error) {
  if (error?.name === 'QuotaExceededError') {
    return 'There is no room left for another track. Remove one, or free up disk space.';
  }
  return error?.message ?? 'The track could not be saved.';
}

/** Total bytes held by the library, for the storage note in the UI. */
export function libraryBytes(tracks = state.tracks) {
  return tracks.reduce((total, track) => total + (track.bytes ?? 0), 0);
}
