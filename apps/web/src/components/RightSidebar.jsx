import { useMemo } from 'react';
import { formatLongDate, selectCompletedOn, selectToday, sortTasks } from '@kalpvan/core';
import { useWorkspace } from '../app/StoreProvider.jsx';
import { TaskList } from './TaskItem.jsx';
import { Button, Drawer, EmptyState } from './ui.jsx';
import { Icon } from './icons.jsx';

/**
 * A desktop convenience, not a third core surface: collapsed by default.
 *
 * It opens as an overlay drawer, the same as a widget's edit panel, rather than
 * squeezing the page narrower. Two reasons: reflowing the dashboard to make room
 * changed how many grid columns fit, which moved widgets around just for opening
 * a side panel; and a panel that pushes is a different interaction from one that
 * floats, which made the two panels feel like unrelated parts of the app.
 *
 * Only one of the two is ever open — see `Workspace`, which closes the other.
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
    <Drawer open onClose={onClose} title="Today" description={formatLongDate(today)}>
      <div className="space-y-5">
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
    </Drawer>
  );
}
