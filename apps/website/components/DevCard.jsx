import Link from 'next/link';
import { TOP_TAGS_SHOWN, interestLabel } from '@chestha/core';
import { ShareButton } from './ShareButton';

/**
 * The profile card — avatar, identity, what they write about, and the numbers.
 *
 * Everything here comes from `buildProfileCard`, which has already filtered
 * drafts and dropped the email, so this component does no visibility reasoning
 * of its own. There is exactly one place that decides what is public.
 *
 * **Interests and top tags are shown separately and labelled differently.**
 * Interests are chosen — a claim. Top tags are counted from published posts —
 * a fact. Merging them into one row would let anyone look like an expert in
 * anything by ticking a box, so the card keeps "Writes about" above
 * "Interested in" and never lets the second masquerade as the first.
 *
 * A stat that was not counted is absent rather than zero: `buildProfileCard`
 * omits the key, and `Stat` renders a dash. "0 followers" on a profile with
 * thousands is worse than no number.
 */
export function DevCard({ profile, shareUrl, children }) {
  const name = profile.name || `@${profile.displayUsername}`;

  return (
    <article className="overflow-hidden rounded-panel border border-line bg-surface shadow-card">
      {/* A quiet band rather than a colour: the palette is monochrome, and hue
          is reserved for things that carry meaning. */}
      <div
        aria-hidden
        className="h-20 bg-[radial-gradient(ellipse_at_top,var(--app-surface-raised),transparent_70%)] border-b border-line"
      />

      <div className="px-6 pb-6 sm:px-8 sm:pb-8">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="-mt-10">
            <Avatar profile={profile} />
          </div>

          <div className="min-w-0 flex-1 sm:pt-1">
            <h1 className="text-page font-semibold tracking-tight text-ink">{name}</h1>
            {/* The handle is the shareable identity, so it is always shown even
                when a display name takes the heading. */}
            <p className="mt-0.5 text-card text-ink-muted">@{profile.displayUsername}</p>

            {profile.bio ? <p className="mt-3 text-card text-ink">{profile.bio}</p> : null}

            {profile.links.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
                {profile.links.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      // An outbound link to a user-supplied URL must not hand
                      // the destination a usable `window.opener`, nor pass our
                      // path along as a referrer.
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

          <div className="flex shrink-0 items-center gap-2 sm:pt-1">
            {children}
            <ShareButton url={shareUrl} label={`Copy link to ${name}'s profile`} />
          </div>
        </header>

        {profile.topTags?.length > 0 ? (
          <TagRow
            heading="Writes about"
            tags={profile.topTags}
            hrefFor={(tag) => `/feed?tag=${encodeURIComponent(tag)}`}
            emphasis
          />
        ) : null}

        {profile.interests?.length > 0 ? (
          <TagRow
            heading="Interested in"
            // The card is a summary, not an inventory: a long interest list is
            // trimmed to the same width the tag row above uses.
            tags={profile.interests.slice(0, TOP_TAGS_SHOWN * 2)}
            hrefFor={(tag) => `/feed?tag=${encodeURIComponent(tag)}`}
          />
        ) : null}

        <dl className="mt-7 grid grid-cols-2 gap-3 border-t border-line pt-5 sm:grid-cols-5">
          <Stat label="Posts" value={profile.stats.posts} />
          <Stat label="Followers" value={profile.stats.followers} />
          <Stat label="Following" value={profile.stats.following} />
          <Stat label="Posts read" value={profile.stats.postsRead} />
          <Stat label="Day streak" value={profile.stats.readStreak} />
        </dl>
      </div>
    </article>
  );
}

function TagRow({ heading, tags, hrefFor, emphasis = false }) {
  return (
    <section className="mt-6">
      <h2 className="text-meta font-medium tracking-wide uppercase text-ink-faint">{heading}</h2>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <li key={tag}>
            <Link
              href={hrefFor(tag)}
              className={`inline-flex rounded-chip border px-2.5 py-1 text-meta transition-colors duration-150 ${
                emphasis
                  ? 'border-line bg-raised text-ink hover:bg-hover'
                  : 'border-line bg-transparent text-ink-muted hover:bg-hover hover:text-ink'
              }`}
            >
              {interestLabel(tag)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Avatar({ profile, size = 'lg' }) {
  const box = size === 'lg'
    ? 'size-20 border-4 border-surface'
    : 'size-10 border border-line';
  const initial = (profile.name || profile.displayUsername || '?').trim().charAt(0).toUpperCase();

  if (profile.image) {
    return (
      <img
        src={profile.image}
        alt=""
        className={`${box} shrink-0 rounded-card bg-inset object-cover`}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className={`${box} flex shrink-0 items-center justify-center rounded-card bg-inset font-semibold text-ink-muted ${
        size === 'lg' ? 'text-stat' : 'text-card'
      }`}
    >
      {initial}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <dt className="text-meta text-ink-faint">{label}</dt>
      <dd className="text-stat font-semibold tabular-nums text-ink">
        {/* Not counted is not zero. */}
        {Number.isFinite(value) ? value : '—'}
      </dd>
    </div>
  );
}
