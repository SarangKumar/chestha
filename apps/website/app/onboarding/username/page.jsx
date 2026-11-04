import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';
import { UsernameForm } from './UsernameForm';

export const metadata = { title: 'Choose a username' };

/**
 * Where an account lands while its handle is still provisional.
 *
 * The adapter has to assign *some* handle to create the row — it is required
 * and unique, and no OAuth provider supplies one — so `handleChosen` is what
 * tells a generated name apart from a picked one, and this is where that gets
 * fixed. Credentials sign-up asks for a username on the form and sets the flag
 * directly, so it skips straight past.
 *
 * This page used to be a note saying the form would be built "in the pass that
 * adds Google and GitHub sign-in". That made the whole onboarding chain a dead
 * end for any account that arrived without a chosen handle, so it is a real
 * form now whether or not a provider is enabled.
 */
export default async function ChooseUsernamePage() {
  const user = await currentUser();
  if (!user) redirect('/signin?callbackUrl=%2Fonboarding%2Fusername');
  // A provisional handle is not a chosen one, so only a chosen handle skips this.
  if (user.handleChosen) redirect('/onboarding/interests');

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-12">
      <h1 className="text-page font-semibold tracking-tight text-ink">Choose a username</h1>
      <p className="mt-2 text-card leading-relaxed text-ink-muted">
        This becomes your public profile address, and it is how people find you.
      </p>
      <UsernameForm suggestion={user.handle ?? ''} />
    </div>
  );
}
