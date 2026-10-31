import { useMemo, useState } from 'react';
import { Combobox } from '../components/Combobox.jsx';
import { CHANGELOG } from '../site/changelog.js';

function slugify(kind) {
  return String(kind).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Website Changelog — Vinyaas-inspired layout: large title + subtitle,
 * Version label + Combobox, release body, and a right "On this page" TOC
 * with a compact "What's new" card. Chestha copy only.
 */
export function Changelog() {
  const versions = useMemo(() => CHANGELOG.map((r) => r.version), []);
  const [version, setVersion] = useState(versions[0] ?? '');
  const release = CHANGELOG.find((r) => r.version === version) ?? CHANGELOG[0];

  const options = useMemo(
    () => CHANGELOG.map((entry) => ({ value: entry.version, label: `v${entry.version}` })),
    [],
  );

  if (!release) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Changelog</h1>
        <p className="text-sm text-ink-muted">No releases yet.</p>
      </div>
    );
  }

  const versionId = `release-v${release.version.replace(/\./g, '-')}`;
  const toc = [
    { id: versionId, label: `v${release.version}` },
    ...release.sections.map((section) => ({
      id: `${versionId}-${slugify(section.kind)}`,
      label: section.kind,
    })),
  ];

  const highlightItems = (
    release.sections.find((s) => s.kind === 'Added')?.items
    ?? release.sections[0]?.items
    ?? []
  ).slice(0, 3);

  return (
    <div className="space-y-8 sm:space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Changelog</h1>
        <p className="text-sm text-ink-muted sm:text-[15px]">What Chestha has shipped.</p>
      </header>

      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium text-ink-muted">Version</span>
        <Combobox
          id="changelog-version"
          value={release.version}
          onChange={setVersion}
          options={options}
          aria-label="Select changelog version"
        />
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_13.5rem] lg:gap-12 xl:grid-cols-[minmax(0,1fr)_15rem]">
        <article className="min-w-0 space-y-8">
          <div id={versionId} className="scroll-mt-24 space-y-3">
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
              <p className="max-w-2xl text-[15px] leading-relaxed text-ink-muted">
                {release.summary}
              </p>
            ) : null}
          </div>

          {release.sections.map((section) => (
            <section
              key={section.kind}
              id={`${versionId}-${slugify(section.kind)}`}
              className="scroll-mt-24 space-y-3"
            >
              <h3 className="text-base font-semibold text-ink">{section.kind}</h3>
              <ul className="list-disc space-y-2.5 pl-5 text-[15px] leading-relaxed text-ink-muted">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </article>

        <aside className="hidden lg:block">
          <div className="sticky top-20 space-y-6">
            <nav aria-label="On this page" className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                On this page
              </p>
              <ul className="space-y-1.5 text-[13px] text-ink-muted">
                {toc.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="transition-colors duration-150 hover:text-ink"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            {highlightItems.length > 0 ? (
              <div className="rounded-xl border border-line bg-raised/60 p-4">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <p className="text-[13px] font-semibold text-ink">What&rsquo;s new</p>
                  <span className="font-mono text-[11px] text-ink-faint">v{release.version}</span>
                </div>
                <ul className="space-y-2 text-[12px] leading-relaxed text-ink-muted">
                  {highlightItems.map((item) => (
                    <li key={item} className="line-clamp-2">
                      {item}
                    </li>
                  ))}
                </ul>
                <a
                  href={`#${versionId}`}
                  className="mt-3 inline-flex text-[12px] font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
                >
                  View changelog
                </a>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
