import { useDeferredValue, useMemo, useState } from 'react';
import {
  companyFrequency, isCompanyList, listFrequency, membershipsOfList, questionState,
  questionUrl,
} from '@chestha/core';
import { useWorkspace } from '../../app/StoreProvider.jsx';
import {
  Badge, Button, EmptyState, Panel, TextInput, cx,
} from '../../components/ui.jsx';
import { Icon } from '../../components/icons.jsx';
import { DifficultyBadge } from './DifficultyBadge.jsx';
import { QuestionActions } from './QuestionActions.jsx';

/** How many questions to render at once. 400-row companies exist. */
const PAGE = 50;

/**
 * Questions tagged to a company, from the bundled company pack.
 *
 * **It owns no data.** Company lists are ordinary curated lists that arrive
 * with the pack — `company:` prefixed, so `familyOf` collapses them into one
 * family and four hundred of them cannot outweigh Blind 75. This tab is a view
 * over `dsa.library`, and solving from here writes the same `dsa.progress`
 * events as solving anywhere else. There is no company-specific progress.
 *
 * **The list is paged, not virtualised.** Amazon has several hundred rows and
 * each one carries its own action buttons; rendering them all is a visible
 * stall on a New Tab. A "show more" button costs one click and no dependency.
 */
export function DsaCompanies() {
  const { state, today } = useWorkspace();
  const library = state['dsa.library'];
  const progress = state['dsa.progress'];

  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [shown, setShown] = useState(PAGE);

  // Typing filters 422 companies on every keystroke; deferring keeps the input
  // responsive while the list catches up.
  const deferredQuery = useDeferredValue(query);

  const companies = useMemo(() => {
    const counts = new Map();
    for (const m of library.curatedMemberships) {
      if (!isCompanyList(m.listId)) continue;
      counts.set(m.listId, (counts.get(m.listId) ?? 0) + 1);
    }
    return library.curatedLists
      .filter((list) => isCompanyList(list.id))
      .map((list) => ({ ...list, count: counts.get(list.id) ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [library.curatedLists, library.curatedMemberships]);

  const filtered = useMemo(() => {
    const term = deferredQuery.trim().toLowerCase();
    if (!term) return companies;
    return companies.filter((c) => c.name.toLowerCase().includes(term));
  }, [companies, deferredQuery]);

  const selected = companies.find((c) => c.id === selectedId) ?? null;

  const rows = useMemo(() => {
    if (!selected) return [];
    const byslug = new Map(library.questions.map((q) => [q.slug, q]));
    return membershipsOfList(library.curatedMemberships, selected.id)
      // The pack's order is the upstream frequency ranking, so the most-asked
      // question is first without us storing a frequency number.
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((m) => ({
        slug: m.slug,
        question: byslugSafe(byslug, m.slug),
        st: questionState(m.slug, progress.events, progress.schedules, today),
        frequency: listFrequency(library.curatedMemberships, m.slug),
        companies: companyFrequency(library.curatedMemberships, m.slug),
        user: progress.questionState[m.slug] ?? { bookmarked: false, priority: 0, notes: '' },
      }));
  }, [selected, library, progress, today]);

  const solved = rows.filter((r) => r.st.progress === 'solved').length;

  if (companies.length === 0) {
    return (
      <EmptyState
        title="No company lists yet"
        description="Import the “Company question lists” pack from the Library tab — it carries the questions tagged to each of 422 companies."
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <Panel className="flex max-h-[32rem] flex-col p-3">
        <TextInput
          value={query}
          onChange={(e) => { setQuery(e.target.value); }}
          placeholder="Search companies"
          aria-label="Search companies"
        />
        <p className="mt-2 shrink-0 text-meta text-ink-faint">
          {filtered.length} of {companies.length}
        </p>
        {filtered.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">No company matches that.</p>
        ) : (
          <ul className="mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto scrollbar-thin">
            {filtered.map((company) => (
              <li key={company.id}>
                <button
                  type="button"
                  onClick={() => { setSelectedId(company.id); setShown(PAGE); }}
                  className={cx(
                    'flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-left text-sm transition-colors duration-150',
                    selected?.id === company.id
                      ? 'bg-accent-soft text-ink'
                      : 'text-ink-muted hover:bg-hover hover:text-ink',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{company.name}</span>
                  <span className="shrink-0 tabular-nums text-meta text-ink-faint">{company.count}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {!selected ? (
        <EmptyState
          title="Pick a company"
          description="Each list is the questions reported for that company, most frequently asked first."
        />
      ) : (
        <div className="space-y-4">
          <Panel className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <h3 className="text-card font-semibold text-ink">{selected.name}</h3>
              <p className="mt-0.5 text-meta text-ink-muted">
                {rows.length} question{rows.length === 1 ? '' : 's'} · {solved} solved
              </p>
            </div>
            {/* Solving is recorded against the question, not against the
                company, so this count is shared with every other list the
                question appears in. */}
            <Badge tone="neutral">Ranked by how often it is asked</Badge>
          </Panel>

          <Panel className="overflow-hidden">
            <ul className="divide-y divide-line">
              {rows.slice(0, shown).map((row, index) => (
                <li key={row.slug} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  <span className="w-6 shrink-0 tabular-nums text-meta text-ink-faint">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <a
                      href={questionUrl(row.slug)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-ink underline decoration-transparent underline-offset-2 transition-colors hover:decoration-line-strong"
                    >
                      {row.question?.title ?? row.slug}
                      <Icon name="external" className="ml-1 inline size-3 text-ink-faint" />
                    </a>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-meta text-ink-faint">
                      <DifficultyBadge difficulty={row.question?.difficulty} />
                      {/* Two different numbers, deliberately not merged: one is
                          editorial reach, the other is how many companies ask it. */}
                      {row.companies.companies > 1 ? (
                        <span>{row.companies.companies} companies</span>
                      ) : null}
                      {row.frequency.lists > row.companies.companies ? (
                        <span>
                          {row.frequency.lists - row.companies.companies} curated list
                          {row.frequency.lists - row.companies.companies === 1 ? '' : 's'}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <QuestionActions
                    slug={row.slug}
                    title={row.question?.title ?? row.slug}
                    state={row.st}
                    user={row.user}
                  />
                </li>
              ))}
            </ul>

            {shown < rows.length ? (
              <div className="border-t border-line p-3 text-center">
                <Button size="sm" onClick={() => setShown((n) => n + PAGE)}>
                  Show {Math.min(PAGE, rows.length - shown)} more
                </Button>
              </div>
            ) : null}
          </Panel>
        </div>
      )}
    </div>
  );
}

/** Keeps the row render total even when a pack references an unknown slug. */
function byslugSafe(map, slug) {
  return map.get(slug) ?? null;
}
