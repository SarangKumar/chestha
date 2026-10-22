import { Panel, SectionHeader } from '../components/ui.jsx';

/**
 * Deliberately not built yet. The sound module needs two decisions first:
 * whether noise is synthesised (no assets, no licensing) versus bundled loops,
 * and how the focus timer is scoped. Both are open questions in the product
 * definition, so there is nothing here to pretend otherwise.
 */
export function Sounds() {
  return (
    <div>
      <SectionHeader title="Sounds" description="Not built yet — and not stubbed out to look like it is." />
      <Panel className="space-y-3 p-5 text-sm leading-relaxed text-ink-muted sm:p-6">
        <p className="text-card font-semibold text-ink">What this will be</p>
        <p>
          Several ambient sounds playing together, each with its own volume, under one master volume.
          Named presets you can save, rename, delete and restore. Playback that continues while you move
          between sections, with a compact control available everywhere.
        </p>
        <p className="pt-1 text-card font-semibold text-ink">Why it is not here yet</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Noise-type sounds are better synthesised in the browser — no download, no licensing, perfectly
            loopable. Rain, café and fire need recorded loops, which means licence diligence and a size budget.
          </li>
          <li>
            Browsers will not start audio without a gesture on the page, so a mix cannot resume by itself after
            a reload. It will be restored paused and pre-armed, never shown as playing while silent.
          </li>
          <li>
            Whether the focus timer is included — and how to keep it from drifting into streaks and counters —
            is still an open decision.
          </li>
        </ul>
      </Panel>
    </div>
  );
}
