import { useEffect } from 'react';
import { isEmbedPreview } from './platform.js';

/** Message name the landing's `WorkspacePreview` waits for. */
export const EMBED_READY = 'chestha:ready';

/**
 * Tells the parent page that the embedded workspace is actually on screen.
 *
 * The landing preview used to hide its placeholder on the iframe's `load`
 * event, which fires when the *document* has loaded — before React mounts,
 * before `store.init()` has read IndexedDB, and before the dashboard grid has
 * compacted. The placeholder therefore disappeared to reveal an empty canvas,
 * and the real dashboard then popped in and rearranged itself. That is the
 * flicker.
 *
 * `load` cannot express "painted", so the embed has to say so itself. This
 * posts once the store reports ready *and* the browser has painted the frame
 * after that — two `requestAnimationFrame`s, because the first only means the
 * next frame is being prepared, not that anything is on screen yet.
 */
export function useEmbedReady(ready) {
  useEffect(() => {
    if (!ready || !isEmbedPreview()) return undefined;
    // Nothing to tell when this document is the top-level page.
    if (window.parent === window) return undefined;

    let outer = 0;
    let inner = 0;
    outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        // Same-origin iframe, so the parent's exact origin is the right target
        // rather than `*` — this message should not be readable by anyone who
        // frames the page from elsewhere.
        try {
          window.parent.postMessage({ type: EMBED_READY }, window.location.origin);
        } catch {
          /* a cross-origin parent cannot be messaged; the parent falls back */
        }
      });
    });

    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [ready]);
}
