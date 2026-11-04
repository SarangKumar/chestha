import Link from 'next/link';
import { GUIDE_NOTES, GUIDE_PAGES, WIDGET_CATALOGUE } from '@chestha/core';

export const metadata = {
  title: 'Guide',
  description:
    'A map of every Chestha section and every dashboard widget, in short descriptions.',
};

/**
 * What is in Chestha — sections first, then every dashboard widget.
 *
 * The widget list comes from `WIDGET_CATALOGUE` rather than from the registry
 * that defines them: the registry is JSX bound to the workspace store and
 * cannot be imported into a server-rendered page. `widget-catalogue.test.js`
 * asserts the two still agree, which is what keeps this page from quietly
 * describing widgets that no longer exist.
 */
export default function GuidePage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-10 px-4 py-10 sm:space-y-12 sm:px-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          What&rsquo;s in Chestha
        </h1>
        <p className="max-w-2xl text-card leading-relaxed text-ink-muted">
          A map of the site pages, workspace sections, and dashboard widgets — short
          descriptions only. For privacy and maker notes see{' '}
          <Link
            href="/about"
            className="font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
          >
            About
          </Link>
          .
        </p>
      </header>

      <section className="space-y-4" aria-labelledby="guide-pages">
        <div className="space-y-1">
          <h2 id="guide-pages" className="text-xl font-semibold tracking-tight text-ink">
            Pages &amp; sections
          </h2>
          <p className="text-card text-ink-muted">
            Hash routes inside the workspace. The extension New Tab opens the board
            and hides marketing chrome.
          </p>
        </div>
        <ul className="divide-y divide-line rounded-panel border border-line bg-surface/40">
          {GUIDE_PAGES.map((page) => (
            <li key={page.id} className="flex flex-col gap-1 px-4 py-3.5 sm:flex-row sm:gap-6 sm:px-5">
              <div className="sm:w-44 sm:shrink-0">
                <p className="text-card font-semibold text-ink">{page.title}</p>
                <p className="mt-0.5 font-mono text-meta text-ink-faint">{page.route}</p>
                <p className="mt-1 text-meta font-medium tracking-wide uppercase text-ink-faint">
                  {page.where}
                </p>
              </div>
              <p className="min-w-0 flex-1 text-card leading-relaxed text-ink-muted">
                {page.blurb}
              </p>
            </li>
          ))}
        </ul>
        <ul className="space-y-1.5 text-card leading-relaxed text-ink-faint">
          {GUIDE_NOTES.map((note) => (
            <li key={note} className="flex gap-2">
              <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-ink-faint" />
              <span>{note}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4" aria-labelledby="guide-widgets">
        <div className="space-y-1">
          <h2 id="guide-widgets" className="text-xl font-semibold tracking-tight text-ink">
            Dashboard widgets
          </h2>
          <p className="text-card text-ink-muted">
            Add these from Edit on the dashboard. Names match the picker.
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {WIDGET_CATALOGUE.map((widget) => (
            <li key={widget.type} className="rounded-panel border border-line bg-surface/40 px-4 py-3.5">
              <p className="text-card font-semibold text-ink">{widget.name}</p>
              <p className="mt-1 font-mono text-[10px] text-ink-faint">{widget.type}</p>
              <p className="mt-2 text-card leading-relaxed text-ink-muted">
                {widget.description}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
