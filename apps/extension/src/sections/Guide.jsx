import { WIDGETS, WIDGET_TYPES } from '../widgets/registry.jsx';
import { GUIDE_NOTES, GUIDE_PAGES } from '../site/guideContent.js';

/**
 * Website Guide — what pages exist and what widgets do. Marketing chrome only.
 */
export function Guide({ onNavigate }) {
  const widgets = WIDGET_TYPES.map((type) => {
    const def = WIDGETS[type];
    return {
      type,
      name: def?.name ?? type,
      description: def?.description ?? '',
    };
  });

  return (
    <div className="space-y-10 sm:space-y-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          What&rsquo;s in Chestha
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-ink-muted">
          A map of the site pages, workspace sections, and dashboard widgets —
          short descriptions only. For privacy and maker notes see{' '}
          <button
            type="button"
            onClick={() => onNavigate?.('about')}
            className="font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
          >
            About
          </button>
          .
        </p>
      </header>

      <section className="space-y-4" aria-labelledby="guide-pages">
        <div className="space-y-1">
          <h2 id="guide-pages" className="text-xl font-semibold tracking-tight text-ink">
            Pages &amp; sections
          </h2>
          <p className="text-sm text-ink-muted">
            Hash routes on the website. The extension New Tab opens the workspace
            and hides marketing chrome.
          </p>
        </div>
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface/40">
          {GUIDE_PAGES.map((page) => (
            <li key={page.id} className="flex flex-col gap-1 px-4 py-3.5 sm:flex-row sm:gap-6 sm:px-5">
              <div className="sm:w-44 sm:shrink-0">
                <button
                  type="button"
                  onClick={() => onNavigate?.(page.id === 'home' ? 'home' : page.id)}
                  className="text-left text-sm font-semibold text-ink underline decoration-transparent underline-offset-2 transition-colors hover:decoration-line-strong"
                >
                  {page.title}
                </button>
                <p className="mt-0.5 font-mono text-[11px] text-ink-faint">{page.route}</p>
                <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                  {page.where}
                </p>
              </div>
              <p className="min-w-0 flex-1 text-[14px] leading-relaxed text-ink-muted">
                {page.blurb}
              </p>
            </li>
          ))}
        </ul>
        <ul className="space-y-1.5 text-[13px] leading-relaxed text-ink-faint">
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
          <p className="text-sm text-ink-muted">
            Add these from Edit on the dashboard. Names match the picker.
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {widgets.map((widget) => (
            <li
              key={widget.type}
              className="rounded-xl border border-line bg-surface/40 px-4 py-3.5"
            >
              <p className="text-sm font-semibold text-ink">{widget.name}</p>
              <p className="mt-1 font-mono text-[10px] text-ink-faint">{widget.type}</p>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
                {widget.description}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
