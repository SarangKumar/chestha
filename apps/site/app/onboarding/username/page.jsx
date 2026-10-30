import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';

/**
 * Where an OAuth sign-in lands while its handle is still provisional — the
 * adapter had to assign one to create the row, and `signIn` in auth.js sends
 * the user here to replace it rather than leaving them with a generated name.
 *
 * Unreachable today: credentials registration sets `handleChosen`, because the
 * sign-up form asks for a username. The route exists so that enabling a
 * provider cannot redirect to a 404, and so the gap is visible rather than
 * discovered in production.
 */
export default async function ChooseUsernamePage() {
  const user = await currentUser();
  if (!user) redirect('/signin');
  // A provisional handle is not a chosen one, so only a chosen handle skips this.
  if (user.handleChosen) redirect(`/user/${user.handle}`);

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-12">
      <h1 className="text-page font-semibold tracking-tight">Choose a username</h1>
      <p className="mt-2 text-card text-ink-muted">
        This becomes your public profile address. The form for it is built in the
        pass that adds Google and GitHub sign-in; until then, accounts are
        created with a username on the sign-up page.
      </p>
    </div>
  );
}
