import Link from 'next/link';
import { POST_STATUS_LABELS, derivedExcerpt, readingMinutes } from '@chestha/core';
import { ShareButton } from './ShareButton';

/**
 * The public profile card. Everything rendered here comes from
 * `buildProfileCard`, which has already filtered drafts and dropped the email,
 * so this component does no visibility reasoning of its own — there is exactly
 * one place that decides what is public.
 */
export function ProfileCard({ profile, shareUrl }) {
  const name = profile.name || `@${profile.displayUsername}`;

  return (
    <article className="rounded-panel border border-line bg-surface p-6 shadow-card sm:p-8">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <Avatar profile={profile} />

        <div className="min-w-0 flex-1">
          <h1 className="text-page font-semibold tracking-tight text-ink">{name}</h1>
          {/* The handle is the shareable identity, so it is always shown even
              when a display name takes the heading. */}
          <p className="mt-0.5 text-card text-ink-muted">@{profile.displayUsername}</p>

          {profile.bio ? (
            <p className="mt-3 text-card text-ink">{profile.bio}</p>
          ) : null}

          {profile.links.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
              {profile.links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    // An outbound link to a user-supplied URL must not hand the
                    // destination a usable `window.opener`, nor pass our path
                    // along as a referrer.
                    rel="nofollow noopener noreferrer ugc"
                    target="_blank"
                    className="text-meta text-ink-muted underline underline-offset-4 transition-colors duration-150 hover:text-ink"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <ShareButton url={shareUrl} label={`Copy link to ${name}'s profile`} />
      </header>

      <dl className="mt-7 grid grid-cols-3 gap-3 border-t border-line pt-5">
        <Stat label="Posts" value={profile.stats.posts} />
        <Stat label="Topics" value={profile.stats.categories} />
        <Stat label="Minutes written" value={profile.stats.readingMinutes} />
      </dl>

      <section className="mt-8" aria-labelledby="published-heading">
        <h2 id="published-heading" className="text-card font-semibold text-ink">
          Published
        </h2>
        {profile.posts.length === 0 ? (
          <p className="mt-2 text-card text-ink-muted">Nothing published yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-line">
            {profile.posts.map((post) => (
              <li key={post.id} className="py-3.5 first:pt-0 last:pb-0">
                <Link href={`/post/${post.slug}`} className="group block">
                  <h3 className="text-card font-medium text-ink underline-offset-4 group-hover:underline">
                    {post.title || 'Untitled'}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-card text-ink-muted">
                    {derivedExcerpt(post, 160)}
                  </p>
                  <p className="mt-1.5 text-meta text-ink-faint">
                    <PublishedDate value={post.publishedAt} />
                    {' · '}
                    <span className="tabular">{readingMinutes(post.body)}</span> min read
                    {post.status !== 'published' ? ` · ${POST_STATUS_LABELS[post.status]}` : ''}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}

function Avatar({ profile }) {
  const initial = (profile.name || profile.displayUsername || '?').trim().charAt(0).toUpperCase();
  if (profile.image) {
    return (
      <img
        src={profile.image}
        alt=""
        width={72}
        height={72}
        className="size-18 shrink-0 rounded-card border border-line object-cover"
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className="flex size-18 shrink-0 items-center justify-center rounded-card bg-inset text-stat font-semibold text-ink-muted"
    >
      {initial}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <dt className="text-meta text-ink-faint">{label}</dt>
      <dd className="text-stat font-semibold tabular text-ink">{value}</dd>
    </div>
  );
}

/**
 * Rendered from the ISO instant with an explicit UTC timezone, so the server
 * and the browser produce the same string. Formatting a date in the visitor's
 * zone would differ between the two and trip a hydration mismatch.
 */
function PublishedDate({ value }) {
  if (!value) return null;
  const iso = typeof value === 'string' ? value : value.toISOString();
  const label = new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
  return <time dateTime={iso}>{label}</time>;
}
