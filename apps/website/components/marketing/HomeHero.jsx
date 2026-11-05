import { CHROME_STORE_URL } from '@chestha/core';
import Link from 'next/link';
import { BrandMark } from './BrandMark';
import { BuyMeCoffeeButton } from '../BuyMeCoffeeButton';
import { Button } from '../ui/Button';

/**
 * The landing hero.
 *
 * The shape is borrowed from a dense developer-product homepage: a patterned
 * band, one oversized left-aligned headline, short subcopy, then a *stacked*
 * column of full-width calls to action with the legal-weight note and the
 * sign-in line underneath — rather than the centred mark-over-title hero this
 * page used to share with the extension's `site/Landing.jsx`.
 *
 * Two things are deliberate and easy to undo by accident:
 *
 *  - **It is left-aligned from `md` up and centred below it.** A 3.5rem
 *    headline centred on a phone breaks into a ragged block; the same headline
 *    left-aligned on a wide viewport is the one thing the page is about.
 *  - **It renders the same for everyone.** No session is read here, for the
 *    reason the page always had: the hero is what the product *is*, which does
 *    not change once you have an account, and the header already says who you
 *    are. `/signup` simply shows a signed-in visitor their account.
 *
 * The copy under the buttons is the gating policy in one line. It is the one
 * claim on this page that would become a lie if `OPEN_SECTIONS` changed, so it
 * says which surfaces are free rather than "no account needed".
 */
export function HomeHero() {
  return (
    <section
      className="relative isolate overflow-hidden border-b border-line"
      aria-labelledby="hero-heading"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-pattern-glow" />
      <div aria-hidden className="chestha-hero-band bg-pattern-grid" />

      <div className="relative mx-auto w-full max-w-6xl px-4 pt-12 pb-10 sm:px-6 sm:pt-16 sm:pb-14 lg:pt-20 lg:pb-16">
        <div className="chestha-fade-up flex flex-col items-center text-center md:max-w-2xl md:items-start md:text-left">
          <div className="mb-5 flex items-center gap-2.5">
            <BrandMark width={40} height={40} alt="" className="size-10" />
            <span className="font-mono text-meta tracking-wide text-ink-muted">चेष्टा</span>
            <span aria-hidden className="h-3 w-px bg-line" />
            <span className="chestha-eyebrow">Focus · Arrange · Grow</span>
          </div>

          <h1 id="hero-heading" className="chestha-hero-title text-balance text-ink">
            Where your browser becomes a workspace.
          </h1>

          <p className="mt-4 max-w-xl text-pretty text-base leading-relaxed text-ink-muted sm:mt-5 sm:text-lg">
            Tasks, a calendar, a focus garden and ambient sound, on a board you
            arrange yourself. Local-first: your workspace data lives in this
            browser, on your own device.
          </p>

          <div className="chestha-fade-up chestha-fade-up-delay-1 mt-7 w-full max-w-[420px] sm:mt-8">
            <div className="flex flex-col gap-3">
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
              <BuyMeCoffeeButton size="lg" variant="ghost" className="chestha-cta" />
            </div>

            <p className="mt-4 text-pretty text-center text-meta leading-relaxed text-ink-faint md:text-left">
              The widget board and Settings work with no account. Tasks, the
              calendar, the Grove, Sounds and Read mode need one.
            </p>

            <p className="mt-3 text-center text-card text-ink-muted md:text-left">
              Already have an account?{' '}
              <Link href="/signin" className="font-medium text-ink underline hover:no-underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
