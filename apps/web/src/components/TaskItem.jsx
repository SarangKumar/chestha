import { PRIORITIES, describeRecurrence, formatDueDate, isCompleted, isOverdue, isRecurring } from '@kalpvan/core';
import { Icon } from './icons.jsx';
import { Badge, IconButton, cx } from './ui.jsx';

const PRIORITY_LABEL = { none: 'No priority', low: 'Low', medium: 'Medium', high: 'High' };
const PRIORITY_DOT = {
  none: 'bg-transparent border border-line-strong',
  low: 'bg-ink-faint',
  medium: 'bg-warn',
  high: 'bg-danger',
};

export function PriorityDot({ priority }) {
  if (priority === 'none') return null;
  return (
    <span
      className={cx('inline-block size-2 shrink-0 rounded-full', PRIORITY_DOT[priority])}
      title={`${PRIORITY_LABEL[priority]} priority`}
      aria-label={`${PRIORITY_LABEL[priority]} priority`}
      role="img"
    />
  );
}

export function TaskItem({ task, today, onToggle, onOpen, onDelete, compact = false, showDate = true }) {
  const done = isCompleted(task);
  const overdue = isOverdue(task, today);
  const dueToday = !done && task.due === today;

  return (
    <li
      className={cx(
        'group flex items-start gap-3 rounded-control px-2.5 py-2.5',
        'transition-colors duration-150 hover:bg-hover',
        done && 'opacity-55',
      )}
    >
      <input
        type="checkbox"
        checked={done}
        onChange={(event) => onToggle(task.id, event.target.checked)}
        aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[var(--app-accent)]"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <PriorityDot priority={task.priority} />
          <button
            type="button"
            onClick={() => onOpen(task.id)}
            className={cx(
              'min-w-0 flex-1 text-left text-sm leading-snug text-ink',
              done && 'line-through decoration-ink-faint decoration-1',
            )}
          >
            <span className="break-words">{task.title}</span>
          </button>
        </div>

        {!compact && task.notes && (
          <p className="mt-1 line-clamp-2 pl-0 text-xs leading-relaxed text-ink-muted">{task.notes}</p>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 empty:mt-0">
          {showDate && task.due && (
            <Badge tone={overdue ? 'danger' : dueToday ? 'solid' : 'neutral'}>
              {overdue && <span aria-hidden="true">!</span>}
              {formatDueDate(task.due, today)}
            </Badge>
          )}
          {!task.due && !done && showDate && <Badge tone="neutral">No date</Badge>}
          {isRecurring(task) && (
            <Badge tone="neutral" title={describeRecurrence(task.recurrence)}>
              <Icon name="repeat" className="size-3" />
              {describeRecurrence(task.recurrence).replace(/^Every /, '')}
            </Badge>
          )}
          {task.tags.map((tag) => (
            <Badge key={tag} tone="neutral">#{tag}</Badge>
          ))}
        </div>
      </div>

      {onDelete && (
        <IconButton
          label={`Delete ${task.title}`}
          onClick={() => onDelete(task.id)}
          className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100 hover:text-danger"
        >
          <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M4 6h12M8 6V4.5h4V6m-6 0 .6 9.5h6.8L14 6" strokeLinecap="round" />
          </svg>
        </IconButton>
      )}
    </li>
  );
}

export function TaskList({ tasks, today, onToggle, onOpen, onDelete, compact, showDate, emptyState }) {
  // Returned bare, so a caller passing `className="h-full"` can make the empty
  // state fill the space rather than being boxed by a wrapper.
  if (tasks.length === 0) return emptyState ?? null;
  return (
    <ul className="-mx-1 space-y-0.5">
      {tasks.map((task) => (
        <TaskItem
          key={task.id}
          task={task}
          today={today}
          onToggle={onToggle}
          onOpen={onOpen}
          onDelete={onDelete}
          compact={compact}
          showDate={showDate}
        />
      ))}
    </ul>
  );
}

export { PRIORITIES, PRIORITY_LABEL };
