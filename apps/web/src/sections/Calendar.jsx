import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDays, addMonths, describeRecurrence, formatLongDate, isCompleted, isRecurring, isSameMonth,
  monthGrid, monthLabel, occurrencesInRange, orderedWeekdays, selectDueOn, selectNoDate, sortTasks,
  startOfMonth, weekdayIndex,
} from '@kalpvan/core';
import { useWorkspace } from '../app/StoreProvider.jsx';
import { TaskList } from '../components/TaskItem.jsx';
import { Button, EmptyState, Panel, SectionHeader, cx } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';

const MAX_CHIPS = 3;

/**
 * The calendar renders tasks and stores nothing of its own, so a change made
 * anywhere shows up here with no reconciliation step.
 */
export function Calendar({ selected, onSelect, onOpenTask, onCreateOn, onNavigate }) {
  const { state, today, actions } = useWorkspace();
  const { settings, tasks } = state;
  const [cursor, setCursor] = useState(() => startOfMonth(selected ?? today));
  const gridRef = useRef(null);
  const focusTarget = useRef(null);

  const activeDay = selected ?? today;

  useEffect(() => {
    if (!isSameMonth(activeDay, cursor)) setCursor(startOfMonth(activeDay));
  }, [activeDay]); // eslint-disable-line react-hooks/exhaustive-deps

  const weeks = useMemo(() => monthGrid(cursor, settings.weekStartsOn), [cursor, settings.weekStartsOn]);

  const byDate = useMemo(() => {
    const map = new Map();
    for (const task of tasks) {
      if (!task.due) continue;
      const list = map.get(task.due);
      if (list) list.push(task);
      else map.set(task.due, [task]);
    }
    for (const list of map.values()) list.splice(0, list.length, ...sortTasks(list, 'priority'));
    return map;
  }, [tasks]);

  /**
   * Future dates a repeating task lands on, projected across the visible month.
   *
   * These are not stored tasks: the model keeps one record per recurring task and
   * creates the next when you complete it. Without projecting, a daily task would
   * show on a single day. They are drawn differently and open the real task for
   * editing, so there is never any doubt which one you can tick off.
   */
  const projected = useMemo(() => {
    const first = weeks[0][0];
    const last = weeks[5][6];
    const map = new Map();
    for (const task of tasks) {
      // A completed one has already spawned its successor; projecting it too
      // would show the same series twice.
      if (!isRecurring(task) || isCompleted(task)) continue;
      for (const date of occurrencesInRange(task, first, last)) {
        const list = map.get(date);
        if (list) list.push(task);
        else map.set(date, [task]);
      }
    }
    return map;
  }, [tasks, weeks]);

  const undated = useMemo(() => selectNoDate(tasks), [tasks]);
  const dayTasks = useMemo(() => sortTasks(selectDueOn(tasks, activeDay), 'priority'), [tasks, activeDay]);
  const dayRepeats = useMemo(() => projected.get(activeDay) ?? [], [projected, activeDay]);

  useEffect(() => {
    if (focusTarget.current) {
      gridRef.current?.querySelector(`[data-date="${focusTarget.current}"]`)?.focus();
      focusTarget.current = null;
    }
  });

  const move = (iso, delta) => {
    const next = addDays(iso, delta);
    focusTarget.current = next;
    if (!isSameMonth(next, cursor)) setCursor(startOfMonth(next));
    onSelect(next);
  };

  const onGridKeyDown = (event, iso) => {
    const deltas = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (deltas[event.key] !== undefined) {
      event.preventDefault();
      move(iso, deltas[event.key]);
    } else if (event.key === 'Home') {
      event.preventDefault();
      move(iso, -((weekdayIndex(iso) - settings.weekStartsOn + 7) % 7));
    }
  };

  return (
    <div>
      <SectionHeader
        title="Calendar"
        description="Tasks shown on their due dates. Editing here edits the one task record."
      >
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={() => setCursor(addMonths(cursor, -1))} aria-label="Previous month">
            <Icon name="chevronLeft" className="size-4" />
          </Button>
          <Button size="sm" onClick={() => { setCursor(startOfMonth(today)); onSelect(today); }}>Today</Button>
          <Button size="sm" onClick={() => setCursor(addMonths(cursor, 1))} aria-label="Next month">
            <Icon name="chevronRight" className="size-4" />
          </Button>
        </div>
      </SectionHeader>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h3 className="text-card font-semibold text-ink" aria-live="polite">{monthLabel(cursor)}</h3>
            <p className="hidden text-meta text-ink-faint sm:block">Arrow keys move by day</p>
          </div>

          <div className="grid grid-cols-7 border-b border-line">
            {orderedWeekdays(settings.weekStartsOn).map((day) => (
              <div key={day} className="px-1 py-2 text-center text-[10px] font-medium text-ink-faint">
                <span aria-hidden="true">{day.slice(0, 1)}</span>
                <span className="sr-only">{day}</span>
                <span className="hidden sm:inline" aria-hidden="true">{day.slice(1, 3)}</span>
              </div>
            ))}
          </div>

          <div ref={gridRef} role="grid" aria-label={`${monthLabel(cursor)}, tasks by due date`}>
            {weeks.map((week) => (
              <div key={week[0]} role="row" className="grid grid-cols-7">
                {week.map((iso) => {
                  const dayList = byDate.get(iso) ?? [];
                  const repeats = projected.get(iso) ?? [];
                  const open = dayList.filter((t) => !isCompleted(t));
                  const overdue = iso < today && open.length > 0;
                  const inMonth = isSameMonth(iso, cursor);
                  const isToday = iso === today;
                  const isActive = iso === activeDay;
                  const hidden = Math.max(0, dayList.length - MAX_CHIPS);

                  return (
                    <div key={iso} role="gridcell" className="border-b border-r border-line last:border-r-0">
                      <button
                        type="button"
                        data-date={iso}
                        tabIndex={isActive ? 0 : -1}
                        onClick={() => onSelect(iso)}
                        onDoubleClick={() => onCreateOn(iso)}
                        onKeyDown={(event) => onGridKeyDown(event, iso)}
                        aria-current={isToday ? 'date' : undefined}
                        aria-label={[
                          formatLongDate(iso),
                          `${dayList.length} task${dayList.length === 1 ? '' : 's'}`,
                          repeats.length ? `${repeats.length} repeating` : null,
                          overdue ? `${open.length} overdue` : null,
                          isToday ? 'today' : null,
                        ].filter(Boolean).join(', ')}
                        className={cx(
                          'flex h-24 w-full flex-col items-stretch gap-0.5 p-1.5 text-left',
                          'transition-colors duration-150 sm:h-28',
                          !inMonth && 'opacity-45',
                          isActive ? 'bg-accent-soft' : 'hover:bg-hover',
                        )}
                      >
                        <span className="flex items-center justify-between px-0.5">
                          <span className={cx(
                            'inline-flex size-5 items-center justify-center rounded-full text-[11px] tabular',
                            isToday ? 'bg-accent font-semibold text-on-accent' : 'font-medium text-ink',
                          )}>
                            {Number(iso.slice(8, 10))}
                          </span>
                          {overdue && <span className="size-1.5 rounded-full bg-danger" aria-hidden="true" />}
                        </span>

                        <span className="min-h-0 flex-1 space-y-0.5 overflow-hidden">
                          {dayList.slice(0, MAX_CHIPS).map((task) => (
                            <span
                              key={task.id}
                              className={cx(
                                'block truncate rounded-chip px-1.5 py-0.5 text-[10px] leading-tight',
                                isCompleted(task) && 'text-ink-faint line-through decoration-1',
                                !isCompleted(task) && iso < today && 'bg-danger-soft text-danger',
                                !isCompleted(task) && iso >= today && 'bg-inset text-ink-muted',
                              )}
                            >
                              {task.title}
                            </span>
                          ))}
                          {/* Projected occurrences: outlined rather than filled,
                              so a real task is never confused with a repeat. */}
                          {repeats.slice(0, Math.max(0, MAX_CHIPS - dayList.length)).map((task) => (
                            <span
                              key={`repeat-${task.id}`}
                              className="block truncate rounded-chip border border-dashed border-line-strong px-1.5 py-0.5 text-[10px] leading-tight text-ink-faint"
                            >
                              {task.title}
                            </span>
                          ))}
                          {hidden > 0 && (
                            <span className="block px-1.5 pt-0.5 text-[10px] font-medium text-ink-faint">+{hidden} more</span>
                          )}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel className="p-4">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-card font-semibold text-ink">{formatLongDate(activeDay)}</h3>
                <p className="mt-0.5 text-meta text-ink-faint">
                  {dayTasks.length} task{dayTasks.length === 1 ? '' : 's'} due
                  {dayRepeats.length > 0 && ` · ${dayRepeats.length} repeating`}
                </p>
              </div>
              <Button size="sm" tone="primary" onClick={() => onCreateOn(activeDay)}>
                <Icon name="plus" className="size-4" /> Add
              </Button>
            </div>

            <TaskList
              tasks={dayTasks}
              today={today}
              compact
              showDate={false}
              onToggle={actions.setCompleted}
              onOpen={onOpenTask}
              onDelete={actions.deleteTask}
              emptyState={dayRepeats.length > 0 ? null : (
                <EmptyState
                  title="Nothing due on this date"
                  action={<Button size="sm" onClick={() => onCreateOn(activeDay)}>Add a task here</Button>}
                />
              )}
            />

            {dayRepeats.length > 0 && (
              <div className={dayTasks.length > 0 ? 'mt-3 border-t border-line pt-3' : ''}>
                <p className="mb-1.5 text-meta font-medium text-ink-muted">Repeats on this day</p>
                <ul className="space-y-0.5">
                  {dayRepeats.map((task) => (
                    <li key={task.id}>
                      <button
                        type="button"
                        onClick={() => onOpenTask(task.id)}
                        title={`Edit “${task.title}” — ${describeRecurrence(task.recurrence)}`}
                        className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left transition-colors duration-150 hover:bg-hover"
                      >
                        <Icon name="repeat" className="size-3.5 shrink-0 text-ink-faint" />
                        <span className="min-w-0 flex-1 truncate text-sm text-ink-muted">{task.title}</span>
                        <span className="shrink-0 text-[10px] text-ink-faint">
                          {describeRecurrence(task.recurrence).replace(/^Every /, '')}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-[10px] leading-relaxed text-ink-faint">
                  Shown from the repeat pattern. Only the current occurrence can be ticked off —
                  completing it creates the next. Select one to edit the series.
                </p>
              </div>
            )}
          </Panel>

          {/* Undated tasks are never invisible: the calendar acknowledges them. */}
          <Panel className="p-4">
            <h3 className="text-card font-semibold text-ink">No due date</h3>
            <p className="mb-3 mt-0.5 text-meta text-ink-faint">
              {undated.length === 0
                ? 'Every open task has a date.'
                : `${undated.length} open task${undated.length === 1 ? '' : 's'} are not on the calendar.`}
            </p>
            {undated.length > 0 && (
              <>
                <TaskList
                  tasks={undated.slice(0, 4)}
                  today={today}
                  compact
                  showDate={false}
                  onToggle={actions.setCompleted}
                  onOpen={onOpenTask}
                />
                <Button size="sm" tone="quiet" className="mt-2 w-full" onClick={() => onNavigate('tasks', 'nodate')}>
                  See all undated tasks
                </Button>
              </>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
