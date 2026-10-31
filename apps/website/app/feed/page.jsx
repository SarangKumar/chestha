import Link from 'next/link';
import { derivedExcerpt, readingMinutes } from '@chestha/core';
import { listCategories, listPublishedPosts } from '@/lib/posts';

export const metadata = { title: 'Read' };

/**
 * The public feed. Only published posts reach it — the filter is inside
 * `listPublishedPosts`, not here, so this page cannot forget it.
 */
export default async function FeedPage({ searchParams }) {
  const { category } = await searchParams;
  const [posts, categories] = await Promise.all([
    listPublishedPosts({ category }),
    listCategories(),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-page font-semibold tracking-tight text-ink">Read</h1>

      <nav aria-label="Categories" className="mt-5 flex flex-wrap gap-2">
        <CategoryChip href="/feed" active={!category}>All</CategoryChip>
        {categories.map((item) => (
          <CategoryChip
            key={item.slug}
            href={`/feed?category=${item.slug}`}
            active={category === item.slug}
          >
            {item.name}
          </CategoryChip>
        ))}
      </nav>

      {posts.length === 0 ? (
        <p className="mt-10 text-card text-ink-muted">
          Nothing published here yet.
        </p>
      ) : (
        <ul className="mt-7 flex flex-col divide-y divide-line">
          {posts.map((post) => (
            <li key={post.id} className="py-5 first:pt-0">
              <Link href={`/post/${post.slug}`} className="group block">
                <h2 className="text-card font-semibold text-ink underline-offset-4 group-hover:underline">
                  {post.title || 'Untitled'}
                </h2>
                <p className="mt-1.5 line-clamp-2 text-card text-ink-muted">
                  {derivedExcerpt(post, 200)}
                </p>
              </Link>
              <p className="mt-2 text-meta text-ink-faint">
                <Link
                  href={`/user/${post.author.handle}`}
                  className="text-ink-muted underline-offset-4 hover:underline"
                >
                  @{post.author.displayUsername || post.author.handle}
                </Link>
                {' · '}
                <span className="tabular">{readingMinutes(post.body)}</span> min read
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CategoryChip({ href, active, children }) {
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
