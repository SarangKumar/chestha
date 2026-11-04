import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  POST_STATUS_LABELS, derivedExcerpt, interestLabel, plainText, readingMinutes,
} from '@chestha/core';
import { getPostBySlug } from '@/lib/posts';
import { currentUserId } from '@/lib/session';
import { recordRead } from '@/lib/social';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const post = await getPostBySlug(slug, { viewerId: await currentUserId() });
  if (!post) return { title: 'Post not found' };
  return {
    title: post.title || 'Untitled',
    description: derivedExcerpt(post, 200),
    // An unpublished post is reachable only by its author; it must never be
    // indexed even while they are previewing it.
    robots: post.status === 'published' ? undefined : { index: false, follow: false },
  };
}

export default async function PostPage({ params }) {
  const { slug } = await params;
  const viewerId = await currentUserId();
  // The viewer id is what lets an author preview their own draft. Without a
  // match an unpublished post is indistinguishable from one that is not there.
  const post = await getPostBySlug(slug, { viewerId });
  if (!post) notFound();

  // Reading history, written as the page renders.
  //
  // Only for a signed-in reader, and only for a *published* post: an author
  // previewing their own draft has not read anything, and logging it would put
  // unpublished work in a history that is meant to be a record of reading.
  // `recordRead` swallows its own failures — a history write must never take
  // down the page someone came to read.
  if (viewerId && post.status === 'published') {
    await recordRead(viewerId, post.id);
  }

  return (
    <article className="mx-auto w-full max-w-2xl px-4 py-10">
      {post.status !== 'published' ? (
        <p className="mb-5 rounded-control border border-warn bg-warn-soft px-3 py-2 text-meta text-ink">
          {POST_STATUS_LABELS[post.status]} — only you can see this.
        </p>
      ) : null}

      <h1 className="text-display font-semibold tracking-tight text-ink">
        {post.title || 'Untitled'}
      </h1>

      <p className="mt-3 text-meta text-ink-faint">
        <Link
          href={`/user/${post.author.handle}`}
          className="text-ink-muted underline-offset-4 hover:underline"
        >
          @{post.author.displayUsername || post.author.handle}
        </Link>
        {' · '}
        <span className="tabular-nums">{readingMinutes(post.body)}</span> min read
      </p>

      {post.tags?.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Tags">
          {post.tags.map((tag) => (
            <li key={tag}>
              <Link
                href={`/feed?tag=${encodeURIComponent(tag)}`}
                className="inline-flex rounded-chip border border-line px-2.5 py-1 text-meta text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
              >
                {interestLabel(tag)}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Bodies are authored as Markdown but rendered as plain paragraphs for
          now: rendering untrusted Markdown as HTML needs a sanitiser, and
          adding one is a dependency decision for the editor pass. */}
      <div className="mt-8 flex flex-col gap-4">
        {plainText(post.body).split('\n').filter(Boolean).map((paragraph, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <p key={index} className="text-card leading-relaxed text-ink">{paragraph}</p>
        ))}
      </div>
    </article>
  );
}
