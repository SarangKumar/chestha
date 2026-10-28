import { SITE_SOCIALS } from '../siteLinks.js';

/**
 * Website-only footer: About + maker socials. Not mounted in the extension New
 * Tab, where a marketing strip would clutter every new tab.
 */
export function SiteFooter({ onNavigate }) {
  return (
    <footer className="mt-auto border-t border-line px-4 py-6 pb-28 sm:px-6 sm:pb-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-meta leading-relaxed text-ink-faint">
          Chestha · local-first ·{' '}
          <button
            type="button"
            onClick={() => onNavigate?.('about')}
            className="font-medium text-ink-muted underline decoration-line-strong underline-offset-2 transition-colors duration-150 hover:text-ink hover:decoration-ink"
          >
            About
          </button>
        </p>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {SITE_SOCIALS.map((item) => (
            <li key={item.id}>
              <a
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-meta font-medium text-ink-muted transition-colors duration-150 hover:text-ink"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
