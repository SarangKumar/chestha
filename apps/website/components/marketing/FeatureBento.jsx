import Link from 'next/link';

/**
 * The feature bento.
 *
 * Mixed-width bordered cards on one grid, the way a dense product homepage
 * lays out its features — a wide card opening each row, two narrower ones
 * beside it. `span` is the only layout knob a card has, so the grid cannot
 * drift into ad-hoc widths per card.
 *
 * Every card describes something the product actually has, and the ones behind
 * the sign-in say so in a word rather than in fine print at the bottom of the
 * page. The DSA section is absent on purpose: it is paused, and a landing page
 * should not advertise a surface the product is not shipping.
 */
const FEATURES = [
  {
    title: 'A board you arrange yourself',
    body:
      'Clock, weather, tasks, notes, a search bar — drag the widgets into the '
      + 'arrangement that suits how you work, and that is what opens in every New Tab.',
    span: 'lg:col-span-2',
    tag: 'No account',
  },
  {
    title: 'Tasks that know what day it is',
    body:
      'Due dates, repeats and a today view, with completion kept as a real '
      + 'timestamp so your history stays honest.',
    tag: 'Account',
  },
  {
    title: 'A calendar beside the work',
    body: 'Your month, your tasks and your streak on one surface, not in another tab.',
    tag: 'Account',
  },
  {
    title: 'The Grove grows while you focus',
    body:
      'Productive time earns XP, XP grows the garden. A focus timer with '
      + 'something to show for it afterwards.',
    span: 'lg:col-span-2',
    tag: 'Account',
  },
  {
    title: 'Sound, and then quiet',
    body: 'Ambient tracks mixed in the browser, with a timer that fades them out for you.',
    tag: 'Account',
  },
  {
    title: 'Read mode',
    body:
      'Swap the board for writing from people who work this way — focus, '
      + 'engineering, learning in public.',
    href: '/feed',
    tag: 'Account',
  },
  {
    title: 'Your data leaves the way it came',
    body:
      'Export and import live in Settings and are never gated, because getting '
      + 'your data out must not sit behind a sign-in. Browser storage can be '
      + 'cleared — so keep an export.',
    span: 'lg:col-span-2',
    tag: 'No account',
  },
];

export function FeatureBento() {
  return (
    <section
      className="mx-auto w-full max-w-6xl px-4 pb-14 sm:px-6 sm:pb-20"
      aria-labelledby="features-heading"
    >
      <div className="mb-8 max-w-xl sm:mb-10">
        <p className="chestha-eyebrow mb-3">The workspace</p>
        <h2 id="features-heading" className="chestha-section-title text-balance text-ink">
          Everything in one tab, and nothing you did not put there.
        </h2>
        <p className="mt-3 text-pretty text-card leading-relaxed text-ink-muted">
          Chestha is one workspace with a handful of sections, not a suite. You
          choose which of them you ever open.
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((feature) => {
          const inner = (
            <>
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-page text-balance font-semibold text-ink">{feature.title}</h3>
                <span className="chestha-chip shrink-0">
                  <span className="chestha-chip-dot" aria-hidden />
                  {feature.tag}
                </span>
              </div>
              <p className="mt-2.5 text-pretty text-card leading-relaxed text-ink-muted">
                {feature.body}
              </p>
            </>
          );

          const shell = 'flex h-full flex-col rounded-card border border-line bg-surface p-5 sm:p-6';

          return (
            <li key={feature.title} className={feature.span ?? ''}>
              {feature.href ? (
                <Link
                  href={feature.href}
                  className={`${shell} transition-colors duration-150 hover:border-line-strong hover:bg-hover`}
                >
                  {inner}
                </Link>
              ) : (
                <div className={shell}>{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
