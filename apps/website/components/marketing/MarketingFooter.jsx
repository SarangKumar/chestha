import Link from 'next/link';
import { SITE_SOCIALS } from '@chestha/core';
import { MARKETING_NAV } from './nav';

/**
 * Product line, the same pages the header lists, and maker links. Buy me a
 * coffee lives in the hero, not here — one ask per page.
 */
export function MarketingFooter() {
  return (
    <footer className="mt-auto shrink-0 border-t border-line">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-8">
        <div className="space-y-1">
          <p className="text-card font-medium tracking-tight text-ink">
            Chestha{' '}
            <span className="font-mono text-meta font-normal text-ink-muted">
              v{process.env.NEXT_PUBLIC_APP_VERSION}
            </span>
          </p>
          <p className="max-w-md text-pretty text-card leading-relaxed text-ink-muted">
            Local-first personal workspace. Your widget board needs no account, and
            your workspace data stays on your own device.
          </p>
        </div>

        <nav
          className="flex flex-wrap items-center gap-x-4 gap-y-2 text-meta text-ink-muted"
          aria-label="Footer"
        >
          {MARKETING_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex min-h-8 items-center transition-colors duration-150 hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
          {SITE_SOCIALS.map((item) => (
            <a
              key={item.id}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-8 items-center transition-colors duration-150 hover:text-ink"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
