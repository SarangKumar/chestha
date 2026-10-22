import { useMemo } from 'react';
import { SOURCES, STATUS_LABELS, questionState, questionUrl } from '@vistaar/core';
import { useWorkspace } from '../../app/StoreProvider.jsx';
import { Badge, CardTitle, EmptyState, Panel, Stat } from '../../components/ui.jsx';

/**
 * Step B shows the library honestly: the canonical records that exist, and a
 * plain account of why none ship with the app. Search, filters, sorting and
 * URL-based adding are the next increment.
 */
export function DsaLibrary() {
  const { state, today } = useWorkspace();
  const { questions } = state['dsa.library'];
  const progress = state['dsa.progress'];

  const rows = useMemo(
    () => questions.map((q) => ({ q, state: questionState(q.slug, progress.events, progress.schedules, today) })),
    [questions, progress, today],
  );

  if (questions.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState
          title="No questions yet"
          description="Nothing is bundled with the app. The next increment adds questions by URL and a data-pack importer."
        />

        <Panel className="p-4 sm:p-5">
          <CardTitle className="mb-3">Why nothing is pre-loaded</CardTitle>
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-muted">
            <li>LeetCode&rsquo;s terms forbid crawling and scraping, so its problem index cannot be harvested.</li>
            <li>A browser page cannot reach leetcode.com at all — there is no CORS grant — so no client-side path to live metadata exists either way.</li>
            <li>Which problems a curated list contains is its author&rsquo;s editorial work, and none of the sources below publishes a licence permitting redistribution of that selection.</li>
          </ul>
          <p className="mt-3 text-meta leading-relaxed text-ink-faint">
            So the app ships the ingestion mechanism rather than the content. Questions you add by URL, and any
            data pack you supply, work identically to a bundled one.
          </p>
        </Panel>

        <Panel className="p-4 sm:p-5">
          <CardTitle className="mb-3">Curated sources this feature can ingest</CardTitle>
          <ul className="divide-y divide-line overflow-hidden rounded-control border border-line">
            {SOURCES.map((source) => (
              <li key={source.id} className="flex flex-wrap items-start justify-between gap-2 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{source.name}</p>
                  <p className="mt-0.5 text-meta leading-relaxed text-ink-faint">{source.note}</p>
                </div>
                <Badge tone="neutral">Not imported</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-meta text-ink-faint">
            Counts are deliberately not shown for sources whose published totals disagree between references.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-6">
        <Stat value={questions.length} label="questions" />
        <Stat value={rows.filter((r) => r.state.progress === 'solved').length} label="solved" />
        <Stat value={rows.filter((r) => r.state.revision === 'overdue').length} label="overdue" tone="danger" />
      </div>

      <Panel className="overflow-hidden">
        <ul className="divide-y divide-line">
          {rows.map(({ q, state: qs }) => (
            <li key={q.slug} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5">
              <a
                href={questionUrl(q)}
                target="_blank"
                rel="noreferrer noopener"
                className="min-w-0 flex-1 truncate text-sm text-ink underline-offset-2 hover:underline"
              >
                {q.title}
              </a>
              {q.difficulty && <Badge tone="neutral">{q.difficulty}</Badge>}
              <Badge tone={qs.status === 'needs-revision' ? 'danger' : qs.status === 'mastered' ? 'ok' : 'neutral'}>
                {STATUS_LABELS[qs.status]}
              </Badge>
              {q.titleIsGuess && <Badge tone="warn">Unverified title</Badge>}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
