import { useMemo, useState } from 'react';
import {
  BUNDLED_PACKS, DIFFICULTIES, EMPTY_FILTERS, GROUPINGS, QUESTION_SORTS, REVISION_FILTERS,
  SOURCES, STATUS_LABELS, applyPack, buildRows, difficultyProgress, filterRows, groupRows,
  hasActiveFilters, parsePack, questionUrl, sortRows, topicKey,
} from '@vistaar/core';
import { useWorkspace } from '../../app/StoreProvider.jsx';
import {
  Badge, Button, CardTitle, EmptyState, Meter, Panel, Select, Stat, TextInput, cx,
} from '../../components/ui.jsx';
import { Icon } from '../../components/icons.jsx';

const PAGE_SIZE = 150;

export function DsaLibrary() {
  const { state, today, actions, notify } = useWorkspace();
  const library = state['dsa.library'];
  const progress = state['dsa.progress'];
  const personal = state['dsa.lists'];

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState('frequency');
  const [grouping, setGrouping] = useState('none');
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(null);

  const set = (patch) => { setFilters((f) => ({ ...f, ...patch })); setShowAll(false); };
  const clearFilters = () => { setFilters(EMPTY_FILTERS); setShowAll(false); };

  const rows = useMemo(() => buildRows({
    questions: library.questions,
    events: progress.events,
    schedules: progress.schedules,
    questionState: progress.questionState,
    curatedMemberships: library.curatedMemberships,
  }, today), [library, progress, today]);

  const topics = useMemo(() => {
    const seen = new Map();
    for (const { question } of rows) {
      for (const t of question.topics) if (!seen.has(topicKey(t))) seen.set(topicKey(t), t);
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const visible = useMemo(
    () => sortRows(filterRows(rows, filters, { personalMemberships: personal.memberships }), sort),
    [rows, filters, sort, personal.memberships],
  );

  const groups = useMemo(
    () => groupRows(visible, grouping, { lists: library.curatedLists }),
    [visible, grouping, library.curatedLists],
  );

  const byDifficulty = useMemo(() => difficultyProgress(rows), [rows]);
  const active = hasActiveFilters(filters);

  const importPack = async (pack) => {
    setBusy(pack.id);
    try {
      const response = await fetch(pack.url);
      if (!response.ok) throw new Error(`the file could not be read (HTTP ${response.status})`);
      const result = parsePack(await response.text());
      if (!result.ok) { notify(`Pack not imported: ${result.error}`, { tone: 'danger', duration: 9000 }); return; }
      let outcome;
      actions.setDsaLibrary((lib) => { outcome = applyPack(lib, result.pack); return outcome.library; });
      actions.setDsaSetting('lastPackImport', new Date().toISOString());
      notify(
        `Imported ${pack.name}: ${outcome.added} new question${outcome.added === 1 ? '' : 's'}`
        + (outcome.updated ? `, ${outcome.updated} refreshed` : '')
        + '. Your solving history was not touched.',
        { duration: 9000 },
      );
    } catch (error) {
      notify(`Pack not imported: ${error.message}`, { tone: 'danger', duration: 9000 });
    } finally {
      setBusy(null);
    }
  };

  if (library.questions.length === 0) return <PackPicker onImport={importPack} busy={busy} />;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Panel className="p-4">
          <CardTitle className="mb-2">Library</CardTitle>
          <Stat value={library.questions.length} label="questions" />
        </Panel>
        {DIFFICULTIES.map((level) => (
          <Panel key={level} className="p-4">
            <CardTitle className="mb-2">{level}</CardTitle>
            <Stat
              value={`${byDifficulty[level].solved}/${byDifficulty[level].total}`}
              label="solved"
              meter={{ value: byDifficulty[level].solved, max: Math.max(1, byDifficulty[level].total), label: `${level} solved` }}
            />
          </Panel>
        ))}
      </div>

      <Panel className="p-2">
        <div className="flex flex-col gap-2">
          <div className="relative">
            <TextInput
              value={filters.query}
              onChange={(e) => set({ query: e.target.value })}
              placeholder="Search title, slug, topic or question id…"
              aria-label="Search questions"
              className="pl-8"
            />
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint">
              <Icon name="search" className="size-4" />
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Select value={filters.curatedList} onChange={(e) => set({ curatedList: e.target.value })} aria-label="Filter by sheet" className="min-w-0">
              <option value="all">All sheets</option>
              {library.curatedLists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
            <Select value={filters.personalList} onChange={(e) => set({ personalList: e.target.value })} aria-label="Filter by my list" className="min-w-0">
              <option value="all">All my lists</option>
              {personal.lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
            <Select value={filters.difficulty} onChange={(e) => set({ difficulty: e.target.value })} aria-label="Filter by difficulty" className="min-w-0">
              <option value="all">Any difficulty</option>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
            <Select value={filters.topic} onChange={(e) => set({ topic: e.target.value })} aria-label="Filter by data structure or topic" className="min-w-0">
              <option value="all">All topics</option>
              {topics.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Select>
            <Select value={filters.status} onChange={(e) => set({ status: e.target.value })} aria-label="Filter by solved status" className="min-w-0">
              <option value="all">Any status</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Select value={filters.revision} onChange={(e) => set({ revision: e.target.value })} aria-label="Filter by revision state" className="min-w-0">
              {Object.entries(REVISION_FILTERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Select value={filters.premium} onChange={(e) => set({ premium: e.target.value })} aria-label="Filter premium questions" className="min-w-0">
              <option value="all">Free and premium</option>
              <option value="exclude">Free only</option>
              <option value="only">Premium only</option>
            </Select>
            <Select value={String(filters.minFamilies)} onChange={(e) => set({ minFamilies: Number(e.target.value) })} aria-label="Minimum sheet overlap" className="min-w-0">
              <option value="0">Any overlap</option>
              <option value="2">In 2+ families</option>
              <option value="3">In 3+ families</option>
            </Select>
            <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort questions" className="min-w-0">
              {Object.entries(QUESTION_SORTS).map(([k, v]) => <option key={k} value={k}>Sort: {v}</option>)}
            </Select>
            <Select value={grouping} onChange={(e) => setGrouping(e.target.value)} aria-label="Group questions" className="min-w-0">
              {Object.entries(GROUPINGS).map(([k, v]) => <option key={k} value={k}>Group: {v}</option>)}
            </Select>
            <label className="flex items-center gap-2 rounded-control border border-line bg-inset px-2.5 text-xs text-ink-muted">
              <input type="checkbox" checked={filters.bookmarked} onChange={(e) => set({ bookmarked: e.target.checked })} className="size-3.5 accent-[var(--app-accent)]" />
              Bookmarked
            </label>
            <label className="flex items-center gap-2 rounded-control border border-line bg-inset px-2.5 text-xs text-ink-muted" title="Low confidence, or needed a hint">
              <input type="checkbox" checked={filters.needsPractice} onChange={(e) => set({ needsPractice: e.target.checked })} className="size-3.5 accent-[var(--app-accent)]" />
              Needs practice
            </label>
          </div>

          {active && (
            <div className="flex items-center justify-between gap-2 px-1">
              <span className="text-meta text-ink-faint">{visible.length} of {rows.length} match</span>
              <Button size="sm" tone="quiet" onClick={clearFilters}>Clear filters</Button>
            </div>
          )}
        </div>
      </Panel>

      {visible.length === 0 ? (
        <Panel className="p-3">
          <EmptyState title="Nothing matches these filters" action={<Button size="sm" onClick={clearFilters}>Clear filters</Button>} />
        </Panel>
      ) : (
        groups.map((group) => {
          const shown = showAll ? group.rows : group.rows.slice(0, PAGE_SIZE);
          return (
            <Panel key={group.key} className="overflow-hidden">
              {group.label && (
                <div className="flex items-center justify-between border-b border-line bg-inset px-4 py-2">
                  <p className="text-meta font-medium text-ink">{group.label}</p>
                  <span className="tabular text-meta text-ink-faint">{group.rows.length}</span>
                </div>
              )}
              <ul className="divide-y divide-line">
                {shown.map(({ question, state: qs, frequency, user }) => (
                  <li key={`${group.key}-${question.slug}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-2.5 transition-colors duration-150 hover:bg-hover">
                    {question.leetcodeId && (
                      <span className="tabular w-10 shrink-0 text-right text-meta text-ink-faint" title={`LeetCode question ${question.leetcodeId}`}>
                        {question.leetcodeId}
                      </span>
                    )}
                    <a
                      href={questionUrl(question)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="min-w-0 flex-1 truncate text-sm text-ink underline-offset-2 hover:underline"
                      title={`Open ${question.title} on LeetCode`}
                    >
                      {question.title}
                    </a>

                    {question.paidOnly && (
                      <Badge tone="warn" title="LeetCode Premium is needed to open this question">
                        <Icon name="lock" className="size-3" /> Premium
                      </Badge>
                    )}
                    {user.bookmarked && <Badge tone="neutral" title="Bookmarked">★</Badge>}
                    {question.difficulty && (
                      <Badge tone={question.difficulty === 'Hard' ? 'danger' : question.difficulty === 'Medium' ? 'warn' : 'neutral'}>
                        {question.difficulty}
                      </Badge>
                    )}
                    {frequency.lists > 0 && (
                      <Badge tone="neutral" title={`In ${frequency.lists} sheets across ${frequency.families} independent families`}>
                        {frequency.lists}/{frequency.families}
                      </Badge>
                    )}
                    <Badge tone={qs.status === 'needs-revision' ? 'danger' : (qs.status === 'solved' || qs.status === 'mastered') ? 'ok' : 'neutral'}>
                      {STATUS_LABELS[qs.status]}
                    </Badge>
                  </li>
                ))}
              </ul>
              {group.rows.length > shown.length && (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="w-full border-t border-line px-4 py-2.5 text-meta text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
                >
                  Show the remaining {group.rows.length - shown.length}
                </button>
              )}
            </Panel>
          );
        })
      )}

      <PackPicker onImport={importPack} busy={busy} compact />
    </div>
  );
}

function PackPicker({ onImport, busy, compact = false }) {
  const bundled = SOURCES.filter((s) => s.bundled);
  const notBundled = SOURCES.filter((s) => !s.bundled);

  return (
    <div className="space-y-4">
      {!compact && (
        <EmptyState
          title="Your question library is empty"
          description="Import a bundled pack below, or add questions one at a time by pasting their LeetCode URL."
        />
      )}

      <Panel className="p-4 sm:p-5">
        <CardTitle className="mb-3">{compact ? 'Question packs' : 'Available packs'}</CardTitle>
        <ul className="space-y-2">
          {BUNDLED_PACKS.map((pack) => (
            <li key={pack.id} className="flex flex-wrap items-center gap-3 rounded-control border border-line px-3.5 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">{pack.name}</span>
                <span className="mt-0.5 block text-meta leading-relaxed text-ink-muted">{pack.description}</span>
              </span>
              <Button
                size="sm"
                tone={compact ? 'default' : 'primary'}
                disabled={busy !== null}
                onClick={() => onImport(pack)}
              >
                {busy === pack.id ? 'Importing…' : 'Import'}
              </Button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-meta leading-relaxed text-ink-faint">
          Packs carry question facts only — title, difficulty and topic tags. Problem statements are never included.
          Importing is safe to repeat: it fills blanks, never overwrites metadata you have edited, and cannot touch
          your solving history.
        </p>
      </Panel>

      <Panel className="p-4 sm:p-5">
        <CardTitle className="mb-3">Curated list coverage</CardTitle>
        <ul className="divide-y divide-line overflow-hidden rounded-control border border-line">
          {[...bundled, ...notBundled].map((source) => (
            <li key={source.id} className="flex flex-wrap items-start justify-between gap-2 px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{source.name}</p>
                <p className="mt-0.5 text-meta leading-relaxed text-ink-faint">{source.note}</p>
              </div>
              <Badge tone={source.bundled ? 'ok' : 'neutral'}>{source.bundled ? 'Included' : 'Not included'}</Badge>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
