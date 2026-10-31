import { notFound, redirect } from 'next/navigation';
import { normalizeUsername, profileUrl } from '@chestha/core';
import { ProfileCard } from '@/components/ProfileCard';
import { getProfileCard } from '@/lib/profile';
import { siteUrl } from '@/lib/session';

/**
 * A profile is public, shareable and cacheable. It is revalidated on a timer
 * rather than rendered per request: the content changes only when its owner
 * publishes, and a shared link is the hottest path on the site.
 */
export const revalidate = 300;

export async function generateMetadata({ params }) {
  const { username } = await params;
  const profile = await getProfileCard(username);
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

  const profile = await getProfileCard(username);
  if (!profile) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <ProfileCard profile={profile} shareUrl={profileUrl(profile.handle, siteUrl())} />
    </div>
  );
}
