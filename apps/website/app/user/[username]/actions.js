'use server';

import { revalidatePath } from 'next/cache';
import { currentUserId } from '@/lib/session';
import { followUser, unfollowUser } from '@/lib/social';

/**
 * Follow and unfollow.
 *
 * The follower is always `currentUserId()` — it is never read from the form,
 * so a crafted post cannot make somebody else follow anyone. The target is a
 * handle rather than an id, because a handle is already public and an id is
 * not; `followUser` resolves it and refuses a self-follow.
 */
export async function followAction(formData) {
  const userId = await currentUserId();
  if (!userId) return;

  const handle = String(formData.get('handle') ?? '');
  const intent = String(formData.get('intent') ?? '');

  if (intent === 'unfollow') {
    await unfollowUser(userId, handle);
  } else {
    await followUser(userId, handle);
  }

  // The counts on the card change, so the page has to be re-rendered rather
  // than left showing the number it had when the button was clicked.
  revalidatePath(`/user/${handle.toLowerCase()}`);
}
