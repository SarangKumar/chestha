import Link from 'next/link';
import { interestLabel } from '@chestha/core';
import { PostList } from '@/components/PostList';
import { listCategories, listPublishedPosts } from '@/lib/posts';
import { currentUserId } from '@/lib/session';
import { getInterests, listFollowingPosts } from '@/lib/social';

export const metadata = { title: 'Read' };

/**
 * The public feed, with three ways to narrow it.
 *
 * Only published posts reach any of them — the filter is inside
 * `listPublishedPosts` and `listFollowingPosts`, not here, so this page cannot
 * forget it.
 *
 * **"Following" shows nothing rather than everything when you follow nobody.**
 * Falling back to the public feed would hide the fact that the tab is empty
 * because of a choice not yet made, and someone would conclude following does
 * not work.
 */
export default async function FeedPage({ searchParams }) {
  const { category, tag, view } = await searchParams;
  const viewerId = await currentUserId();
  const following = view === 'following' && Boolean(viewerId);

  const [posts, categories, interests] = await Promise.all([
    following
      ? listFollowingPosts(viewerId)
      : listPublishedPosts({ category, tag }),
    listCategories(),
    viewerId ? getInterests(viewerId) : [],
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-page font-semibold tracking-tight text-ink">Read</h1>
        {viewerId ? (
          <Link
            href="/history"
            className="text-meta text-ink-muted underline underline-offset-4 transition-colors hover:text-ink"
          >
            Reading history
          </Link>
        ) : null}
      </div>

      {viewerId ? (
        <nav aria-label="Feed" className="mt-5 flex gap-2">
          <Chip href="/feed" active={!following && !tag}>Everything</Chip>
          <Chip href="/feed?view=following" active={following}>Following</Chip>
        </nav>
      ) : null}

      {/* Categories narrow the public feed, so they are hidden on a feed that
          is already narrowed to people rather than to topics. */}
      {!following ? (
        <nav aria-label="Categories" className="mt-3 flex flex-wrap gap-2">
          <Chip href="/feed" active={!category && !tag}>All</Chip>
          {categories.map((item) => (
            <Chip
              key={item.slug}
              href={`/feed?category=${item.slug}`}
              active={category === item.slug}
            >
              {item.name}
            </Chip>
          ))}
        </nav>
      ) : null}

      {/* A tag filter arrives from a post, a card or an interest, so it is
          shown as a removable state rather than as another list to browse. */}
      {tag && !following ? (
        <p className="mt-4 flex items-center gap-2 text-meta text-ink-muted">
          Showing <span className="font-medium text-ink">{interestLabel(tag)}</span>
          <Link href="/feed" className="underline underline-offset-4 hover:text-ink">
            clear
          </Link>
        </p>
      ) : null}

      {/* Your own interests, as shortcuts into the tag filter. The feed is not
          silently filtered by them: an interest-sorted feed that nobody asked
          for makes an empty result look like an empty site. */}
      {interests.length > 0 && !tag && !following ? (
        <section className="mt-6" aria-labelledby="your-tags">
          <h2 id="your-tags" className="text-meta font-medium tracking-wide uppercase text-ink-faint">
            Your interests
          </h2>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {interests.map((item) => (
              <li key={item}>
                <Link
                  href={`/feed?tag=${encodeURIComponent(item)}`}
                  className="inline-flex rounded-chip border border-line px-2.5 py-1 text-meta text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
                >
                  {interestLabel(item)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-7">
        <PostList
          posts={posts}
          showAuthor
          empty={
            following
              ? 'Nothing here yet — follow a few people and their posts land here.'
              : 'Nothing published here yet.'
          }
        />
      </div>
    </div>
  );
}

function Chip({ href, active, children }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`rounded-chip border px-2.5 py-1 text-meta transition-colors duration-150 ${
        active
          ? 'border-transparent bg-accent text-on-accent'
          : 'border-line bg-raised text-ink-muted hover:bg-hover hover:text-ink'
      }`}
    >
      {children}
    </Link>
  );
}
