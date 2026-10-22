import { useMemo, useState } from 'react';
import {
  BUNDLED_PACKS, DIFFICULTIES, SOURCES, STATUS_LABELS, applyPack, listFrequency,
  matchesQuestionQuery, parsePack, questionState, questionUrl, topicKey,
} from '@vistaar/core';
import { useWorkspace } from '../../app/StoreProvider.jsx';
import {
  Badge, Button, CardTitle, EmptyState, Panel, Select, Stat, TextInput,
} from '../../components/ui.jsx';
import { Icon } from '../../components/icons.jsx';

const SORTS = {
  frequency: 'List overlap',
  difficulty: 'Difficulty',
  title: 'Title',
  status: 'Progress',
};

const DIFFICULTY_RANK = { Easy: 0, Medium: 1, Hard: 2 };

export function DsaLibrary() {
  const { state, today, actions, notify } = useWorkspace();
  const library = state['dsa.library'];
  const progress = state['dsa.progress'];

  const [query, setQuery] = useState('');
  const [difficulty, setDifficulty] = useState('all');
  const [listId, setListId] = useState('all');
  const [topic, setTopic] = useState('all');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('frequency');
  const [busy, setBusy] = useState(null);

  const rows = useMemo(() => library.questions.map((q) => ({
    q,
    freq: listFrequency(library.curatedMemberships, q.slug),
    st: questionState(q.slug, progress.events, progress.schedules, today),
  })), [library, progress, today]);

  const topics = useMemo(() => {
    const seen = new Map();
    for (const { q } of rows) for (const t of q.topics) if (!seen.has(topicKey(t))) seen.set(topicKey(t), t);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const visible = useMemo(() => {
    const filtered = rows.filter(({ q, freq, st }) => {
      if (!matchesQuestionQuery(q, query)) return false;
      if (difficulty !== 'all' && q.difficulty !== difficulty) return false;
      if (topic !== 'all' && !q.topics.some((t) => topicKey(t) === topic)) return false;
      if (status !== 'all' && st.status !== status) return false;
      if (listId !== 'all' && !freq.listIds.includes(listId)) return false;
      return true;
    });

    const cmp = {
      frequency: (a, b) => b.freq.families - a.freq.families || b.freq.lists - a.freq.lists
        || a.q.title.localeCompare(b.q.title),
      difficulty: (a, b) => (DIFFICULTY_RANK[a.q.difficulty] ?? 9) - (DIFFICULTY_RANK[b.q.difficulty] ?? 9)
        || a.q.title.localeCompare(b.q.title),
      title: (a, b) => a.q.title.localeCompare(b.q.title),
      status: (a, b) => a.st.status.localeCompare(b.st.status) || a.q.title.localeCompare(b.q.title),
    }[sort];

    return [...filtered].sort(cmp);
  }, [rows, query, difficulty, topic, status, listId, sort]);

  const filtersActive = query || difficulty !== 'all' || topic !== 'all' || status !== 'all' || listId !== 'all';
  const clearFilters = () => { setQuery(''); setDifficulty('all'); setTopic('all'); setStatus('all'); setListId('all'); };

  // The pack is this app's own static asset, fetched from its own origin — no
  // external request is made at any point.
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
        + (outcome.listsAdded ? `, ${outcome.listsAdded} lists` : '')
        + '. Your solving history was not touched.',
        { duration: 9000 },
      );
    } catch (error) {
      notify(`Pack not imported: ${error.message}`, { tone: 'danger', duration: 9000 });
    } finally {
      setBusy(null);
    }
  };

  if (library.questions.length === 0) {
    return <PackPicker onImport={importPack} busy={busy} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <Stat value={library.questions.length} label="questions" />
        <Stat value={rows.filter((r) => r.st.progress === 'solved').length} label="solved" />
        <Stat value={rows.filter((r) => r.st.revision === 'overdue').length} label="overdue"
          tone={rows.some((r) => r.st.revision === 'overdue') ? 'danger' : 'muted'} />
        <Stat value={library.curatedLists.length} label="curated lists" />
      </div>

      <Panel className="p-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative min-w-0 sm:min-w-48 sm:flex-1">
            <TextInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, slug, topic or id…"
              aria-label="Search questions"
              className="pl-8"
            />
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint">
              <Icon name="search" className="size-4" />
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <Select value={listId} onChange={(e) => setListId(e.target.value)} aria-label="Filter by curated list" className="min-w-0 sm:w-auto">
              <option value="all">All lists</option>
              {library.curatedLists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
            <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} aria-label="Filter by difficulty" className="min-w-0 sm:w-auto">
              <option value="all">Any difficulty</option>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
            <Select value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Filter by topic" className="min-w-0 sm:w-auto">
              <option value="all">All topics</option>
              {topics.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Select>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by progress" className="min-w-0 sm:w-auto">
              <option value="all">Any progress</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort questions" className="min-w-0 sm:w-auto">
              {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            {filtersActive && <Button size="sm" tone="quiet" onClick={clearFilters}>Clear</Button>}
          </div>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        {visible.length === 0 ? (
          <div className="p-3">
            <EmptyState title="Nothing matches these filters" action={<Button size="sm" onClick={clearFilters}>Clear filters</Button>} />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {visible.slice(0, 200).map(({ q, freq, st }) => (
              <li key={q.slug} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-2.5 transition-colors duration-150 hover:bg-hover">
                <a
                  href={questionUrl(q)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="min-w-0 flex-1 truncate text-sm text-ink underline-offset-2 hover:underline"
                  title={`Open ${q.title} on LeetCode`}
                >
                  {q.title}
                </a>

                {q.difficulty && (
                  <Badge tone={q.difficulty === 'Hard' ? 'danger' : q.difficulty === 'Medium' ? 'warn' : 'neutral'}>
                    {q.difficulty}
                  </Badge>
                )}
                {q.paidOnly && <Badge tone="neutral">Premium</Badge>}
                {freq.lists > 0 && (
                  <Badge tone="neutral" title={`In ${freq.lists} lists across ${freq.families} independent families`}>
                    {freq.lists} list{freq.lists === 1 ? '' : 's'} / {freq.families} fam
                  </Badge>
                )}
                <Badge tone={st.status === 'needs-revision' ? 'danger' : st.status === 'mastered' ? 'ok' : st.status === 'solved' ? 'ok' : 'neutral'}>
                  {STATUS_LABELS[st.status]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="px-1 text-meta text-ink-faint">
        Showing {Math.min(visible.length, 200)} of {visible.length} matching, from {library.questions.length} in the library.
        {visible.length > 200 && ' Narrow the filters to see the rest — paging arrives with the full library view.'}
      </p>

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
