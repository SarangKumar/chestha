import { useMemo, useState } from 'react';
import {
  BUNDLED_PACKS, DIFFICULTIES, EMPTY_FILTERS, GROUPINGS, QUESTION_SORTS, REVISION_FILTERS,
  SOURCES, STATUS_LABELS, applyPack, buildRows, difficultyProgress, filterRows, groupRows,
  hasActiveFilters, parsePack, questionUrl, sheetShortLabel, sortRows, topicKey,
} from '@vistaar/core';
import { useWorkspace } from '../../app/StoreProvider.jsx';
import {
  Badge, Button, CardTitle, EmptyState, Panel, Select, Stat, TextInput, cx,
} from '../../components/ui.jsx';
import { Icon } from '../../components/icons.jsx';
import { QuestionActions } from './QuestionActions.jsx';
import { useVirtualRows } from '../../app/useVirtualRows.js';

/** Uniform row height, so the virtual window is pure arithmetic. */
const ROW_PX = 44;

/** A grouped view is many short lists; each is capped rather than windowed. */
const GROUP_CAP = 200;

export function DsaLibrary() {
  const { state, today, actions, notify } = useWorkspace();
  const library = state['dsa.library'];
  const progress = state['dsa.progress'];
  const personal = state['dsa.lists'];

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState('frequency');
  const [grouping, setGrouping] = useState('none');
  const [busy, setBusy] = useState(null);

  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const clearFilters = () => setFilters(EMPTY_FILTERS);

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

  const groups = useMemo(() => groupRows(visible, grouping, {
    lists: library.curatedLists,
    onlyList: filters.curatedList === 'all' ? null : filters.curatedList,
    onlyTopic: filters.topic === 'all' ? null : filters.topic,
  }), [visible, grouping, library.curatedLists, filters.curatedList, filters.topic]);

  const sheetNames = useMemo(
    () => new Map(library.curatedLists.map((l) => [l.id, l.name])),
    [library.curatedLists],
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

      {library.curatedLists.length === 0 && (
        <Panel className="flex flex-wrap items-center justify-between gap-3 border-warn/35 bg-warn-soft p-4">
          <p className="min-w-0 text-sm text-ink">
            No sheets are imported, so questions carry no sheet badges and the sheet filter has nothing to offer.
            The <strong className="font-semibold">Curated interview lists</strong> pack adds Blind 75, NeetCode 150/250,
            LeetCode 75 and Top Interview 150.
          </p>
          <Button
            size="sm"
            tone="primary"
            disabled={busy !== null}
            onClick={() => importPack(BUNDLED_PACKS.find((p) => p.id === 'curated-core'))}
          >
            {busy === 'curated-core' ? 'Importing…' : 'Import sheets'}
          </Button>
        </Panel>
      )}

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
            <Select
              value={filters.curatedList}
              onChange={(e) => set({ curatedList: e.target.value })}
              aria-label="Filter by sheet"
              className="min-w-0"
              disabled={library.curatedLists.length === 0}
            >
              <option value="all">
                {library.curatedLists.length === 0 ? 'No sheets imported' : `All sheets (${library.curatedLists.length})`}
              </option>
              {library.curatedLists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({library.curatedMemberships.filter((m) => m.listId === l.id && !m.removedFromSource).length})
                </option>
              ))}
            </Select>
            <Select
              value={filters.personalList}
              onChange={(e) => set({ personalList: e.target.value })}
              aria-label="Filter by my list"
              className="min-w-0"
              disabled={personal.lists.length === 0}
            >
              <option value="all">{personal.lists.length === 0 ? 'No lists yet' : 'All my lists'}</option>
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
      ) : grouping === 'none' ? (
        /* One long list, so it is windowed. Grouped views are many short lists
           and are capped per group instead. */
        <VirtualQuestionList
          rows={visible}
          sheetNames={sheetNames}
          activeSheet={filters.curatedList}
          onPickSheet={(id) => set({ curatedList: id })}
        />
      ) : (
        groups.map((group) => {
          const shown = group.rows.slice(0, GROUP_CAP);
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
                  <QuestionRow
                    key={`${group.key}-${question.slug}`}
                    question={question}
                    qs={qs}
                    frequency={frequency}
                    user={user}
                    sheetNames={sheetNames}
                    activeSheet={filters.curatedList}
                    onPickSheet={(id) => set({ curatedList: id })}
                  />
                ))}
              </ul>
              {group.rows.length > shown.length && (
                <p className="border-t border-line px-4 py-2.5 text-meta text-ink-faint">
                  {group.rows.length - shown.length} more here — turn grouping off to scroll the whole list.
                </p>
              )}
            </Panel>
          );
        })
      )}

      <PackPicker onImport={importPack} busy={busy} compact />
    </div>
  );
}

