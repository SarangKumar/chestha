import { buildProfileCard, normalizeUsername, readStreak } from '@chestha/core';
import { prisma } from '@chestha/db';
import { listPublishedPostsByHandle } from './posts.js';
import { followCounts, readInstants } from './social.js';

/**
 * Loads a public profile by handle, or null.
 *
 * The lookup is on the lowercase `handle`, so /user/Sarang and /user/sarang
 * reach the same person. `buildProfileCard` decides what is public — notably
 * it filters drafts and never includes the email — so this function must pass
 * it everything and let it choose, rather than pre-selecting fields here.
 */
export async function getProfileCard(username, { withCounts = true } = {}) {
  const handle = normalizeUsername(username);
  if (!handle) return null;

  const user = await prisma.user.findUnique({
    where: { handle },
    select: {
      id: true, handle: true, displayUsername: true, name: true,
      image: true, bio: true, links: true, interests: true, createdAt: true,
    },
  });
  if (!user) return null;

  const posts = await listPublishedPostsByHandle(handle);
  const counts = withCounts ? await profileCounts(user.id) : null;

  // The id is used below but is not part of the card: `buildProfileCard`
  // returns only the public shape, and the caller gets it back separately
  // rather than by widening what a profile payload contains.
  return { ...buildProfileCard(user, posts, counts), id: user.id };
}

/**
 * The numbers only the server can supply.
 *
 * **The streak is this person's own, and it is counted in UTC.** A reading
 * streak depends on the reader's calendar day, and the server does not know a
 * visitor's timezone — so a profile rendered for someone else states the
 * streak in UTC and the owner's own surfaces can recompute it locally. Picking
 * the *viewer's* zone would mean the same profile showed two different streaks
 * to two people, which is worse than one honest convention.
 */
async function profileCounts(userId) {
  const [follows, instants] = await Promise.all([
    followCounts(userId),
    readInstants(userId),
  ]);
  return {
    ...follows,
    postsRead: instants.length,
    readStreak: readStreak(instants, { timeZone: 'UTC' }),
  };
}
