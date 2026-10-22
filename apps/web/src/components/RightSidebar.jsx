import { useMemo } from 'react';
import { formatLongDate, selectCompletedOn, selectToday, sortTasks } from '@vistaar/core';
import { useWorkspace } from '../app/StoreProvider.jsx';
import { TaskList } from './TaskItem.jsx';
import { Button, EmptyState, IconButton } from './ui.jsx';
import { Icon } from './icons.jsx';

/**
 * A desktop convenience, not a third core surface: collapsed by default, and
 * absent on phones where its contents would crowd out the main area.
 */
export function RightSidebar({ open, onClose, onOpenTask, onCapture, onNavigate }) {
  const { state, today, actions } = useWorkspace();

  const { remaining, completedToday } = useMemo(() => ({
    remaining: sortTasks(selectToday(state.tasks, today), 'due'),
    completedToday: selectCompletedOn(state.tasks, today)
      .sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1)),
  }), [state.tasks, today]);

  if (!open) return null;

  return (
    <aside
      aria-label="Today"
      className="fixed inset-y-0 right-0 z-30 hidden w-72 flex-col overflow-y-auto border-l border-line bg-canvas scrollbar-thin lg:flex"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-canvas/95 px-4 py-3.5 backdrop-blur-md">
        <div>
          <p className="text-card font-semibold text-ink">Today</p>
          <p className="mt-0.5 text-meta text-ink-faint">{formatLongDate(today)}</p>
        </div>
        <IconButton label="Hide the today panel" onClick={onClose}>
          <Icon name="chevronRight" className="size-4" />
        </IconButton>
      </div>

      <div className="space-y-5 p-4">
        <section>
          <h3 className="mb-2 flex items-center justify-between text-meta font-medium text-ink-muted">
            Remaining
            <span className="font-mono text-ink-muted">{remaining.length}</span>
          </h3>
          <TaskList
            tasks={remaining}
            today={today}
            compact
            onToggle={actions.setCompleted}
            onOpen={onOpenTask}
            emptyState={(
              <EmptyState
                title={completedToday.length > 0 ? 'Nothing left today' : 'Nothing due today'}
                description={completedToday.length > 0 ? undefined : 'Undated tasks are waiting in Tasks.'}
              />
            )}
          />
        </section>

        {completedToday.length > 0 && (
          <section>
            <h3 className="mb-2 flex items-center justify-between text-meta font-medium text-ink-muted">
              Completed today
              <span className="font-mono text-ink-muted">{completedToday.length}</span>
            </h3>
            <TaskList
              tasks={completedToday}
              today={today}
              compact
              showDate={false}
              onToggle={actions.setCompleted}
              onOpen={onOpenTask}
            />
          </section>
        )}

        <section className="space-y-2 border-t border-line pt-4">
          <h3 className="text-meta font-medium text-ink-muted">Quick actions</h3>
          <div className="grid gap-2">
            <Button size="sm" onClick={onCapture} className="justify-start">
              <Icon name="plus" className="size-4" /> New task
            </Button>
            <Button size="sm" onClick={() => onNavigate('calendar')} className="justify-start">
              <Icon name="calendar" className="size-4" /> Open calendar
            </Button>
          </div>
        </section>
      </div>
    </aside>
  );
}
