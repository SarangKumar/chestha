'use server';

import { redirect } from 'next/navigation';
import { currentUserId } from '@/lib/session';
import { saveInterests } from '@/lib/social';

/**
 * Save the picked interests and move on.
 *
 * `formData.getAll` rather than `get`: the picker is a set of checkboxes with
 * one name, and `get` would silently keep only the first — which looks like
 * the save working and losing everything but one tag.
 *
 * Skipping is a real answer, so it posts the same form with nothing ticked
 * and lands in the same place. An empty list is stored, not refused.
 */
export async function saveInterestsAction(formData) {
  const userId = await currentUserId();
  if (!userId) redirect('/signin?callbackUrl=%2Fonboarding%2Finterests');

  await saveInterests(userId, formData.getAll('interests'));
  redirect('/feed');
}
