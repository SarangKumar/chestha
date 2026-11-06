import { interestLabel, profilePageUrl, shareCardUrl, signInUrl } from '@chestha/core';
import { SITE_URL } from '../siteLinks.js';
import { isExtensionRuntime } from '../app/platform.js';
import { useProfile } from '../app/useProfile.js';
import { Icon } from './icons.jsx';
import { Button, cx } from './ui.jsx';

/**
 * The workspace's view of your own card.
 *
 * It renders the same facts as the website's — identity, what you write about,
 * the counts — from the same `buildProfileCard` payload, so the two cannot
 * describe the same person differently. What it deliberately does *not* do is
 * reimplement the website's layout: this is a dense panel sized for a widget
 * cell, not a page header.
 *
 * **Three states, not two.** `unknown` is its own case and must not render as
 * signed out: an offline New Tab knows nothing, and offering "Sign in" to
 * someone who already is sends them to a form they do not need.
 *
 * `compact` is the popover: no bio, fewer stats, tighter type.
 */
export function ProfileCard({ compact = false }) {
  const { profile, state } = useProfile();
  const target = isExtensionRuntime() ? '_blank' : '_self';

  if (state === 'signed-out') {
    return (
      <div className={cx('flex flex-col items-start gap-2', compact ? 'p-3' : 'p-4')}>
        <p className="text-card text-ink-muted">
          An account gives you a profile card, a feed and your reading history.
        </p>
        <Button
          as="a"
          tone="primary"
          size="sm"
          href={signInUrl(SITE_URL, '/account')}
          target={target}
          rel="noopener noreferrer"
        >
          Sign in
          <Icon name="external" className="size-3.5" />
        </Button>
      </div>
    );
  }

  if (!profile) {
    // Unknown: the cache is empty and the network has not answered. A quiet
    // skeleton, not an error — this is the normal first paint of a fresh
    // install and of every offline tab.
    return (
      <div className={cx('flex items-center gap-3', compact ? 'p-3' : 'p-4')} aria-hidden>
        <div className="size-10 shrink-0 animate-pulse rounded-card bg-inset" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-24 animate-pulse rounded-chip bg-inset" />
          <div className="h-2.5 w-16 animate-pulse rounded-chip bg-inset" />
        </div>
      </div>
    );
  }

  const name = profile.name || `@${profile.displayUsername}`;
  // What they write about, falling back to what they say they like. A card
  // with no row at all looks broken; a row of interests is at least true.
  const tags = (profile.topTags.length > 0 ? profile.topTags : profile.interests)
    .slice(0, compact ? 3 : 5);

  return (
    <div className={cx('flex flex-col', compact ? 'gap-2.5 p-3' : 'gap-3 p-4')}>
      <div className="flex items-center gap-3">
        <Avatar profile={profile} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-card font-semibold text-ink">{name}</p>
          <p className="truncate text-meta text-ink-muted">@{profile.displayUsername}</p>
        </div>
      </div>

      {!compact && profile.bio ? (
        <p className="line-clamp-2 text-meta leading-relaxed text-ink-muted">{profile.bio}</p>
      ) : null}

      {tags.length > 0 ? (
        <ul className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <li
              key={tag}
              className="inline-flex rounded-chip border border-line px-1.5 py-0.5 text-[10px] text-ink-muted"
            >
              {interestLabel(tag)}
            </li>
          ))}
        </ul>
      ) : null}

      <dl className={cx('grid gap-2 border-t border-line pt-2.5', compact ? 'grid-cols-3' : 'grid-cols-4')}>
        <Stat label="Posts" value={profile.stats.posts} />
        <Stat label="Followers" value={profile.stats.followers} />
        <Stat label="Read" value={profile.stats.postsRead} />
        {!compact ? <Stat label="Streak" value={profile.stats.readStreak} /> : null}
      </dl>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <CardLink href={profilePageUrl(SITE_URL, profile.handle)} target={target}>
          Profile
        </CardLink>
        <CardLink href={shareCardUrl(SITE_URL, profile.handle)} target={target}>
          Share card
        </CardLink>
      </div>
    </div>
  );
}

function CardLink({ href, target, children }) {
  return (
    <a
      href={href}
      target={target}
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-meta text-ink-muted underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:text-ink"
    >
      {children}
      <Icon name="external" className="size-3" />
    </a>
  );
}

function Avatar({ profile }) {
  const initial = (profile.name || profile.displayUsername || '?').trim().charAt(0).toUpperCase();
  if (profile.image) {
    return (
      <img
        src={profile.image}
        alt=""
        className="size-10 shrink-0 rounded-card border border-line bg-inset object-cover"
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-card bg-inset text-card font-semibold text-ink-muted"
    >
      {initial}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[10px] text-ink-faint">{label}</dt>
      {/* A stat that was not counted shows a dash. "0 followers" on an account
          with plenty is worse than no number at all. */}
      <dd className="text-card font-semibold tabular-nums text-ink">
        {Number.isFinite(value) ? value : '—'}
      </dd>
    </div>
  );
}
