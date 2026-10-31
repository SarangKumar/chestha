import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDueDate, isCompleted, matchesQuery, sortTasks } from '@chestha/core';
import { useWorkspace } from '../app/StoreProvider.jsx';
import { Dialog, TextInput, cx } from './ui.jsx';

/**
 * Everything here is also reachable through the normal UI; the palette is a
 * shortcut, never the only route to a feature.
 */
export function CommandPalette({ open, onClose, commands, onOpenTask }) {
  const { state, today } = useWorkspace();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (open) { setQuery(''); setActive(0); }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matchedCommands = commands
      .filter((command) => {
        if (!q) return true;
        const haystack = `${command.label} ${command.group ?? ''} ${command.keywords ?? ''}`.toLowerCase();
        return haystack.includes(q);
      })
      .map((command) => ({ kind: 'command', id: command.id, ...command }));

    // The palette doubles as find-and-open once there is something to find.
    const matchedTasks = q.length >= 2
      ? sortTasks(state.tasks.filter((task) => matchesQuery(task, q)), 'due')
        .slice(0, 6)
        .map((task) => ({
          kind: 'task',
          id: `task:${task.id}`,
          label: task.title,
          group: 'Tasks',
          hint: task.due ? formatDueDate(task.due, today) : 'No date',
          done: isCompleted(task),
          run: () => onOpenTask(task.id),
        }))
      : [];

    return [...matchedCommands, ...matchedTasks];
  }, [commands, query, state.tasks, today, onOpenTask]);

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, results.length - 1)));
  }, [results.length]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, results]);

  const run = (item) => {
    onClose();
    // Let the dialog restore focus before the destination mounts.
    requestAnimationFrame(() => item.run?.());
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => (results.length === 0 ? 0 : (i + 1) % results.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (results.length === 0 ? 0 : (i - 1 + results.length) % results.length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = results[active];
      if (item) run(item);
    }
  };

  let lastGroup = null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      initialFocus={inputRef}
      title="Command palette"
      description="Type to filter. Arrow keys move, Enter runs, Escape closes."
    >
      <div onKeyDown={onKeyDown}>
        <TextInput
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search commands and tasks…"
          autoComplete="off"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-results"
          aria-activedescendant={results[active] ? `palette-${results[active].id}` : undefined}
          className="h-11 text-base"
        />

        <ul id="palette-results" ref={listRef} role="listbox" className="mt-3 max-h-80 space-y-0.5 overflow-y-auto scrollbar-thin">
          {results.length === 0 && (
            <li className="px-2 py-6 text-center text-sm text-ink-muted">Nothing matches “{query.trim()}”.</li>
          )}
          {results.map((item, index) => {
            const showGroup = item.group && item.group !== lastGroup;
            lastGroup = item.group ?? lastGroup;
            return (
              <li key={item.id}>
                {showGroup && (
                  <p className="px-2 pb-1 pt-2 text-meta font-medium text-ink-muted">
                    {item.group}
                  </p>
                )}
                <div
                  id={`palette-${item.id}`}
                  role="option"
                  aria-selected={index === active}
                  data-active={index === active}
                  tabIndex={-1}
                  onClick={() => run(item)}
                  onMouseEnter={() => setActive(index)}
                  className={cx(
                    'flex cursor-pointer items-center gap-2 rounded-control px-2.5 py-2 text-sm',
                    index === active ? 'bg-accent-soft text-ink' : 'text-ink',
                  )}
                >
                  <span className={cx('min-w-0 flex-1 truncate', item.done && 'line-through opacity-60')}>
                    {item.label}
                  </span>
                  {item.hint && <span className="shrink-0 text-xs text-ink-faint">{item.hint}</span>}
                  {item.shortcut && (
                    <kbd className="shrink-0 rounded-chip border border-line bg-inset px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
                      {item.shortcut}
                    </kbd>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Dialog>
  );
}
