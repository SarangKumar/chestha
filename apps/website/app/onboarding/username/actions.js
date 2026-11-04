'use server';

import { redirect } from 'next/navigation';
import { currentUserId } from '@/lib/session';
import { claimUsername } from '@/lib/accounts';

/**
 * Replace a provisional handle with a chosen one.
 *
 * The user id comes from the session, never from the form, so this can only
 * ever rename the account that is signed in.
 */
export async function chooseUsernameAction(_previous, formData) {
  const userId = await currentUserId();
  if (!userId) redirect('/signin?callbackUrl=%2Fonboarding%2Fusername');

  const result = await claimUsername(userId, formData.get('username'));
  if (!result.ok) return result;

  // Straight on to the second step rather than to the profile: the two
  // together are the onboarding, and a profile with no interests is a dead end
  // for a new account.
  redirect('/onboarding/interests');
}
