import { Panel, SectionHeader } from '../components/ui.jsx';
import { CHANGELOG } from '../site/changelog.js';

/**
 * Website-first Changelog. Reachable at #/changelog from marketing chrome;
 * the extension can open the same deep link from the command palette.
 */
export function Changelog() {
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Changelog"
        description="What changed in Chestha, newest first. Keep a Changelog tone — honest notes, no filler."
      />

      {CHANGELOG.map((release) => (
        <Panel key={release.version} className="p-5">
          <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-card font-semibold text-ink">
              {release.version}
              {release.title ? (
                <span className="font-medium text-ink-muted"> — {release.title}</span>
              ) : null}
            </h2>
            {release.date ? (
              <time className="font-mono text-meta text-ink-faint" dateTime={release.date}>
                {release.date}
              </time>
            ) : null}
          </header>

          <div className="mt-4 space-y-4">
            {release.sections.map((section) => (
              <div key={section.kind}>
                <h3 className="text-meta font-semibold uppercase tracking-wide text-ink-muted">
                  {section.kind}
                </h3>
                <ul className="mt-1.5 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-muted">
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Panel>
      ))}
    </div>
  );
}
