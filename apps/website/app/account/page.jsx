import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';

export const metadata = { title: 'Account' };

/**
 * A redirect, not a page.
 *
 * The extension runs on its own origin and cannot read this site's session
 * cookie, so its account icon cannot know whether anyone is signed in. It links
 * here and lets the server decide, which keeps the extension account-free and
 * means it asks nothing about you until you follow the link.
 *
 * Sign-in returns here rather than to `/feed`, so following the icon while
 * signed out still ends on the profile that was asked for.
 */
export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect('/signin?callbackUrl=%2Faccount');
  // A provisional handle is not a chosen one — the same rule the onboarding
  // route applies, so a fresh OAuth account lands on the form, not on a
  // profile it did not pick.
  if (!user.handle || !user.handleChosen) redirect('/onboarding/username');
  redirect(`/user/${user.handle}`);
}
