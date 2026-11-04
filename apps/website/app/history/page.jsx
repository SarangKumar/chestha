import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  HISTORY_PAGE_SIZE, groupHistoryByDay, readStreak,
} from '@chestha/core';
import { PostList } from '@/components/PostList';
import { buttonClass } from '@/components/ui/Button';
import { currentUserId } from '@/lib/session';
import { historyCount, listHistory, readInstants } from '@/lib/social';
import { clearHistoryAction, forgetReadAction } from './actions';

export const metadata = {
  title: 'Reading history',
  // Someone else's reading is nobody's business, and this page is only ever
  // rendered for its owner — but a crawler that somehow reached it must not
  // index a URL that shows different content per visitor.
  robots: { index: false, follow: false },
};

/**
 * What you have read, newest first, grouped by day.
 *
 * **Grouped in UTC, and the page says so.** The server does not know the
 * reader's timezone — there is no reliable way to learn it during a server
 * render — so days are cut at UTC midnight and the streak is counted the same
 * way. Guessing the zone would put a post under the wrong heading for half the
 * world; stating the convention is honest and consistent with the card.
 *
 * Entries are removable one at a time and all at once, because a reading
 * history is a record of what you looked at and that is the kind of thing
 * people should be able to delete without asking.
 */
export default async function HistoryPage({ searchParams }) {
  const userId = await currentUserId();
  if (!userId) redirect('/signin?callbackUrl=%2Fhistory');

  const { page } = await searchParams;
  const pageNumber = Math.max(1, Number.parseInt(page ?? '1', 10) || 1);
  const skip = (pageNumber - 1) * HISTORY_PAGE_SIZE;

  const [rows, total, instants] = await Promise.all([
    listHistory(userId, { skip }),
    historyCount(userId),
    readInstants(userId),
  ]);

  const streak = readStreak(instants, { timeZone: 'UTC' });
  const days = groupHistoryByDay(rows, { timeZone: 'UTC' });
  const hasMore = skip + rows.length < total;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-page font-semibold tracking-tight text-ink">Reading history</h1>
          <p className="text-card text-ink-muted">
            {total === 0
              ? 'Posts you open show up here.'
              : `${total} ${total === 1 ? 'post' : 'posts'} · ${streak}-day streak`}
          </p>
        </div>

        {total > 0 ? (
          <form action={clearHistoryAction}>
            <button type="submit" className={buttonClass({ variant: 'danger', size: 'sm' })}>
              Clear history
            </button>
          </form>
        ) : null}
      </header>

      {days.length === 0 ? (
        <p className="mt-10 text-card text-ink-muted">
          Nothing yet.{' '}
          <Link href="/feed" className="text-ink underline underline-offset-4">
            Find something to read
          </Link>
          .
        </p>
      ) : (
        <div className="mt-8 space-y-9">
          {days.map((group) => (
            <section key={group.day} aria-labelledby={`day-${group.day}`}>
              <h2
                id={`day-${group.day}`}
                className="text-meta font-medium tracking-wide uppercase text-ink-faint"
              >
                <DayLabel day={group.day} />
              </h2>
              <PostList posts={group.items.map((item) => item.post)} />
            </section>
          ))}
        </div>
      )}

      {/* Per-row removal lives in its own list rather than inside PostList,
          which is shared with the feed and a profile where nothing is
          removable. */}
      {days.length > 0 ? (
        <details className="mt-10 border-t border-line pt-5">
          <summary className="cursor-pointer text-meta text-ink-muted">
            Remove individual entries
          </summary>
          <ul className="mt-3 space-y-1.5">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-4">
                <span className="min-w-0 flex-1 truncate text-meta text-ink-muted">
                  {row.post.title || 'Untitled'}
                </span>
                <form action={forgetReadAction}>
                  <input type="hidden" name="id" value={row.id} />
                  <button
                    type="submit"
                    className="shrink-0 text-meta text-ink-faint underline underline-offset-4 transition-colors hover:text-danger"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {(pageNumber > 1 || hasMore) ? (
        <nav className="mt-10 flex justify-between border-t border-line pt-5" aria-label="History pages">
          {pageNumber > 1 ? (
            <Link href={`/history?page=${pageNumber - 1}`} className={buttonClass({ variant: 'outline', size: 'sm' })}>
              Newer
            </Link>
          ) : <span />}
          {hasMore ? (
            <Link href={`/history?page=${pageNumber + 1}`} className={buttonClass({ variant: 'outline', size: 'sm' })}>
              Older
            </Link>
          ) : <span />}
        </nav>
      ) : null}

      <p className="mt-6 text-meta text-ink-faint">Days are counted in UTC.</p>
    </div>
  );
}

/**
 * A day heading from the `YYYY-MM-DD` bucket key. Formatted in UTC for the
 * same reason the grouping is: the server and the browser must produce the
 * same string or hydration complains.
 */
function DayLabel({ day }) {
  const label = new Date(`${day}T00:00:00.000Z`).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
  return <time dateTime={day}>{label}</time>;
}