/**
 * One question row at a fixed height. The height has to be uniform for the
 * virtual window to be computable, so the row does not wrap: the title truncates
 * and the badges keep their width.
 */
function QuestionRow({ question, qs, frequency, user, sheetNames, activeSheet, onPickSheet }) {
  return (
    <li style={{ height: ROW_PX }} className="flex items-center gap-x-3 overflow-hidden px-3.5 transition-colors duration-150 hover:bg-hover">
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
      {question.difficulty && (
        <Badge tone={question.difficulty === 'Hard' ? 'danger' : question.difficulty === 'Medium' ? 'warn' : 'neutral'}>
          {question.difficulty}
        </Badge>
      )}
      {/* Every sheet is named — no "+n" — and each badge carries
          its own full name on hover. */}
      {frequency.listIds.length > 0 && (
        <span className="flex shrink-0 items-center gap-1">
          {frequency.listIds.map((id) => {
            const fullName = sheetNames.get(id) ?? id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onPickSheet(id)}
                title={fullName}
                aria-label={`Filter to ${fullName}`}
                className={cx(
                  'rounded-chip border px-1.5 py-0.5 text-[10px] font-medium transition-colors duration-150',
                  activeSheet === id
                    ? 'border-line-strong bg-accent-soft text-ink'
                    : 'border-line text-ink-muted hover:bg-surface hover:text-ink',
                )}
              >
                {sheetShortLabel(id, fullName)}
              </button>
            );
          })}
        </span>
      )}
      <Badge tone={qs.status === 'needs-revision' ? 'danger' : (qs.status === 'solved' || qs.status === 'mastered') ? 'ok' : 'neutral'}>
        {STATUS_LABELS[qs.status]}
      </Badge>
      <QuestionActions slug={question.slug} title={question.title} state={qs} user={user} />
    </li>
  );
}

/**
 * Renders only the rows near the viewport. The full index is 3,511 questions and
 * each row carries several badges and two buttons; mounting them all is thousands
 * of nodes and makes filtering feel sluggish.
 */
function VirtualQuestionList({ rows, sheetNames, activeSheet, onPickSheet }) {
  const { scrollRef, start, end, padTop, padBottom } = useVirtualRows({
    count: rows.length,
    rowHeight: ROW_PX,
  });

  return (
    <Panel className="overflow-hidden">
      <div ref={scrollRef} className="h-[80vh] overflow-y-auto scrollbar-thin">
        <div style={{ paddingTop: padTop, paddingBottom: padBottom }}>
          <ul className="divide-y divide-line">
            {rows.slice(start, end).map(({ question, state: qs, frequency, user }) => (
              <QuestionRow
                key={question.slug}
                question={question}
                qs={qs}
                frequency={frequency}
                user={user}
                sheetNames={sheetNames}
                activeSheet={activeSheet}
                onPickSheet={onPickSheet}
              />
            ))}
          </ul>
        </div>
      </div>
      <p className="border-t border-line px-4 py-2 text-meta text-ink-faint">
        Showing rows {rows.length ? start + 1 : 0}–{end} of {rows.length}.
      </p>
    </Panel>
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
