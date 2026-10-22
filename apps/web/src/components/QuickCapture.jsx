import { useEffect, useRef, useState } from 'react';
import { addDays, todayISO } from '@vistaar/core';
import { useWorkspace } from '../app/StoreProvider.jsx';
import { Button, Dialog, TextInput, cx } from './ui.jsx';

const DUE_CHOICES = [
  { key: 'none', label: 'No date', resolve: () => null },
  { key: 'today', label: 'Today', resolve: () => todayISO() },
  { key: 'tomorrow', label: 'Tomorrow', resolve: () => addDays(todayISO(), 1) },
];

/**
 * Capture asks for a title and nothing else, and stays open after Enter so a
 * run of tasks can be entered without reopening it.
 */
export function QuickCapture({ open, onClose }) {
  const { actions } = useWorkspace();
  const [title, setTitle] = useState('');
  const [dueChoice, setDueChoice] = useState('none');
  const [added, setAdded] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setAdded([]);
    setDueChoice('none');
  }, [open]);

  const submit = (event) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    const due = DUE_CHOICES.find((c) => c.key === dueChoice)?.resolve() ?? null;
    const task = actions.addTask({ title: trimmed, due });
    if (task) setAdded((list) => [task.title, ...list].slice(0, 4));
    setTitle('');
    inputRef.current?.focus();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      initialFocus={inputRef}
      size="md"
      title="Quick capture"
      description="Enter adds the task and keeps this open. Escape closes it."
    >
      <form onSubmit={submit} className="space-y-3">
        <TextInput
          ref={inputRef}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Add a task…"
          autoComplete="off"
          className="h-11 text-base"
          aria-label="Task title"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div role="group" aria-label="Due date" className="flex gap-1">
            {DUE_CHOICES.map((choice) => (
              <button
                key={choice.key}
                type="button"
                onClick={() => setDueChoice(choice.key)}
                aria-pressed={dueChoice === choice.key}
                className={cx(
                  'rounded-chip border px-2.5 py-1 text-xs font-medium transition-colors duration-150',
                  dueChoice === choice.key
                    ? 'border-line-strong bg-accent-soft text-ink'
                    : 'border-line text-ink-muted hover:bg-hover hover:text-ink',
                )}
              >
                {choice.label}
              </button>
            ))}
          </div>
          <Button type="submit" tone="primary" disabled={!title.trim()}>Add</Button>
        </div>

        {added.length > 0 && (
          <div className="rounded-control border border-line bg-inset px-3.5 py-2.5">
            <p className="text-meta font-medium text-ink-muted">
              Added {added.length === 1 ? 'this session' : `${added.length} tasks`}
            </p>
            <ul className="mt-1 space-y-0.5">
              {added.map((entry, index) => (
                <li key={`${entry}-${index}`} className="truncate text-xs text-ink-muted">{entry}</li>
              ))}
            </ul>
          </div>
        )}
      </form>
    </Dialog>
  );
}
