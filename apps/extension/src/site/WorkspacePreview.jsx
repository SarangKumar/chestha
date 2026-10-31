import { useEffect, useRef, useState } from 'react';
import { EMBED_READY } from '../app/useEmbedReady.js';

/**
 * Laptop-ratio product shot for the landing page. Embeds the real dashboard
 * (no seeded demo data) in a framed browser chrome at ~16:10.
 * Traffic lights use macOS colours; green / fullscreen opens the workspace.
 *
 * Two things here exist to stop the preview flickering.
 *
 * **It waits for the embed to say it has painted, not for `load`.** The iframe
 * `load` event fires when the document has loaded — before React mounts, before
 * the store has read IndexedDB, and before the dashboard grid has compacted.
 * Hiding the placeholder then revealed an empty canvas, and the dashboard
 * popped in afterwards. `useEmbedReady` posts {@link EMBED_READY} once the
 * workspace is genuinely on screen. `load` is kept only as a deadline, because
 * a cached build from before this handshake existed would never post at all,
 * and a placeholder that never leaves is worse than one that leaves early.
 *
 * **The iframe is mounted after the page is idle.** It boots the whole
 * application a second time, which competes with the landing's own first paint
 * if it starts immediately.
 */
export function WorkspacePreview({ onOpenWorkspace }) {
  const [ready, setReady] = useState(false);
  const [mountFrame, setMountFrame] = useState(false);
  const frameRef = useRef(null);

  // Let the hero paint before a second copy of the app starts loading.
  useEffect(() => {
    const start = () => setMountFrame(true);
    if (typeof window.requestIdleCallback === 'function') {
      // The timeout is the point: idle may never arrive on a busy page, and
      // the preview must not depend on the browser being quiet.
      const handle = window.requestIdleCallback(start, { timeout: 600 });
      return () => window.cancelIdleCallback?.(handle);
    }
    const timer = setTimeout(start, 120);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!mountFrame) return undefined;

    const onMessage = (event) => {
      // Same-origin embed: anything from elsewhere, or from another frame on
      // the page, must not be able to dismiss the placeholder.
      if (event.origin !== window.location.origin) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type === EMBED_READY) setReady(true);
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [mountFrame]);

  return (
    <section
      className="chestha-fade-up chestha-fade-up-delay-3 mx-auto w-full max-w-6xl px-4 sm:px-6"
      aria-label="Workspace preview"
    >
      <div className="overflow-hidden rounded-panel border border-line bg-surface shadow-raised">
        <div className="flex h-9 items-center gap-2 border-b border-line bg-raised px-3">
          <span className="flex items-center gap-1.5" aria-hidden>
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: '#ff5f57' }}
              title="Close"
            />
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: '#febc2e' }}
              title="Minimise"
            />
            <button
              type="button"
              onClick={() => onOpenWorkspace?.()}
              className="size-2.5 rounded-full transition-opacity duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              style={{ backgroundColor: '#28c840' }}
              aria-label="Open workspace"
              title="Open workspace"
            />
          </span>
          <div className="mx-auto flex h-6 min-w-0 max-w-md flex-1 items-center justify-center rounded-control bg-inset px-3">
            <span className="truncate text-[11px] text-ink-faint">chestha · dashboard</span>
          </div>
          <span className="w-10" aria-hidden />
        </div>

        {/* The aspect ratio is fixed, so the frame occupies its final size from
            the first paint and nothing below it moves as the embed loads. */}
        <div className="relative aspect-[16/10] w-full bg-canvas">
          {/* A quiet, honest placeholder. It deliberately does not draw a fake
              dashboard: a mocked grid never matches the real widget layout, so
              handing over to the embed looked like the content rearranging
              itself. Cross-fading one neutral surface into the real thing has
              nothing to rearrange. */}
          <div
            className={`absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-canvas transition-opacity duration-300 ${
              ready ? 'pointer-events-none opacity-0' : 'opacity-100'
            }`}
            role="status"
            aria-live="polite"
            aria-hidden={ready ? 'true' : undefined}
            aria-label={ready ? undefined : 'Loading workspace preview'}
          >
            <span
              className="size-8 animate-spin rounded-full border-2 border-line border-t-ink-muted"
              aria-hidden
            />
            <p className="text-[13px] font-medium text-ink-muted">Loading workspace…</p>
          </div>

          {mountFrame ? (
            <iframe
              ref={frameRef}
              title="Chestha workspace"
              // Read at mount rather than at module scope so this component
              // stays safe to render before the document exists.
              src={`${window.location.pathname}?embed=1#/dashboard`}
              className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-300 ${
                ready ? 'opacity-100' : 'opacity-0'
              }`}
              loading="eager"
              referrerPolicy="same-origin"
              // Deadline, not the ready signal — see the note above.
              onLoad={() => setReady(true)}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
