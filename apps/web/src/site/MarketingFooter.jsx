import { SITE_SOCIALS } from '../siteLinks.js';
import { BuyMeCoffeeButton } from '../components/BuyMeCoffeeButton.jsx';

/**
 * Website marketing footer — Aavedak-simple: product line, About, Changelog,
 * socials, Buy me a coffee button. Parent landing uses min-h-dvh flex-col +
 * mt-auto so this sticks to the viewport bottom when the hero is short.
 */
export function MarketingFooter({ onNavigate }) {
  return (
    <footer className="mt-auto shrink-0 border-t border-border/60">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-8">
        <div className="space-y-1">
          <p className="text-[13px] font-medium tracking-tight text-foreground/90">
            Chestha{' '}
            <span className="font-mono text-[11px] font-normal text-muted-foreground">
              v{__APP_VERSION__}
            </span>
          </p>
          <p className="max-w-md text-pretty text-[13px] leading-relaxed text-muted-foreground">
            Local-first personal workspace. No account. Data stays on this device.
          </p>
        </div>
        <nav
          className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-muted-foreground"
          aria-label="Footer"
        >
          <button
            type="button"
            onClick={() => onNavigate?.('about')}
            className="inline-flex min-h-8 items-center transition-colors duration-150 hover:text-foreground"
          >
            About
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.('changelog')}
            className="inline-flex min-h-8 items-center transition-colors duration-150 hover:text-foreground"
          >
            Changelog
          </button>
          {SITE_SOCIALS.map((item) => (
            <a
              key={item.id}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-8 items-center transition-colors duration-150 hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
          <BuyMeCoffeeButton size="xs" variant="outline" />
        </nav>
      </div>
    </footer>
  );
}
