import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { normalizeUsername, profileUrl } from '@chestha/core';
import { ProfileCard } from '@/components/ProfileCard';
import { FollowButton } from '@/components/FollowButton';
import { PostList } from '@/components/PostList';
import { getProfileCard } from '@/lib/profile';
import { currentUserId, siteUrl } from '@/lib/session';
import { isFollowing } from '@/lib/social';

/**
 * A profile used to be revalidated on a timer, because it changes only when
 * its owner publishes and a shared link is the hottest path on the site.
 *
 * It is rendered per request now, and the reason is the follow button: its
 * state belongs to the *viewer*, not to the profile, so a cached page would
 * serve one visitor's answer to everyone. The counts moved the same way —
 * followers and a reading streak change far more often than a post does, and
 * a five-minute-old streak on your own card reads as a bug. The shareable
 * artefact that still caches is the image at /card.png.
 */
export async function generateMetadata({ params }) {
  const { username } = await params;
  const profile = await getProfileCard(username, { withCounts: false });
  if (!profile) return { title: 'Profile not found' };

  const name = profile.name || `@${profile.displayUsername}`;
  const description = profile.bio
    || `${name} on Chestha — ${profile.stats.posts} ${profile.stats.posts === 1 ? 'post' : 'posts'}.`;

  return {
    title: name,
    description,
    alternates: { canonical: profileUrl(profile.handle, siteUrl()) },
    openGraph: {
      type: 'profile',
      title: name,
      description,
      url: profileUrl(profile.handle, siteUrl()),
    },
    twitter: { card: 'summary_large_image', title: name, description },
  };
}

export default async function ProfilePage({ params }) {
  const { username } = await params;

  // A handle typed in any case should reach one canonical URL rather than
  // serving the same page at several addresses.
  const handle = normalizeUsername(username);
  if (handle && handle !== username) redirect(`/user/${handle}`);

  const [profile, viewerId] = await Promise.all([
    getProfileCard(username),
    currentUserId(),
  ]);
  if (!profile) notFound();

  const following = await isFollowing(viewerId, profile.id);
  const isSelf = viewerId === profile.id;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-10">
      <ProfileCard profile={profile} shareUrl={profileUrl(profile.handle, siteUrl())}>
        <FollowButton
          handle={profile.handle}
          following={following}
          canFollow={Boolean(viewerId) && !isSelf}
        />
      </ProfileCard>

      <section aria-labelledby="published-heading">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="published-heading" className="text-card font-semibold text-ink">
            Published
          </h2>
          <Link
            href={`/user/${profile.handle}/card`}
            className="text-meta text-ink-muted underline underline-offset-4 transition-colors hover:text-ink"
          >
            Share this card
          </Link>
        </div>
        <PostList posts={profile.posts} empty="Nothing published yet." />
      </section>
    </div>
  );
}
