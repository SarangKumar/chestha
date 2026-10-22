import { useMemo, useRef, useState } from 'react';
import {
  INTAKE_LABELS, STATUS_LABELS, createList, createMembership, createQuestion,
  hasMembership, membershipsOfList, planIntake, questionState, questionUrl,
  removeList, removeMembership,
} from '@vistaar/core';
import { useWorkspace } from '../../app/StoreProvider.jsx';
import {
  Badge, Button, CardTitle, Dialog, EmptyState, Field, IconButton, Panel, TextArea, TextInput, cx,
} from '../../components/ui.jsx';
import { Icon } from '../../components/icons.jsx';

export function DsaLists() {
  const { state, today, actions, notify } = useWorkspace();
  const { lists, memberships } = state['dsa.lists'];
  const library = state['dsa.library'];
  const progress = state['dsa.progress'];

  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [adding, setAdding] = useState(false);

  const selected = lists.find((l) => l.id === selectedId) ?? lists[0] ?? null;

  const rows = useMemo(() => {
    if (!selected) return [];
    const byId = new Map(library.questions.map((q) => [q.slug, q]));
    return membershipsOfList(memberships, selected.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((m) => ({
        slug: m.slug,
        question: byId.get(m.slug) ?? null,
        st: questionState(m.slug, progress.events, progress.schedules, today),
      }));
  }, [selected, memberships, library.questions, progress, today]);

  const createNamed = (name, description) => {
    const list = createList({ name, description });
    if (!list) return;
    actions.setDsaLists((current) => ({ ...current, lists: [...current.lists, list] }));
    setSelectedId(list.id);
    setCreating(false);
    notify(`Created “${list.name}”`);
  };

  // Deleting a list removes its memberships only. Questions and solving history
  // live in other areas and are provably untouched.
  const deleteList = (list) => {
    const removedMemberships = membershipsOfList(memberships, list.id);
    actions.setDsaLists((current) => ({
      lists: current.lists.filter((l) => l.id !== list.id),
      memberships: removeList(current.memberships, list.id),
    }));
    setSelectedId(null);
    notify(`Deleted “${list.name}”. Its ${removedMemberships.length} question(s) and all solving history are kept.`, {
      tone: 'danger',
      actionLabel: 'Undo',
      duration: 9000,
      onAction: () => actions.setDsaLists((current) => ({
        lists: [...current.lists, list],
        memberships: [...current.memberships, ...removedMemberships],
      })),
    });
  };

  const removeQuestion = (slug) => {
    const membership = memberships.find((m) => m.listId === selected.id && m.slug === slug);
    actions.setDsaLists((current) => ({
      ...current,
      memberships: removeMembership(current.memberships, selected.id, slug),
    }));
    notify('Removed from this list. Its solving history is unchanged.', {
      actionLabel: 'Undo',
      onAction: () => actions.setDsaLists((current) => ({
        ...current,
        memberships: [...current.memberships, membership],
      })),
    });
  };

  const applyIntake = (plan, manual) => {
    const created = [];
    for (const row of plan.rows) {
      if (row.outcome !== 'new') continue;
      const extra = manual[row.slug] ?? {};
      const question = createQuestion({
        slug: row.slug,
        title: extra.title || row.title,
        difficulty: extra.difficulty || null,
        topics: extra.topics ? extra.topics.split(',').map((t) => t.trim()).filter(Boolean) : [],
      });
      if (question) created.push({ ...question, titleIsGuess: !extra.title });
    }

    if (created.length) {
      actions.setDsaLibrary((lib) => ({ ...lib, questions: [...lib.questions, ...created] }));
    }

    const toAdd = plan.actionable.filter((slug) => !hasMembership(memberships, selected.id, slug));
    if (toAdd.length) {
      const base = membershipsOfList(memberships, selected.id).length;
      actions.setDsaLists((current) => ({
        ...current,
        memberships: [
          ...current.memberships,
          ...toAdd.map((slug, i) => createMembership(selected.id, slug, { order: base + i })),
        ],
      }));
    }

    setAdding(false);
    notify(
      `Added ${toAdd.length} question${toAdd.length === 1 ? '' : 's'} to “${selected.name}”`
      + (created.length ? `, ${created.length} newly created` : '')
      + (plan.counts.rejected ? `. ${plan.counts.rejected} line(s) were not usable.` : '.'),
      { duration: 8000 },
    );
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <Panel className="h-fit p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <CardTitle>My lists</CardTitle>
          <IconButton label="Create a list" onClick={() => setCreating(true)}>
            <Icon name="plus" className="size-4" />
          </IconButton>
        </div>

        {lists.length === 0 ? (
          <p className="px-1 py-2 text-meta text-ink-muted">No lists yet.</p>
        ) : (
          <ul className="space-y-0.5">
            {lists.map((list) => (
              <li key={list.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(list.id)}
                  aria-current={selected?.id === list.id ? 'true' : undefined}
                  className={cx(
                    'flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-left text-sm transition-colors duration-150',
                    selected?.id === list.id ? 'bg-accent-soft text-ink' : 'text-ink-muted hover:bg-hover hover:text-ink',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{list.name}</span>
                  <span className="tabular shrink-0 text-meta text-ink-faint">
                    {membershipsOfList(memberships, list.id).length}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {!selected ? (
        <EmptyState
          title="No personal lists yet"
          description="Group questions however you like — Weak Topics, Revision Week, a company’s set."
          action={<Button size="sm" tone="primary" onClick={() => setCreating(true)}>Create a list</Button>}
        />
      ) : (
        <div className="space-y-4">
          <Panel className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <h3 className="text-card font-semibold text-ink">{selected.name}</h3>
              <p className="mt-0.5 text-meta text-ink-muted">
                {rows.length} question{rows.length === 1 ? '' : 's'}
                {rows.length > 0 && ` · ${rows.filter((r) => r.st.progress === 'solved').length} solved`}
              </p>
              {selected.description && <p className="mt-1.5 text-sm text-ink-muted">{selected.description}</p>}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button size="sm" tone="primary" onClick={() => setAdding(true)}>Add questions</Button>
              <Button size="sm" onClick={() => setRenaming({ id: selected.id, name: selected.name })}>Rename</Button>
              <Button size="sm" tone="danger" onClick={() => deleteList(selected)}>Delete</Button>
            </div>
          </Panel>

          <Panel className="overflow-hidden">
            {rows.length === 0 ? (
              <div className="p-3">
                <EmptyState
                  title="Nothing in this list yet"
                  description="Paste LeetCode problem URLs to add them."
                  action={<Button size="sm" onClick={() => setAdding(true)}>Add questions</Button>}
                />
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {rows.map(({ slug, question, st }) => (
                  <li key={slug} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-2.5">
                    <a
                      href={questionUrl(question ?? { slug })}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="min-w-0 flex-1 truncate text-sm text-ink underline-offset-2 hover:underline"
                    >
                      {question?.title ?? slug}
                    </a>
                    {question?.difficulty && <Badge tone="neutral">{question.difficulty}</Badge>}
                    {question?.titleIsGuess && <Badge tone="warn">Unverified</Badge>}
                    <Badge tone={st.status === 'needs-revision' ? 'danger' : st.status === 'solved' || st.status === 'mastered' ? 'ok' : 'neutral'}>
                      {STATUS_LABELS[st.status]}
                    </Badge>
                    <IconButton label={`Remove ${question?.title ?? slug} from this list`} onClick={() => removeQuestion(slug)} className="hover:text-danger">
                      <span aria-hidden="true">×</span>
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}

      <ListDialog
        open={creating}
        title="New list"
        onClose={() => setCreating(false)}
        onSubmit={createNamed}
      />

      <ListDialog
        open={renaming !== null}
        title="Rename list"
        initialName={renaming?.name}
        onClose={() => setRenaming(null)}
        onSubmit={(name) => {
          actions.setDsaLists((current) => ({
            ...current,
            lists: current.lists.map((l) => (l.id === renaming.id ? { ...l, name } : l)),
          }));
          setRenaming(null);
        }}
      />

      {selected && (
        <IntakeDialog
          open={adding}
          listName={selected.name}
          questions={library.questions}
          memberships={memberships}
          listId={selected.id}
          onClose={() => setAdding(false)}
          onApply={applyIntake}
        />
      )}
    </div>
  );
}

function ListDialog({ open, title, initialName = '', onClose, onSubmit }) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState('');
  const ref = useRef(null);

  // Reset whenever the dialog is opened for a different list.
  const [seen, setSeen] = useState(open);
  if (open !== seen) {
    setSeen(open);
    if (open) { setName(initialName); setDescription(''); }
  }

  if (!open) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      initialFocus={ref}
      title={title}
      footer={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" disabled={!name.trim()} onClick={() => onSubmit(name.trim(), description)}>Save</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <Field label="Name">
          {(id) => (
            <TextInput
              id={id}
              ref={ref}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { e.preventDefault(); onSubmit(name.trim(), description); } }}
              placeholder="Interview prep"
              autoComplete="off"
            />
          )}
        </Field>
        {title === 'New list' && (
          <Field label="Description" hint="Optional.">
            {(id) => <TextArea id={id} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />}
          </Field>
        )}
      </div>
    </Dialog>
  );
}

/** Paste, review, then apply. Nothing is written until the plan is confirmed. */
function IntakeDialog({ open, listName, questions, memberships, listId, onClose, onApply }) {
  const [text, setText] = useState('');
  const [manual, setManual] = useState({});
  const ref = useRef(null);

  const [seen, setSeen] = useState(open);
  if (open !== seen) {
    setSeen(open);
    if (open) { setText(''); setManual({}); }
  }

  const plan = useMemo(
    () => (text.trim() ? planIntake(text, { questions, memberships, listId }) : null),
    [text, questions, memberships, listId],
  );

  if (!open) return null;

  const tone = { matched: 'ok', new: 'solid', already: 'neutral', duplicate: 'neutral', rejected: 'danger' };

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      initialFocus={ref}
      title={`Add questions to “${listName}”`}
      description="Paste one or more LeetCode problem URLs. Each line is checked before anything is saved."
      footer={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            tone="primary"
            disabled={!plan || plan.actionable.length === 0}
            onClick={() => onApply(plan, manual)}
          >
            {plan?.actionable.length ? `Add ${plan.actionable.length}` : 'Add'}
          </Button>
        </>
      )}
    >
      <div className="space-y-4">
        <Field label="LeetCode URLs" hint="One per line. A bare problem slug such as two-sum also works.">
          {(id) => (
            <TextArea
              id={id}
              ref={ref}
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'https://leetcode.com/problems/two-sum/\nhttps://leetcode.com/problems/valid-anagram/'}
              className="font-mono text-xs"
            />
          )}
        </Field>

        {plan && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(plan.counts).filter(([, n]) => n > 0).map(([key, n]) => (
                <Badge key={key} tone={tone[key]}>{n} {INTAKE_LABELS[key].toLowerCase()}</Badge>
              ))}
            </div>

            <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-control border border-line scrollbar-thin">
              {plan.rows.map((row, index) => (
                <li key={`${row.input}-${index}`} className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">
                      {row.title ?? row.input}
                    </span>
                    <Badge tone={tone[row.outcome]}>{INTAKE_LABELS[row.outcome]}</Badge>
                  </div>
                  {row.reason && <p className="mt-0.5 text-meta text-ink-faint">{row.reason}</p>}

                  {row.outcome === 'new' && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <TextInput
                        value={manual[row.slug]?.title ?? ''}
                        onChange={(e) => setManual((m) => ({ ...m, [row.slug]: { ...m[row.slug], title: e.target.value } }))}
                        placeholder={row.title}
                        aria-label={`Title for ${row.slug}`}
                        className="text-xs"
                      />
                      <select
                        value={manual[row.slug]?.difficulty ?? ''}
                        onChange={(e) => setManual((m) => ({ ...m, [row.slug]: { ...m[row.slug], difficulty: e.target.value } }))}
                        aria-label={`Difficulty for ${row.slug}`}
                        className="h-9 rounded-control border border-line bg-inset px-2 text-xs text-ink"
                      >
                        <option value="">Difficulty?</option>
                        <option>Easy</option>
                        <option>Medium</option>
                        <option>Hard</option>
                      </select>
                      <TextInput
                        value={manual[row.slug]?.topics ?? ''}
                        onChange={(e) => setManual((m) => ({ ...m, [row.slug]: { ...m[row.slug], topics: e.target.value } }))}
                        placeholder="Topics, comma separated"
                        aria-label={`Topics for ${row.slug}`}
                        className="text-xs"
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>

            <p className="text-meta leading-relaxed text-ink-faint">
              Metadata is optional — a question records and tracks perfectly well without it, including premium
              problems and ones you solved offline. Importing a pack later fills in anything left blank.
            </p>
          </>
        )}
      </div>
    </Dialog>
  );
}
