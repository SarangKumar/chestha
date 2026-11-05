import { CHROME_STORE_URL } from '@chestha/core';
import Link from 'next/link';
import { Button } from '../ui/Button';

/**
 * The closing call to action.
 *
 * It repeats the hero's headline on purpose — that is how the page this layout
 * follows ends, and someone who has scrolled the whole way should be asked the
 * same question in the same words rather than a new one.
 *
 * Centred, unlike the hero: there is nothing beside it to align to.
 */
export function ClosingCta() {
  return (
    <section
      className="relative isolate overflow-hidden border-t border-line"
      aria-labelledby="closing-heading"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-pattern-vignette" />

      <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-16 text-center sm:px-6 sm:py-20">
        <p className="chestha-eyebrow mb-3">Still here?</p>

        <h2 id="closing-heading" className="chestha-section-title max-w-2xl text-balance text-ink">
          Where your browser becomes a workspace.
        </h2>

        <p className="mt-4 max-w-md text-pretty text-card leading-relaxed text-ink-muted">
          Add it to Chrome and your next New Tab is the board. An account is only
          for the sections that sync.
        </p>

        <div className="mt-8 flex w-full max-w-[420px] flex-col gap-3">
          <Button
            href={CHROME_STORE_URL}
            external
            variant="default"
            size="lg"
            className="chestha-cta"
          >
            Add to Chrome
          </Button>
          <Button href="/signup" variant="outline" size="lg" className="chestha-cta">
            Create an account
          </Button>
        </div>

        <p className="mt-5 text-card text-ink-muted">
          Prefer to look around first?{' '}
          <Link href="/guide" className="font-medium text-ink underline hover:no-underline">
            Read the guide
          </Link>
        </p>
      </div>
    </section>
  );
}
