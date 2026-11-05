import { GITHUB_REPO } from '@chestha/core';
import { Icon } from './Icon';

/**
 * The four-card row under the product shot.
 *
 * The homepage this layout is modelled on puts social proof here — star
 * ratings, download counts, an award. Chestha has none of that to show, and a
 * fabricated number is the one thing a landing page must not carry. So the row
 * keeps the *shape* (a label, then four bordered cards of equal weight) and
 * fills it with claims that are true today and checkable: where the source is,
 * where the data lives, what works without an account, and where it runs.
 *
 * Deliberately no live GitHub star count, although the header has one: a badge
 * that reads "12" undersells, and one that silently disappears when the API is
 * rate-limited would leave a card with a hole in it.
 */
const CARDS = [
  {
    icon: 'github',
    title: 'Built in the open',
    note: `${GITHUB_REPO.owner}/${GITHUB_REPO.name} on GitHub`,
    href: GITHUB_REPO.href,
  },
  {
    icon: 'lock',
    title: 'Local-first',
    note: 'Your workspace data stays in your browser',
  },
  {
    icon: 'check',
    title: 'Board needs no account',
    note: 'Open your New Tab and start arranging',
  },
  {
    icon: 'monitor',
    title: 'New Tab or web app',
    note: 'The same workspace, either way',
  },
];

export function ProofCards() {
  return (
    <section
      className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-12 sm:px-6 sm:pb-16"
      aria-labelledby="proof-heading"
    >
      <h2 id="proof-heading" className="chestha-eyebrow mb-5 text-center">
        What Chestha is, in four lines
      </h2>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map((card) => {
          const body = (
            <>
              <Icon name={card.icon} className="size-5 text-ink-muted" />
              <p className="mt-3 text-card font-semibold tracking-tight text-ink">{card.title}</p>
              <p className="mt-1 text-pretty text-meta leading-relaxed text-ink-muted">{card.note}</p>
            </>
          );

          return (
            <li key={card.title}>
              {/* A card that links somewhere is an anchor; the other three are
                  not wrapped in one, so nothing looks clickable that is not. */}
              {card.href ? (
                <a
                  href={card.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-full flex-col rounded-card border border-line bg-surface p-5 transition-colors duration-150 hover:border-line-strong hover:bg-hover"
                >
                  {body}
                </a>
              ) : (
                <div className="flex h-full flex-col rounded-card border border-line bg-surface p-5">
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
