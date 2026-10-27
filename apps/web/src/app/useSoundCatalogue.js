import { useEffect, useState } from 'react';
import { SOUNDS, coerceAudioManifest } from '@kalpvan/core';

/**
 * The sound catalogue: built-ins plus any files listed in the user's audio
 * manifest.
 *
 * Shared, and fetched once at module level, because every place that resolves a
 * preset needs the same list. Previously only the Sounds page loaded the
 * manifest, so the dashboard widget judged a preset against the built-ins alone
 * and reported the user's own sounds as unavailable.
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
  return cache ?? SOUNDS;
}

export function useSoundCatalogue() {
  const [catalogue, setCatalogue] = useState(() => cache ?? SOUNDS);

  useEffect(() => {
    let cancelled = false;
    const update = () => { if (!cancelled) setCatalogue(cache ?? SOUNDS); };
    listeners.add(update);
    load().then(update);
    return () => { cancelled = true; listeners.delete(update); };
  }, []);

  return catalogue;
}
