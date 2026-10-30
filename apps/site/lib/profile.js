import { buildProfileCard, normalizeUsername } from '@chestha/core';
import { prisma } from '@chestha/db';
import { listPublishedPostsByHandle } from './posts.js';

/**
 * Loads a public profile by handle, or null.
 *
 * The lookup is on the lowercase `handle`, so /user/Sarang and /user/sarang
 * reach the same person. `buildProfileCard` decides what is public — notably
 * it filters drafts and never includes the email — so this function must pass
 * it everything and let it choose, rather than pre-selecting fields here.
 */
export async function getProfileCard(username) {
  const handle = normalizeUsername(username);
  if (!handle) return null;

  const user = await prisma.user.findUnique({
    where: { handle },
    select: {
      id: true, handle: true, displayUsername: true, name: true,
      image: true, bio: true, links: true, createdAt: true,
    },
  });
  if (!user) return null;

  const posts = await listPublishedPostsByHandle(handle);
  return buildProfileCard(user, posts);
}
