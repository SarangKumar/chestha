import Link from 'next/link';
import { POST_STATUS_LABELS, derivedExcerpt, interestLabel, readingMinutes } from '@chestha/core';

/** How many tags a list row shows before it starts competing with the title. */
const TAGS_IN_ROW = 4;

/**
 * One list of posts, used by the feed, a profile and the reading history.
 *
 * It exists because those three were drifting: the feed showed an author and
 * no tags, a profile showed a date and no author, and each had its own idea of
 * how long an excerpt should be. A post should look like the same post
 * wherever it appears.
 */
export function PostList({ posts, empty = 'Nothing here yet.', showAuthor = false, children }) {
  if (!posts || posts.length === 0) {
    return <p className="mt-4 text-card text-ink-muted">{empty}</p>;
  }

  return (
    <ul className="mt-3 flex flex-col divide-y divide-line">
      {posts.map((post) => (
        <li key={post.id} className="py-4 first:pt-0 last:pb-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <Link href={`/post/${post.slug}`} className="group block">
                <h3 className="text-card font-semibold text-ink underline-offset-4 group-hover:underline">
                  {post.title || 'Untitled'}
                </h3>
                <p className="mt-1 line-clamp-2 text-card text-ink-muted">
                  {derivedExcerpt(post, 180)}
                </p>
              </Link>

              <p className="mt-1.5 text-meta text-ink-faint">
                {showAuthor && post.author ? (
                  <>
                    <Link
                      href={`/user/${post.author.handle}`}
                      className="text-ink-muted underline-offset-4 hover:underline"
                    >
                      @{post.author.displayUsername || post.author.handle}
                    </Link>
                    {' · '}
                  </>
                ) : null}
                <PublishedDate value={post.publishedAt} />
                {post.publishedAt ? ' · ' : ''}
                <span className="tabular-nums">{readingMinutes(post.body)}</span> min read
                {post.status && post.status !== 'published'
                  ? ` · ${POST_STATUS_LABELS[post.status]}`
                  : ''}
              </p>

              {post.tags?.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {post.tags.slice(0, TAGS_IN_ROW).map((tag) => (
                    <li key={tag}>
                      <Link
                        href={`/feed?tag=${encodeURIComponent(tag)}`}
                        className="inline-flex rounded-chip border border-line px-2 py-0.5 text-meta text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
                      >
                        {interestLabel(tag)}
                      </Link>
                    </li>
                  ))}
                  {/* The overflow is a count, not an ellipsis: knowing there are
                      six more is useful, knowing there are "some" is not. */}
                  {post.tags.length > TAGS_IN_ROW ? (
                    <li className="inline-flex items-center px-1 text-meta text-ink-faint">
                      +{post.tags.length - TAGS_IN_ROW}
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </div>

            {/* Row-level actions, such as removing a history entry. */}
            {children ? <div className="shrink-0">{children(post)}</div> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Rendered from the ISO instant with an explicit UTC timezone, so the server
 * and the browser produce the same string. Formatting a date in the visitor's
 * zone would differ between the two and trip a hydration mismatch.
 */
export function PublishedDate({ value }) {
  if (!value) return null;
  const iso = typeof value === 'string' ? value : value.toISOString();
  const label = new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
  return <time dateTime={iso}>{label}</time>;
}
