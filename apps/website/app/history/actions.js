'use server';

import { revalidatePath } from 'next/cache';
import { currentUserId } from '@/lib/session';
import { clearHistory, forgetRead } from '@/lib/social';

/**
 * Remove one entry, or all of them.
 *
 * Both are scoped to `currentUserId()` inside the data layer, so a guessed
 * row id belonging to somebody else matches nothing rather than deleting their
 * history.
 */
export async function forgetReadAction(formData) {
  const userId = await currentUserId();
  if (!userId) return;
  await forgetRead(userId, formData.get('id'));
  revalidatePath('/history');
}

export async function clearHistoryAction() {
  const userId = await currentUserId();
  if (!userId) return;
  await clearHistory(userId);
  revalidatePath('/history');
}
