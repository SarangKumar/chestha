import { completedLocalDay, formatDueDate } from '@vistaar/core';
import { useWorkspace } from '../../app/StoreProvider.jsx';
import { Badge, IconButton, cx } from '../../components/ui.jsx';
import { Icon } from '../../components/icons.jsx';

/**
 * The manual-tracking controls for one question: bookmark, record a solve, and
 * the solve count. Manual tracking is the primary path — it must work for
 * premium questions, questions solved offline, and anything an import cannot see.
 */
export function QuestionActions({ slug, title, state, user }) {
  const { actions, notify, state: workspace } = useWorkspace();
  const solves = state.events.filter((e) => e.kind === 'solve');
  const lastSolve = solves.length ? solves[solves.length - 1] : null;
  const solved = solves.length > 0;

  const markSolved = () => {
    const previousSchedule = workspace['dsa.progress'].schedules[slug] ?? null;
    const event = actions.recordDsaEvent(slug, { kind: 'solve' });
    notify(
      solved
        ? `Recorded another solve of “${title}” (${solves.length + 1} total)`
        : `Marked “${title}” solved`,
      {
        actionLabel: 'Undo',
        onAction: () => actions.removeDsaEvent(event.id, slug, previousSchedule),
      },
    );
  };

  const toggleBookmark = () => {
    const now = actions.toggleDsaBookmark(slug);
    notify(now ? `Bookmarked “${title}”` : `Removed the bookmark on “${title}”`, {
      actionLabel: 'Undo',
      onAction: () => actions.toggleDsaBookmark(slug),
    });
  };

  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {solves.length > 1 && (
        <Badge
          tone="neutral"
          title={`Solved ${solves.length} times. Most recently ${formatDueDate(completedLocalDay({ completedAt: lastSolve.at }))}.`}
        >
          ×{solves.length}
        </Badge>
      )}

      <IconButton
        label={user.bookmarked ? `Remove the bookmark on ${title}` : `Bookmark ${title}`}
        onClick={toggleBookmark}
        className={cx('size-7', user.bookmarked && 'text-ink')}
      >
        <Icon name={user.bookmarked ? 'starFilled' : 'star'} className="size-4" />
      </IconButton>

      <IconButton
        label={solved ? `Record another solve of ${title}` : `Mark ${title} solved`}
        onClick={markSolved}
        className={cx('size-7', solved && 'text-ok')}
      >
        <Icon name={solved ? 'checkCircle' : 'circle'} className="size-4" />
      </IconButton>
    </span>
  );
}
