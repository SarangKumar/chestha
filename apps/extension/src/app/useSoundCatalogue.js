import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { SOUNDS, coerceAudioManifest } from '@chestha/core';
import * as tracks from '../audio/trackStore.js';

/**
 * The sound catalogue: built-ins, plus any files listed in the user's audio
 * manifest, plus the tracks they have uploaded on this device.
 *
 * Shared, and fetched once at module level, because every place that resolves a
 * preset needs the same list. Previously only the Sounds page loaded the
 * manifest, so the dashboard widget judged a preset against the built-ins alone
 * and reported the user's own sounds as unavailable. Uploaded tracks join the
 * same list for the same reason.
 */
let cache = null;
let inFlight = null;
const listeners = new Set();

function load() {
  if (cache) return Promise.resolve(cache);
  if (inFlight) return inFlight;
  inFlight = fetch('/audio/catalog.json')
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => coerceAudioManifest(data ?? {}))
    .catch(() => [])
    .then((user) => {
      cache = [...SOUNDS, ...user];
      for (const listener of listeners) listener();
      return cache;
    });
  return inFlight;
}

/** Everything resolved so far; the built-ins are available immediately. */
export function soundCatalogue() {
  return [...(cache ?? SOUNDS), ...tracks.getTrackState().sounds];
}

export function useSoundCatalogue() {
  const [manifest, setManifest] = useState(() => cache ?? SOUNDS);
  // Uploaded tracks change while the app is open — one is added or deleted —
  // so they are subscribed to rather than read once.
  const trackState = useSyncExternalStore(tracks.subscribe, tracks.getTrackState);

  useEffect(() => {
    let cancelled = false;
    const update = () => { if (!cancelled) setManifest(cache ?? SOUNDS); };
    listeners.add(update);
    load().then(update);
    tracks.loadTracks();
    return () => { cancelled = true; listeners.delete(update); };
  }, []);

  return useMemo(() => [...manifest, ...trackState.sounds], [manifest, trackState.sounds]);
}
