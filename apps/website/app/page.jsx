import { CHROME_STORE_URL } from '@chestha/core';
import { BrandMark } from '@/components/marketing/BrandMark';
import { WorkspacePreview } from '@/components/marketing/WorkspacePreview';
import { BuyMeCoffeeButton } from '@/components/BuyMeCoffeeButton';
import { Button } from '@/components/ui/Button';

const CHIPS = [
  'Your board, no account',
  'Tasks · calendar · Grove',
  'Your New Tab, if you want it',
];

/**
 * The landing.
 *
 * Ported from `apps/extension/src/site/Landing.jsx`, which still renders it in
 * the Vite build. The structure is deliberately identical — mark, title,
 * tagline, chips, two CTAs, then a laptop-ratio product shot — because this is
 * the page people have seen.
 *
 * It renders the same for everyone, signed in or out, and so reads no session.
 * The hero is what the product is, which does not change once you have an
 * account — and the header already says who you are, so saying it again here
 * only pushed the product shot further down the page.
 */
export default function HomePage() {
  return (
    <div className="relative flex flex-col">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(ellipse_at_top,var(--app-surface-raised),transparent_60%)] opacity-80"
      />

      <div className="relative flex flex-col gap-10 pt-8 pb-12 sm:gap-14 sm:pt-12 sm:pb-16 lg:gap-16 lg:pt-14">
        <section
          className="chestha-fade-up mx-auto flex w-full max-w-6xl flex-col items-center px-4 text-center sm:px-6"
          aria-labelledby="hero-heading"
        >
          <div className="relative mb-5 sm:mb-6">
            <span className="chestha-logo-glow" aria-hidden />
            <BrandMark
              width={96}
              height={96}
              alt=""
              className="relative h-[4.5rem] w-[4.5rem] sm:h-24 sm:w-24"
            />
          </div>

          <p className="mb-1.5 font-mono text-meta tracking-wide text-ink-muted sm:mb-2">
            चेष्टा
          </p>

          <h1 id="hero-heading" className="chestha-display text-3xl leading-none text-ink sm:text-5xl md:text-6xl">
            Chestha
          </h1>

          <p className="mt-1.5 text-meta font-medium tracking-wide uppercase text-ink-muted">
            Focus · Arrange · Grow
          </p>

          <p className="mt-3.5 max-w-md text-balance text-card leading-relaxed text-ink-muted sm:mt-4">
            Your personal workspace in the browser.
            <br className="hidden sm:block" /> Tasks, a calendar, a focus garden —
            local-first, on your own device.
          </p>

          <div className="chestha-fade-up chestha-fade-up-delay-1 mt-4 flex max-w-md flex-wrap items-center justify-center gap-1.5 sm:mt-5 sm:max-w-none">
            {CHIPS.map((chip) => (
              <span key={chip} className="chestha-chip">
                <span className="chestha-chip-dot" aria-hidden />
                {chip}
              </span>
            ))}
          </div>

          <div className="chestha-fade-up chestha-fade-up-delay-2 mt-6 flex w-full max-w-sm flex-col items-stretch gap-2 sm:mt-8 sm:max-w-none sm:flex-row sm:items-center sm:justify-center">
            <BuyMeCoffeeButton size="lg" variant="default" />
            <Button href={CHROME_STORE_URL} external variant="outline" size="lg">
              Add to Chrome
            </Button>
          </div>
        </section>

        <WorkspacePreview />
      </div>
    </div>
  );
}
