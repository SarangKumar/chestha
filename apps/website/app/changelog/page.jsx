import { CHANGELOG } from '@chestha/core';

export const metadata = {
  title: 'Changelog',
  description: 'What Chestha has shipped, release by release.',
};

function slugify(kind) {
  return String(kind).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Keep-a-Changelog notes, every release on one page.
 *
 * The extension's version picks one release with a combobox. This one lists
 * them all instead, which costs nothing at this length and buys two things a
 * picker cannot: every version is linkable, and the whole history is on the
 * page for anything that reads the site rather than clicks through it. It stays
 * a server component for the same reason — no state, no JavaScript.
 */
export default function ChangelogPage() {
  if (CHANGELOG.length === 0) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Changelog</h1>
        <p className="mt-2 text-card text-ink-muted">No releases yet.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Changelog</h1>
        <p className="text-card text-ink-muted">What Chestha has shipped.</p>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_13.5rem] lg:gap-12">
        <div className="min-w-0 space-y-12">
          {CHANGELOG.map((release) => {
            const id = `release-v${release.version.replace(/\./g, '-')}`;
            return (
              <article key={release.version} className="space-y-8">
                <div id={id} className="scroll-mt-20 space-y-3">
                  <h2 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
                    v{release.version}
                    {release.title ? (
                      <span className="font-medium text-ink-muted"> — {release.title}</span>
                    ) : null}
                  </h2>
                  {release.date ? (
                    <time className="block font-mono text-meta text-ink-faint" dateTime={release.date}>
                      {release.date}
                    </time>
                  ) : null}
                  {release.summary ? (
                    <p className="max-w-2xl text-card leading-relaxed text-ink-muted">
                      {release.summary}
                    </p>
                  ) : null}
                </div>

                {release.sections.map((section) => (
                  <section
                    key={section.kind}
                    id={`${id}-${slugify(section.kind)}`}
                    className="scroll-mt-20 space-y-3"
                  >
                    <h3 className="text-card font-semibold text-ink">{section.kind}</h3>
                    <ul className="list-disc space-y-2.5 pl-5 text-card leading-relaxed text-ink-muted">
                      {section.items.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </section>
                ))}
              </article>
            );
          })}
        </div>

        <aside className="hidden lg:block">
          <nav aria-label="On this page" className="sticky top-20 space-y-2">
            <p className="text-meta font-medium tracking-wide uppercase text-ink-faint">
              Releases
            </p>
            <ul className="space-y-1.5 text-card text-ink-muted">
              {CHANGELOG.map((release) => (
                <li key={release.version}>
                  <a
                    href={`#release-v${release.version.replace(/\./g, '-')}`}
                    className="transition-colors duration-150 hover:text-ink"
                  >
                    v{release.version}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      </div>
    </div>
  );
}
