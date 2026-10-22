import { useEffect, useState } from 'react';
import {
  formatLongDate, selectCompletedOn, selectNoDate, selectOverdue, selectToday,
  selectUpcoming, sortTasks,
} from '@vistaar/core';
import { useWorkspace } from '../app/StoreProvider.jsx';
import { TaskList } from '../components/TaskItem.jsx';
import { Button, EmptyState, Select, Stat } from '../components/ui.jsx';

function TodayWidget({ onOpenTask, onCapture }) {
  const { state, today, actions } = useWorkspace();
  const tasks = sortTasks(selectToday(state.tasks, today), 'due');
  const done = selectCompletedOn(state.tasks, today).length;

  const total = tasks.length + done;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3">
        <Stat
          value={tasks.length}
          label={tasks.length === 1 ? 'task left today' : 'tasks left today'}
          meter={total > 0 ? { value: done, max: total, label: `${done} of ${total} done today` } : undefined}
        />
        {total > 0 && <p className="mt-1.5 tabular text-meta text-ink-faint">{done} of {total} done</p>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <TaskList
          tasks={tasks}
          today={today}
          compact
          onToggle={actions.setCompleted}
          onOpen={onOpenTask}
          emptyState={(
            <EmptyState
              title={done > 0 ? 'Nothing left today' : 'Nothing due today'}
              action={<Button size="sm" onClick={onCapture}>Add a task</Button>}
            />
          )}
        />
      </div>
    </div>
  );
}

function UpcomingWidget({ widget, onOpenTask }) {
  const { state, today, actions } = useWorkspace();
  const horizon = Number(widget.config.horizonDays) || state.settings.upcomingHorizonDays;
  const tasks = sortTasks(selectUpcoming(state.tasks, today, horizon), 'due');

  return (
    <div className="flex h-full flex-col">
      <Stat
        className="mb-3"
        value={tasks.length}
        label={`due in the next ${horizon} day${horizon === 1 ? '' : 's'}`}
      />
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <TaskList
          tasks={tasks}
          today={today}
          compact
          onToggle={actions.setCompleted}
          onOpen={onOpenTask}
          emptyState={<EmptyState title="Nothing coming up" />}
        />
      </div>
    </div>
  );
}

function OverdueWidget({ onOpenTask, onNavigate }) {
  const { state, today, actions } = useWorkspace();
  const tasks = sortTasks(selectOverdue(state.tasks, today), 'due');

  if (tasks.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <p className="tabular text-display font-semibold text-ink">0</p>
        <p className="mt-1 text-meta text-ink-muted">nothing overdue</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Stat className="mb-3" value={tasks.length} label="overdue" tone="danger" />
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <TaskList tasks={tasks.slice(0, 6)} today={today} compact onToggle={actions.setCompleted} onOpen={onOpenTask} />
      </div>
      {tasks.length > 6 && (
        <Button size="sm" tone="quiet" className="mt-1" onClick={() => onNavigate('tasks', 'overdue')}>
          See all {tasks.length}
        </Button>
      )}
    </div>
  );
}

function ClockWidget({ widget }) {
  const { today } = useWorkspace();
  const [now, setNow] = useState(() => new Date());
  const seconds = widget.config.showSeconds === true;

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), seconds ? 1000 : 20000);
    return () => clearInterval(interval);
  }, [seconds]);

  const time = now.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
  });

  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <p className="tabular text-display font-semibold text-ink">{time}</p>
      <p className="mt-1.5 text-meta text-ink-muted">{formatLongDate(today)}</p>
    </div>
  );
}

function NotesWidget() {
  const { state, actions } = useWorkspace();
  return (
    <div className="flex h-full flex-col">
      <textarea
        value={state.notes.text}
        onChange={(event) => actions.setNotes(event.target.value)}
        placeholder="Anything you need for an hour — a link, a number, a half-thought."
        aria-label="Scratchpad"
        className="min-h-24 flex-1 resize-none rounded-control border border-line bg-inset p-3 text-sm leading-relaxed text-ink transition-colors duration-150 placeholder:text-ink-faint hover:border-line-strong focus:border-line-strong"
      />
      <p className="mt-2 text-[10px] text-ink-faint">Saved as you type.</p>
    </div>
  );
}

function UndatedWidget({ onOpenTask, onNavigate }) {
  const { state, today, actions } = useWorkspace();
  const tasks = selectNoDate(state.tasks);
  return (
    <div className="flex h-full flex-col">
      <Stat className="mb-3" value={tasks.length} label="without a date" />
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <TaskList
          tasks={tasks.slice(0, 6)}
          today={today}
          compact
          showDate={false}
          onToggle={actions.setCompleted}
          onOpen={onOpenTask}
          emptyState={<EmptyState title="Every task has a date" />}
        />
      </div>
      {tasks.length > 6 && (
        <Button size="sm" tone="quiet" className="mt-1" onClick={() => onNavigate('tasks', 'nodate')}>
          See all {tasks.length}
        </Button>
      )}
    </div>
  );
}

function HorizonConfig({ widget, onChange }) {
  return (
    <label className="flex items-center gap-2 text-meta text-ink-muted">
      Horizon
      <Select
        value={String(Number(widget.config.horizonDays) || 7)}
        onChange={(event) => onChange({ horizonDays: Number(event.target.value) })}
        className="h-7 w-auto py-0 text-[11px]"
      >
        {[3, 7, 14, 30].map((days) => <option key={days} value={days}>{days} days</option>)}
      </Select>
    </label>
  );
}

function SecondsConfig({ widget, onChange }) {
  const on = widget.config.showSeconds === true;
  return (
    <label className="flex items-center gap-2 text-meta text-ink-muted">
      <input
        type="checkbox"
        checked={on}
        onChange={(event) => onChange({ showSeconds: event.target.checked })}
        className="size-3.5 accent-[var(--app-accent)]"
      />
      Show seconds
    </label>
  );
}

/** Widget configuration exists only where it changes meaning, never for decoration. */
export const WIDGETS = {
  today: {
    name: "Today's tasks",
    description: 'Due today, plus everything overdue.',
    sizes: ['2x1', '2x2'],
    render: TodayWidget,
  },
  upcoming: {
    name: 'Upcoming',
    description: 'What is due within a horizon you choose.',
    sizes: ['1x1', '2x1', '2x2'],
    render: UpcomingWidget,
    Config: HorizonConfig,
  },
  overdue: {
    name: 'Overdue',
    description: 'A count, and the oldest few.',
    sizes: ['1x1', '2x1'],
    render: OverdueWidget,
  },
  clock: {
    name: 'Clock and date',
    description: 'Local time and today’s date.',
    sizes: ['1x1', '2x1'],
    render: ClockWidget,
    Config: SecondsConfig,
  },
  notes: {
    name: 'Scratchpad',
    description: 'One plain note, saved as you type.',
    sizes: ['1x1', '2x1', '2x2'],
    render: NotesWidget,
  },
  undated: {
    name: 'No due date',
    description: 'Open tasks that are not on the calendar.',
    sizes: ['1x1', '2x1'],
    render: UndatedWidget,
  },
};

export const WIDGET_TYPES = Object.keys(WIDGETS);
