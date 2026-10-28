import { Button } from '@/components/ui/button';
import { BrandMark } from './BrandMark.jsx';
import { MarketingHeader } from './MarketingHeader.jsx';
import { MarketingFooter } from './MarketingFooter.jsx';
import { WorkspacePreview } from './WorkspacePreview.jsx';
import { BuyMeCoffeeButton } from '../components/BuyMeCoffeeButton.jsx';
import { CHROME_STORE_URL } from '../siteLinks.js';

const CHIPS = [
  { label: 'Local-first · no account' },
  { label: 'Tasks · calendar · Grove' },
  { label: 'Your New Tab, if you want it' },
];

/**
 * Website-only marketing landing. Structure mirrors Aavedak's calm hero
 * (mark, title, tagline, chips, CTAs) then a large laptop-ratio workspace
 * preview — not a seeded demo. Hero CTAs: Buy me a coffee + Add to Chrome.
 */
export function Landing({ onNavigate }) {
  const addToChrome = () => {
    if (!CHROME_STORE_URL || CHROME_STORE_URL === '#') {
      onNavigate?.('dashboard');
      return;
    }
    window.open(CHROME_STORE_URL, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="relative flex min-h-dvh flex-col bg-canvas text-ink">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(ellipse_at_top,var(--app-surface-raised),transparent_60%)] opacity-80"
      />
      <MarketingHeader onNavigate={onNavigate} />

      <main className="relative flex min-h-0 flex-1 flex-col gap-10 pb-12 pt-8 sm:gap-14 sm:pb-16 sm:pt-12 lg:gap-16 lg:pt-14">
        <section
          className="chestha-fade-up mx-auto flex w-full max-w-6xl flex-col items-center px-4 text-center sm:px-6"
          aria-labelledby="hero-heading"
        >
          <div className="relative mb-5 sm:mb-6">
            <span className="chestha-logo-glow" aria-hidden />
            <BrandMark
              width={96}
              height={96}
              className="relative h-[4.5rem] w-[4.5rem] sm:h-24 sm:w-24"
              alt=""
            />
          </div>

          <p className="mb-1.5 font-mono text-[13px] tracking-wide text-primary/90 sm:mb-2">
            चेष्टा
          </p>

          <h1
            id="hero-heading"
            className="chestha-display text-3xl leading-none text-foreground sm:text-5xl md:text-6xl"
          >
            Chestha
          </h1>

          <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
            Focus · Arrange · Grow
          </p>

          <p className="mt-3.5 max-w-md text-balance text-[15px] leading-relaxed text-muted-foreground sm:mt-4 sm:text-base">
            Your personal workspace in the browser.
            <br className="hidden sm:block" /> Tasks, a calendar, a focus garden —
            local-first, no account.
          </p>

          <div className="chestha-fade-up chestha-fade-up-delay-1 mt-4 flex max-w-md flex-wrap items-center justify-center gap-1.5 sm:mt-5 sm:max-w-none">
            {CHIPS.map((chip) => (
              <span key={chip.label} className="chestha-chip">
                <span className="chestha-chip-dot" aria-hidden />
                {chip.label}
              </span>
            ))}
          </div>

          <div className="chestha-fade-up chestha-fade-up-delay-2 mt-6 flex w-full max-w-sm flex-col items-stretch gap-2 sm:mt-8 sm:max-w-none sm:flex-row sm:items-center sm:justify-center">
            <BuyMeCoffeeButton size="lg" variant="default" className="h-10 min-h-10 max-h-10 px-6" />
            <Button size="lg" variant="outline" type="button" onClick={addToChrome}>
              Add to Chrome
            </Button>
          </div>
        </section>

        <WorkspacePreview onOpenWorkspace={() => onNavigate?.('dashboard')} />
      </main>

      <MarketingFooter onNavigate={onNavigate} />
    </div>
  );
}
