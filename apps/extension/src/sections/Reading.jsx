import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  authorPageUrl, categoriesInPosts, categoryName, describeCacheAge,
  describeReadingError, postPageUrl, postsFeedUrl, shortAge, summarisePosts,
} from '@chestha/core';
import { useWorkspace } from '../app/StoreProvider.jsx';
import { Button, EmptyState, cx } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { isExtensionRuntime } from '../app/platform.js';
import { SITE_URL } from '../siteLinks.js';

/**
 * Read mode: published posts from the website, inside the workspace shell.
 *
 * Three decisions worth knowing before changing this:
 *
 *  - **Nothing is requested until this component mounts.** That is the whole
 *    privacy argument for Read mode: a user who leaves the start screen on the
 *    board never reaches this file, so the extension stays as silent as it was.
 *    Do not move the fetch or the `ensureArea` call up into the Shell or App.
 *  - **The cache paints first, always.** Posts render from the `reading` area
 *    before the network is consulted, so a New Tab is never a spinner, and the
 *    last good list stays on screen when a fetch fails. A failed revalidation
 *    is a note beside stale content, not an error page replacing it.
 *  - **Posts are read on the website, not here.** Bodies are Markdown and the
 *    extension has no sanitiser, so the feed carries no bodies and every title
 *    is a link out. See `apps/website/app/api/posts/route.js`.
 */
export function Reading() {
  const { state, status, store, actions } = useWorkspace();
  const loaded = status.loadedAreas.includes('reading');
  const cache = state.reading;

  // 'idle' until the first fetch resolves; 'stale' means the cache is showing
  // because the network failed, which is a different thing from having nothing.
  const [fetchState, setFetchState] = useState({ phase: 'idle', error: null });
  const [category, setCategory] = useState(null);

  // The lazy area has to be in memory before anything can be read or written.
  useEffect(() => {
    if (status.ready) store.ensureArea('reading');
  }, [status.ready, store]);

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setFetchState({ phase: 'loading', error: null });
    try {
      const response = await fetch(postsFeedUrl(SITE_URL), {
        headers: { Accept: 'application/json' },
        // Public data. Sending no cookie is what keeps a signed-in reader
        // indistinguishable from an anonymous one.
        credentials: 'omit',
      });
      if (!response.ok) {
        setFetchState({ phase: 'stale', error: describeReadingError(response.status) });
        return;
      }
      const posts = summarisePosts(await response.json());
      actions.setReading((reading) => ({
        ...reading,
        posts,
        fetchedAt: new Date().toISOString(),
      }));
      setFetchState({ phase: 'ready', error: null });
    } catch {
      // A thrown fetch is almost always "offline", and the message says so
      // without claiming to know that for certain.
      setFetchState({ phase: 'stale', error: describeReadingError(null) });
    }
  }, [actions]);

  // Revalidate once the cache is in memory, quietly when there is already
  // something to look at so the list does not flash a loading state.
  useEffect(() => {
    if (!loaded) return;
    refresh({ quiet: (cache?.posts?.length ?? 0) > 0 });
    // Deliberately keyed on `loaded` alone: this is a once-per-open
    // revalidation, and depending on `cache` would re-run on its own write.
  }, [loaded]);

  const posts = cache?.posts ?? [];
  const categories = useMemo(() => categoriesInPosts(posts), [posts]);
  const shown = useMemo(
    () => (category ? posts.filter((post) => post.categories.includes(category)) : posts),
    [posts, category],
  );

  const target = isExtensionRuntime() ? '_blank' : '_self';
  const age = describeCacheAge(cache?.fetchedAt);
  const loading = fetchState.phase === 'loading';

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-page font-semibold tracking-tight text-ink">Read</h1>
          <p className="mt-1 text-meta text-ink-faint">
            {fetchState.error
              ? fetchState.error
              : age
                ? `Updated ${age}`
                : 'Posts from the Chestha community.'}
          </p>
        </div>

        <Button
          tone="quiet"
          size="sm"
          onClick={() => refresh()}
          disabled={loading}
          className="shrink-0"
        >
          <Icon name="repeat" className="size-4" />
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {categories.length > 0 && (
        <nav aria-label="Categories" className="mt-5 flex flex-wrap gap-2">
          <CategoryChip active={!category} onClick={() => setCategory(null)}>
            All
          </CategoryChip>
          {categories.map((item) => (
            <CategoryChip
              key={item.slug}
              active={category === item.slug}
              onClick={() => setCategory(item.slug)}
            >
              {categoryName(item.slug)}
            </CategoryChip>
          ))}
        </nav>
      )}

      {shown.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title={emptyTitle(fetchState, loading, posts.length, category)}
            description={emptyDescription(fetchState, loading, posts.length, category)}
            action={category ? (
              <Button tone="quiet" size="sm" onClick={() => setCategory(null)}>
                Show every category
              </Button>
            ) : (
              <Button
                as="a"
                tone="quiet"
                size="sm"
                href={new URL('/feed', SITE_URL).toString()}
                target={target}
                rel="noopener noreferrer"
              >
                Open the feed on the website
              </Button>
            )}
          />
        </div>
      ) : (
        <ul className="mt-7 flex flex-col divide-y divide-line">
          {shown.map((post) => (
            <li key={post.slug} className="py-5 first:pt-0">
              <a
                href={postPageUrl(SITE_URL, post.slug)}
                target={target}
                rel="noopener noreferrer"
                className="group block rounded-card outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <h2 className="text-card font-semibold text-ink underline-offset-4 group-hover:underline">
                  {post.title || 'Untitled'}
                </h2>
                {post.excerpt && (
                  <p className="mt-1.5 line-clamp-2 text-card text-ink-muted">{post.excerpt}</p>
                )}
              </a>
              <p className="mt-2 text-meta text-ink-faint">
                <a
                  href={authorPageUrl(SITE_URL, post.author.handle)}
                  target={target}
                  rel="noopener noreferrer"
                  className="text-ink-muted underline-offset-4 hover:underline"
                >
                  @{post.author.displayUsername}
                </a>
                {' · '}
                <span className="tabular">{post.readingMinutes}</span> min read
                {post.publishedAt && ` · ${shortAge(post.publishedAt)}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function emptyTitle(fetchState, loading, cached, category) {
  if (category) return 'Nothing in this category yet';
  if (loading && cached === 0) return 'Loading posts…';
  if (fetchState.phase === 'stale') return 'No posts saved yet';
  return 'Nothing published yet';
}

function emptyDescription(fetchState, loading, cached, category) {
  if (category) return 'Other categories may have something.';
  if (loading && cached === 0) return 'Fetching the feed from the website.';
  if (fetchState.phase === 'stale') {
    return 'Read mode keeps the last posts it fetched, and there are none yet. It will fill in once you are back online.';
  }
  return 'When people publish posts, they show up here. Your board is unaffected either way.';
}

function CategoryChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'rounded-chip border px-2.5 py-1 text-meta transition-colors duration-150',
        active
          ? 'border-transparent bg-accent text-on-accent'
          : 'border-line bg-raised text-ink-muted hover:bg-hover hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}
