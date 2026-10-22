import { useMemo, useState } from 'react';
import {
  PRIORITIES, SORTS, isCompleted, matchesQuery, selectCompleted, selectNoDate,
  selectOverdue, selectToday, selectUpcoming, sortTasks, sortWithCompletedLast, tagKey,
} from '@vistaar/core';
import { useWorkspace } from '../app/StoreProvider.jsx';
import { PRIORITY_LABEL, TaskList } from '../components/TaskItem.jsx';
import { Button, EmptyState, Panel, SectionHeader, Select, TextInput, cx } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';

const VIEWS = [
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'nodate', label: 'No date' },
  { id: 'completed', label: 'Completed' },
  { id: 'all', label: 'All' },
];

const EMPTY_COPY = {
  today: ['Nothing due today', 'Overdue tasks would show here too.'],
  upcoming: ['Nothing coming up', 'Tasks due within your horizon appear here.'],
  overdue: ['Nothing overdue', 'Everything with a past date is done or rescheduled.'],
  nodate: ['No undated tasks', 'Tasks without a due date collect here so they never go missing.'],
  completed: ['Nothing completed yet', 'Completed tasks stay here and can be reopened.'],
  all: ['No tasks yet', 'Press N anywhere to capture one.'],
};

export function Tasks({ view, onChangeView, onOpenTask, onCapture }) {
  const { state, today, actions } = useWorkspace();
  const { settings, tasks } = state;
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('all');
  const [priority, setPriority] = useState('all');
  const [sort, setSort] = useState('due');

  const counts = useMemo(() => ({
    today: selectToday(tasks, today).length,
    upcoming: selectUpcoming(tasks, today, settings.upcomingHorizonDays).length,
    overdue: selectOverdue(tasks, today).length,
    nodate: selectNoDate(tasks).length,
    completed: selectCompleted(tasks).length,
    all: tasks.length,
  }), [tasks, today, settings.upcomingHorizonDays]);

  const visible = useMemo(() => {
    const byView = {
      today: selectToday(tasks, today),
      upcoming: selectUpcoming(tasks, today, settings.upcomingHorizonDays),
      overdue: selectOverdue(tasks, today),
      nodate: selectNoDate(tasks),
      completed: selectCompleted(tasks),
      all: tasks,
    }[view] ?? tasks;

    const filtered = byView.filter((task) => {
      if (!matchesQuery(task, query)) return false;
      if (tag !== 'all' && !task.tags.some((t) => tagKey(t) === tag)) return false;
      if (priority !== 'all' && task.priority !== priority) return false;
      if (settings.hideCompleted && view !== 'completed' && isCompleted(task)) return false;
      return true;
    });

    return view === 'completed' ? sortTasks(filtered, sort) : sortWithCompletedLast(filtered, sort);
  }, [tasks, view, today, settings.upcomingHorizonDays, settings.hideCompleted, query, tag, priority, sort]);

  const usedTags = useMemo(() => {
    const seen = new Map();
    for (const task of tasks) {
      for (const t of task.tags) if (!seen.has(tagKey(t))) seen.set(tagKey(t), t);
    }
    return [...seen.entries()];
  }, [tasks]);

  const filtersActive = query.trim() !== '' || tag !== 'all' || priority !== 'all';
  const [emptyTitle, emptyBody] = EMPTY_COPY[view] ?? EMPTY_COPY.all;

  return (
    <div>
      <SectionHeader
        title="Tasks"
        description="Only a title is required. Completed tasks stay reachable, and undated tasks have their own view."
      >
        <Button tone="primary" onClick={onCapture}>
          <Icon name="plus" className="size-4" /> New task
        </Button>
      </SectionHeader>

      <div role="tablist" aria-label="Task views" className="mb-4 flex flex-wrap gap-1 rounded-card border border-line bg-surface p-1 shadow-card">
        {VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={view === item.id}
            onClick={() => onChangeView(item.id)}
            className={cx(
              'flex items-center gap-1.5 rounded-chip px-2.5 py-1.5 text-sm font-medium',
              'transition-colors duration-150',
              view === item.id ? 'bg-accent-soft text-ink' : 'text-ink-muted hover:bg-hover hover:text-ink',
            )}
          >
            {item.label}
            <span className={cx(
              'rounded-chip px-1 tabular text-[10px]',
              item.id === 'overdue' && counts.overdue > 0 && view !== 'overdue' ? 'bg-danger-soft text-danger' : 'text-ink-faint',
            )}>
              {counts[item.id]}
            </span>
          </button>
        ))}
      </div>

      <Panel className="mb-4 p-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative min-w-0 sm:min-w-40 sm:flex-1">
            <TextInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by text…"
              aria-label="Filter tasks by text"
              className="pl-8"
            />
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint">
              <Icon name="search" className="size-4" />
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <Select value={tag} onChange={(event) => setTag(event.target.value)} aria-label="Filter by tag" className="min-w-0 sm:w-auto sm:min-w-28">
              <option value="all">All tags</option>
              {usedTags.map(([key, label]) => <option key={key} value={key}>#{label}</option>)}
            </Select>

            <Select value={priority} onChange={(event) => setPriority(event.target.value)} aria-label="Filter by priority" className="min-w-0 sm:w-auto sm:min-w-28">
              <option value="all">Any priority</option>
              {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </Select>

            <Select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort tasks" className="min-w-0 sm:w-auto sm:min-w-32">
              {Object.entries(SORTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>

            {filtersActive && (
              <Button size="sm" tone="quiet" onClick={() => { setQuery(''); setTag('all'); setPriority('all'); }}>
                Clear filters
              </Button>
            )}
          </div>
        </div>
      </Panel>

      <Panel className="p-2.5 sm:p-3">
        <TaskList
          tasks={visible}
          today={today}
          onToggle={actions.setCompleted}
          onOpen={onOpenTask}
          onDelete={actions.deleteTask}
          showDate={view !== 'nodate'}
          emptyState={(
            <EmptyState
              title={filtersActive ? 'Nothing matches these filters' : emptyTitle}
              description={filtersActive ? 'Clear the filters to see the rest of this view.' : emptyBody}
              action={!filtersActive && (
                <Button size="sm" tone="primary" onClick={onCapture}>Add a task</Button>
              )}
            />
          )}
        />
      </Panel>

      {visible.length > 0 && (
        <p className="mt-3 px-1 text-meta text-ink-faint">
          Showing {visible.length} of {counts[view]} in this view.
          {settings.hideCompleted && view !== 'completed' && ' Completed tasks are hidden (Settings).'}
        </p>
      )}
    </div>
  );
}
