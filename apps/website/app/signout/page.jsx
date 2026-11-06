import Link from 'next/link';
import { currentUser } from '@/lib/session';
import { SignOutButton } from '@/components/SignOutButton';

export const metadata = { title: 'Sign out' };

/**
 * The page the extension's account menu links to.
 *
 * It exists because sign-out is a POST and nothing else can be: a URL that
 * ends a session on GET can be triggered by any page that embeds it, and the
 * extension — on its own origin, with no access to this site's cookie — cannot
 * POST here itself. So it links here and the actual work happens on this page,
 * one button, same server action the header uses.
 *
 * Signed out already, it says so rather than offering a button that would do
 * nothing: arriving here twice is the normal consequence of the extension
 * linking out, and the second visit should read as success, not as an error.
 */
export default async function SignOutPage() {
  const user = await currentUser();

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-12">
      <h1 className="text-page font-semibold tracking-tight">
        {user ? 'Sign out' : 'Signed out'}
      </h1>

      {user ? (
        <>
          <p className="mt-3 text-card text-ink-muted">
            This ends the session on this browser. Anything already synced stays
            on your account.
          </p>
          <div className="mt-6">
            <SignOutButton />
          </div>
        </>
      ) : (
        <p className="mt-3 text-card text-ink-muted">
          There is no session on this browser.{' '}
          <Link href="/signin" className="text-ink underline underline-offset-4">Sign in again</Link>
          .
        </p>
      )}
    </div>
  );
}
