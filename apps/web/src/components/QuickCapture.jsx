import { useEffect, useRef, useState } from 'react';
import { addDays, describeRecurrence, firstOccurrence, formatDueDate, todayISO } from '@vistaar/core';
import { useWorkspace } from '../app/StoreProvider.jsx';
import { Badge, Button, Dialog, Field, TextInput, cx } from './ui.jsx';
import { RepeatPicker } from './RepeatPicker.jsx';
import { Icon } from './icons.jsx';

/** One-tap dates. Anything else is a day off the calendar field below them. */
const QUICK_DATES = [
  { key: 'none', label: 'No date', resolve: () => '' },
  { key: 'today', label: 'Today', resolve: () => todayISO() },
  { key: 'tomorrow', label: 'Tomorrow', resolve: () => addDays(todayISO(), 1) },
  { key: 'week', label: 'In a week', resolve: () => addDays(todayISO(), 7) },
];

/**
 * Capture asks for a title and nothing else — Enter adds and keeps the dialog
 * open so a run of tasks can be entered without reopening it.
 *
 * Scheduling is the alarm pattern: one-tap days, a calendar field for any other
 * date, and day toggles for repeating. All optional, and all skipped entirely if
 * you just type and press Enter.
 */
export function QuickCapture({ open, onClose }) {
  const { actions, today } = useWorkspace();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [recurrence, setRecurrence] = useState(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [added, setAdded] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setDue('');
    setRecurrence(null);
    setShowSchedule(false);
    setAdded([]);
  }, [open]);

  const activeQuick = QUICK_DATES.find((choice) => choice.resolve() === due)?.key
    ?? (due ? 'custom' : 'none');

  const submit = (event) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;

    // A repeating task needs a date to repeat from, so the first matching day is
    // filled in rather than leaving a pattern that can never fire.
    const resolvedDue = recurrence
      ? (firstOccurrence(due || todayISO(), recurrence) ?? (due || null))
      : (due || null);

    const task = actions.addTask({ title: trimmed, due: resolvedDue, recurrence });
    if (task) setAdded((list) => [{ title: task.title, due: task.due }, ...list].slice(0, 4));
    setTitle('');
    inputRef.current?.focus();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxHeight="80vh"
      initialFocus={inputRef}
      title="Quick capture"
      description="Enter adds the task and keeps this open. Escape closes it."
    >
      <form onSubmit={submit} className="space-y-4">
        <TextInput
          ref={inputRef}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Add a task…"
          autoComplete="off"
          className="h-11 text-base"
          aria-label="Task title"
        />

        <div role="group" aria-label="Due date" className="flex flex-wrap gap-1.5">
          {QUICK_DATES.map((choice) => (
            <button
              key={choice.key}
              type="button"
              onClick={() => setDue(choice.resolve())}
              aria-pressed={activeQuick === choice.key}
              className={cx(
                'rounded-chip border px-2.5 py-1 text-xs font-medium transition-colors duration-150',
                activeQuick === choice.key
                  ? 'border-line-strong bg-accent-soft text-ink'
                  : 'border-line text-ink-muted hover:bg-hover hover:text-ink',
              )}
            >
              {choice.label}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setShowSchedule((value) => !value)}
            aria-expanded={showSchedule}
            className={cx(
              'ml-auto flex items-center gap-1 rounded-chip border px-2.5 py-1 text-xs font-medium transition-colors duration-150',
              showSchedule || activeQuick === 'custom' || recurrence
                ? 'border-line-strong bg-accent-soft text-ink'
                : 'border-line text-ink-muted hover:bg-hover hover:text-ink',
            )}
          >
            <Icon name="calendar" className="size-3.5" />
            Pick a day
          </button>
        </div>

        {(showSchedule || activeQuick === 'custom' || recurrence) && (
          <div className="space-y-4 rounded-control border border-line bg-inset p-3">
            <Field label="Date">
              {(id) => (
                <TextInput
                  id={id}
                  type="date"
                  value={due}
                  onChange={(event) => setDue(event.target.value)}
                />
              )}
            </Field>

            <Field label="Repeat" hint="Pick the days, as you would for an alarm.">
              {() => <RepeatPicker value={recurrence} dueDate={due} onChange={setRecurrence} />}
            </Field>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-meta text-ink-faint">
            {due ? formatDueDate(due, today) : 'No date'}
            {recurrence && ` · ${describeRecurrence(recurrence)}`}
          </p>
          <Button type="submit" tone="primary" disabled={!title.trim()}>Add</Button>
        </div>

        {added.length > 0 && (
          <div className="rounded-control border border-line bg-inset px-3.5 py-2.5">
            <p className="text-meta font-medium text-ink-muted">
              Added {added.length === 1 ? 'this session' : `${added.length} tasks`}
            </p>
            <ul className="mt-1 space-y-0.5">
              {added.map((entry, index) => (
                <li key={`${entry.title}-${index}`} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">{entry.title}</span>
                  {entry.due && <Badge tone="neutral">{formatDueDate(entry.due, today)}</Badge>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>
    </Dialog>
  );
}
