import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CHROME_STORE_URL } from '@chestha/core';
import { Button } from '../ui/Button';

const SHOT = 'workspace-preview.png';

/**
 * Laptop-ratio product shot for the landing.
 *
 * The extension's version of this embedded the real dashboard in an iframe and
 * waited for the app to post that it had painted. That cannot work here: the
 * workspace is a different application that this site does not serve, so there
 * is nothing same-origin to frame.
 *
 * So this renders a screenshot if one exists at `public/workspace-preview.png`,
 * and an honest panel if it does not. It deliberately does not draw a mock
 * dashboard — a fake grid never matches the real widget layout, and a product
 * shot that misrepresents the product is worse than no shot. Drop a real
 * capture at that path and it appears with no code change.
 *
 * The frame keeps its aspect ratio either way, so nothing below it moves.
 */
export function WorkspacePreview() {
  const hasShot = existsSync(join(process.cwd(), 'public', SHOT));

  return (
    <section
      className="chestha-fade-up chestha-fade-up-delay-3 mx-auto w-full max-w-6xl px-4 sm:px-6"
      aria-label="Workspace preview"
    >
      <div className="overflow-hidden rounded-panel border border-line bg-surface shadow-raised">
        <div className="flex h-9 items-center gap-2 border-b border-line bg-raised px-3">
          <span className="flex items-center gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full" style={{ backgroundColor: '#ff5f57' }} />
            <span className="size-2.5 rounded-full" style={{ backgroundColor: '#febc2e' }} />
            <span className="size-2.5 rounded-full" style={{ backgroundColor: '#28c840' }} />
          </span>
          <div className="mx-auto flex h-6 min-w-0 max-w-md flex-1 items-center justify-center rounded-control bg-inset px-3">
            <span className="truncate text-meta text-ink-faint">chestha · dashboard</span>
          </div>
          <span className="w-10" aria-hidden />
        </div>

        <div className="relative aspect-[16/10] w-full bg-canvas">
          {hasShot ? (
            <img
              src={`/${SHOT}`}
              alt="The Chestha dashboard: a grid of widgets including today's tasks, a clock, weather and a focus garden."
              className="absolute inset-0 h-full w-full object-cover object-top"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
              <p className="max-w-sm text-balance text-card leading-relaxed text-ink-muted">
                The workspace opens in your New Tab — a board you arrange yourself,
                with tasks, a calendar, a focus garden and ambient sound.
              </p>
              <Button href={CHROME_STORE_URL} external variant="outline" size="lg">
                Add to Chrome
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
