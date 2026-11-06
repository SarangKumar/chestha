import { useMemo, useState } from 'react';
import {
  BUNDLED_PACKS, DIFFICULTIES, EMPTY_FILTERS, GROUPINGS, QUESTION_SORTS, REVISION_FILTERS,
  SOURCES, STATUS_LABELS, applyPack, buildRows, difficultyProgress, filterRows, groupRows,
  hasActiveFilters, isCompanyList, parsePack, questionUrl, sheetShortLabel, sortRows, topicKey,
} from '@chestha/core';
import { useWorkspace } from '../../app/StoreProvider.jsx';
import {
  Badge, Button, CardTitle, Drawer, EmptyState, Field, Panel, Select, Stat, TextInput, cx,
} from '../../components/ui.jsx';
import { Combobox } from '../../components/Combobox.jsx';
import { Icon } from '../../components/icons.jsx';
import { QuestionRow, VirtualQuestionList } from './QuestionList.jsx';

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
  const [filtersOpen, setFiltersOpen] = useState(false);

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
    // A company is a list too, so filtering to one and then grouping by list
    // should give that company's questions under its own heading rather than
    // one heading per sheet they happen to appear in.
    onlyList: filters.curatedList !== 'all' ? filters.curatedList
      : filters.company !== 'all' ? filters.company
        : null,
    onlyTopic: filters.topic === 'all' ? null : filters.topic,
  }), [visible, grouping, library.curatedLists, filters.curatedList, filters.company, filters.topic]);

  const sheetNames = useMemo(
    () => new Map(library.curatedLists.map((l) => [l.id, l.name])),
    [library.curatedLists],
  );

  /**
   * Sheets and companies are both curated lists, and they are split here
   * because they are different questions.
   *
   * A company pack brings 422 lists. Left in one picker they bury the ten
   * sheets the picker exists for, and the sheet filter becomes a haystack. The
   * split is by `company:` id — the same prefix `familyOf` keys on — so there
   * is one definition of what a company list is.
   */
  const listCounts = useMemo(() => {
    const counts = new Map();
    for (const m of library.curatedMemberships) {
      if (m.removedFromSource) continue;
      counts.set(m.listId, (counts.get(m.listId) ?? 0) + 1);
    }
    return counts;
  }, [library.curatedMemberships]);

  const sheetOptions = useMemo(() => [
    { value: 'all', label: 'All sheets' },
    ...library.curatedLists
      .filter((l) => !isCompanyList(l.id))
      .map((l) => ({ value: l.id, label: `${l.name} (${listCounts.get(l.id) ?? 0})` })),
  ], [library.curatedLists, listCounts]);

  const companyOptions = useMemo(() => [
    { value: 'all', label: 'All companies' },
    ...library.curatedLists
      .filter((l) => isCompanyList(l.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((l) => ({ value: l.id, label: `${l.name} (${listCounts.get(l.id) ?? 0})` })),
  ], [library.curatedLists, listCounts]);

  const topicOptions = useMemo(() => [
    { value: 'all', label: 'All topics' },
    ...topics.map(([key, label]) => ({ value: key, label })),
  ], [topics]);

  const byDifficulty = useMemo(() => difficultyProgress(rows), [rows]);
  const active = hasActiveFilters(filters);
  // The number on the filter button. Search is excluded: it has its own field
  // in plain sight, and counting it would make the drawer look as though it
  // held something it does not.
  const activeCount = Object.entries(EMPTY_FILTERS)
    .filter(([key, blank]) => key !== 'query' && filters[key] !== blank).length;

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

      {sheetOptions.length === 1 && (
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

      {/* Search is the only control on the page; everything else is one click
          away in the drawer. Twelve selects in a grid made the list itself the
          smaller half of the screen, and the first thing anyone does here is
          search. */}
      <Panel className="p-2">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
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

          <Button
            size="sm"
            tone={activeCount > 0 ? 'primary' : 'default'}
            onClick={() => setFiltersOpen(true)}
            aria-expanded={filtersOpen}
            title="Filters, sort and grouping"
            className="shrink-0 gap-1.5"
          >
            <Icon name="filter" className="size-4" />
            Filters
            {activeCount > 0 && (
              <span className="tabular rounded-chip bg-surface/80 px-1.5 text-[11px] font-semibold text-ink">
                {activeCount}
              </span>
            )}
          </Button>
        </div>

        {active && (
          <div className="mt-2 flex items-center justify-between gap-2 px-1">
            <span className="text-meta text-ink-faint">{visible.length} of {rows.length} match</span>
            <Button size="sm" tone="quiet" onClick={clearFilters}>Clear filters</Button>
          </div>
        )}
      </Panel>

      <Drawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
        description={`${visible.length} of ${rows.length} questions match`}
        footer={(
          <>
            <Button size="sm" tone="quiet" onClick={clearFilters} disabled={!active}>Clear all</Button>
            <Button size="sm" tone="primary" onClick={() => setFiltersOpen(false)} className="ml-auto">Done</Button>
          </>
        )}
      >
        <div className="space-y-4">
          {/* Comboboxes, not selects, for the three long lists: sheets carry a
              count, companies number in the hundreds, and topics in the dozens.
              Each one filters as you type. */}
          <Field label="Sheet">
            {(id) => (
              <Combobox
                id={id}
                block
                value={filters.curatedList}
                onChange={(v) => set({ curatedList: v })}
                options={sheetOptions}
                aria-label="Filter by sheet"
                searchPlaceholder="Find a sheet…"
              />
            )}
          </Field>

          <Field label="Company" hint={companyOptions.length === 1 ? 'Import the company pack to filter by who asks a question.' : undefined}>
            {(id) => (
              <Combobox
                id={id}
                block
                value={filters.company}
                onChange={(v) => set({ company: v })}
                options={companyOptions}
                aria-label="Filter by company"
                searchPlaceholder="Find a company…"
              />
            )}
          </Field>

          <Field label="Difficulty">
            {(id) => (
              <Select id={id} value={filters.difficulty} onChange={(e) => set({ difficulty: e.target.value })}>
                <option value="all">Any difficulty</option>
                {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
              </Select>
            )}
          </Field>

          <Field label="Topic">
            {(id) => (
              <Combobox
                id={id}
                block
                value={filters.topic}
                onChange={(v) => set({ topic: v })}
                options={topicOptions}
                aria-label="Filter by data structure or topic"
                searchPlaceholder="Find a topic…"
              />
            )}
          </Field>

          <Field label="Status">
            {(id) => (
              <Select id={id} value={filters.status} onChange={(e) => set({ status: e.target.value })}>
                <option value="all">Any status</option>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            )}
          </Field>

          <Field label="Access">
            {(id) => (
              <Select id={id} value={filters.premium} onChange={(e) => set({ premium: e.target.value })}>
                <option value="all">Free and premium</option>
                <option value="exclude">Free only</option>
                <option value="only">Premium only</option>
              </Select>
            )}
          </Field>

          <Field label="Revision">
            {(id) => (
              <Select id={id} value={filters.revision} onChange={(e) => set({ revision: e.target.value })}>
                {Object.entries(REVISION_FILTERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            )}
          </Field>

          <Field label="My list" hint={personal.lists.length === 0 ? 'Lists you make in the Lists tab show up here.' : undefined}>
            {(id) => (
              <Select
                id={id}
                value={filters.personalList}
                onChange={(e) => set({ personalList: e.target.value })}
                disabled={personal.lists.length === 0}
              >
                <option value="all">{personal.lists.length === 0 ? 'No lists yet' : 'All my lists'}</option>
                {personal.lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            )}
          </Field>

          <div className="space-y-2.5 border-t border-line pt-4">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink">
              <input
                type="checkbox"
                checked={filters.bookmarked}
                onChange={(e) => set({ bookmarked: e.target.checked })}
                className="size-4 shrink-0 accent-[var(--app-accent)]"
              />
              Bookmarked only
            </label>
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink" title="Low confidence, or needed a hint">
              <input
                type="checkbox"
                checked={filters.needsPractice}
                onChange={(e) => set({ needsPractice: e.target.checked })}
                className="size-4 shrink-0 accent-[var(--app-accent)]"
              />
              Needs practice
            </label>
          </div>

          {/* Last, and below a rule: these two change the shape of the list
              rather than its contents, and they are not counted on the filter
              button for the same reason. */}
          <div className="space-y-4 border-t border-line pt-4">
            <Field label="Sort by">
              {(id) => (
                <Select id={id} value={sort} onChange={(e) => setSort(e.target.value)}>
                  {Object.entries(QUESTION_SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Group by">
              {(id) => (
                <Select id={id} value={grouping} onChange={(e) => setGrouping(e.target.value)}>
                  {Object.entries(GROUPINGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              )}
            </Field>
          </div>
        </div>
      </Drawer>

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
