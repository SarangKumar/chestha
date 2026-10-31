import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PRIORITIES, addDays, completedLocalDay, describeRecurrence, firstOccurrence, isCompleted,
  normalizeTags, tagKey, todayISO,
} from '@chestha/core';
import { RepeatPicker } from './RepeatPicker.jsx';
import { useWorkspace } from '../app/StoreProvider.jsx';
import { Badge, Button, Dialog, Field, Select, TextArea, TextInput, cx } from './ui.jsx';
import { PRIORITY_LABEL } from './TaskItem.jsx';

const EMPTY = { title: '', notes: '', due: '', priority: 'none', tags: [], recurrence: null };

export function TaskEditor({ open, taskId, defaultDue, onClose }) {
  const { state, today, actions } = useWorkspace();
  const existing = useMemo(
    () => (taskId ? state.tasks.find((t) => t.id === taskId) ?? null : null),
    [taskId, state.tasks],
  );
  const [draft, setDraft] = useState(EMPTY);
  const [tagInput, setTagInput] = useState('');
  const titleRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setTagInput('');
    if (existing) {
      setDraft({
        title: existing.title,
        notes: existing.notes,
        due: existing.due ?? '',
        priority: existing.priority,
        tags: existing.tags,
        recurrence: existing.recurrence ?? null,
      });
    } else {
      setDraft({ ...EMPTY, due: defaultDue ?? '' });
    }
  }, [open, existing, defaultDue]);

  const knownTags = useMemo(() => {
    const used = new Set(draft.tags.map(tagKey));
    return state.tags.filter((tag) => !used.has(tagKey(tag))).slice(0, 8);
  }, [state.tags, draft.tags]);

  const patch = (changes) => setDraft((current) => ({ ...current, ...changes }));

  const addTagFromInput = () => {
    const next = normalizeTags([...draft.tags, tagInput]);
    if (next.length !== draft.tags.length) patch({ tags: next });
    setTagInput('');
  };

  const canSave = draft.title.trim().length > 0;

  const save = () => {
    if (!canSave) return;
    // A repeating task needs a date to repeat from, so the first matching day is
    // filled in rather than leaving a pattern that can never fire.
    const due = draft.recurrence
      ? (firstOccurrence(draft.due || todayISO(), draft.recurrence) ?? draft.due ?? null)
      : (draft.due || null);

    const payload = {
      title: draft.title.trim(),
      notes: draft.notes,
      due,
      priority: draft.priority,
      tags: draft.tags,
      recurrence: draft.recurrence,
    };
    if (existing) actions.updateTask(existing.id, payload);
    else actions.addTask(payload);
    onClose();
  };

  // Deleting from the editor keeps the undo window rather than confirming.
  const remove = () => {
    if (existing) actions.deleteTask(existing.id);
    onClose();
  };

  if (!open) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      initialFocus={titleRef}
      title={existing ? 'Edit task' : 'New task'}
      description={existing && isCompleted(existing)
        ? `Completed ${formatLongDate(completedLocalDay(existing))}. Its due date is left as it was.`
        : draft.recurrence ? describeRecurrence(draft.recurrence) : 'Only a title is required.'}
      footer={(
        <>
          {existing && <Button tone="danger" onClick={remove} className="mr-auto">Delete</Button>}
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" onClick={save} disabled={!canSave}>
            {existing ? 'Save' : 'Add task'}
          </Button>
        </>
      )}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => { event.preventDefault(); save(); }}
      >
        <Field label="Title">
          {(id) => (
            <TextInput
              id={id}
              ref={titleRef}
              value={draft.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="What needs doing?"
              autoComplete="off"
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Due date" hint="A plain calendar date. No times, no timezones.">
            {(id) => (
              <div className="space-y-2">
                <TextInput id={id} type="date" value={draft.due} onChange={(e) => patch({ due: e.target.value })} />
                <div className="flex flex-wrap gap-1">
                  <DueShortcut label="Today" onClick={() => patch({ due: todayISO() })} active={draft.due === today} />
                  <DueShortcut label="Tomorrow" onClick={() => patch({ due: addDays(todayISO(), 1) })} active={draft.due === addDays(today, 1)} />
                  <DueShortcut label="No date" onClick={() => patch({ due: '' })} active={draft.due === ''} />
                </div>
              </div>
            )}
          </Field>

          <Field label="Priority">
            {(id) => (
              <Select id={id} value={draft.priority} onChange={(e) => patch({ priority: e.target.value })}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </Select>
            )}
          </Field>
        </div>

        <Field label="Tags">
          {(id) => (
            <div className="space-y-2">
              <div className="flex gap-2">
                <TextInput
                  id={id}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTagFromInput(); }
                  }}
                  placeholder="Add a tag and press Enter"
                  autoComplete="off"
                />
                <Button type="button" onClick={addTagFromInput} disabled={!tagInput.trim()}>Add</Button>
              </div>
              {draft.tags.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {draft.tags.map((tag) => (
                    <li key={tag}>
                      <button
                        type="button"
                        onClick={() => patch({ tags: draft.tags.filter((t) => t !== tag) })}
                        className="inline-flex items-center gap-1 rounded-chip border border-line bg-inset px-1.5 py-0.5 text-[11px] font-medium text-ink transition-colors duration-150 hover:bg-hover"
                      >
                        #{tag}
                        <span aria-hidden="true">×</span>
                        <span className="sr-only">Remove tag</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {knownTags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-ink-faint">Used before:</span>
                  {knownTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => patch({ tags: normalizeTags([...draft.tags, tag]) })}
                      className="rounded-chip px-1.5 py-0.5 text-[11px] text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </Field>

        <Field label="Repeat" hint="Pick the days, as you would for an alarm.">
          {() => (
            <RepeatPicker
              value={draft.recurrence}
              dueDate={draft.due}
              onChange={(recurrence) => patch({ recurrence })}
            />
          )}
        </Field>

        <Field label="Notes">
          {(id) => (
            <TextArea
              id={id}
              rows={3}
              value={draft.notes}
              onChange={(e) => patch({ notes: e.target.value })}
              placeholder="Anything else worth remembering"
            />
          )}
        </Field>

        {existing && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <Badge tone={isCompleted(existing) ? 'ok' : 'neutral'}>
              {isCompleted(existing) ? 'Completed' : 'Open'}
            </Badge>
            <Button
              size="sm"
              onClick={() => actions.setCompleted(existing.id, !isCompleted(existing))}
            >
              {isCompleted(existing) ? 'Reopen' : 'Mark complete'}
            </Button>
          </div>
        )}
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Dialog>
  );
}

function DueShortcut({ label, onClick, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'rounded-chip border px-2.5 py-1 text-[11px] font-medium transition-colors duration-150',
        active ? 'border-line-strong bg-accent-soft text-ink' : 'border-line text-ink-muted hover:bg-hover hover:text-ink',
      )}
    >
      {label}
    </button>
  );
}
