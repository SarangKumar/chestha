import Link from 'next/link';
import { currentUser } from '@/lib/session';
import { SignOutButton } from './SignOutButton';

export async function SiteHeader() {
  const user = await currentUser();

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="text-card font-semibold tracking-tight text-ink">
          Chestha
        </Link>

        <nav aria-label="Main" className="flex items-center gap-1 text-card">
          <HeaderLink href="/feed">Read</HeaderLink>
          <HeaderLink href="/app">Workspace</HeaderLink>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              {/* The signed-in user's own profile is the thing they share, so
                  it is one click from every page. */}
              {user.handle ? (
                <HeaderLink href={`/user/${user.handle}`}>
                  @{user.handle}
                </HeaderLink>
              ) : null}
              <SignOutButton />
            </>
          ) : (
            <>
              <HeaderLink href="/signin">Sign in</HeaderLink>
              <Link
                href="/signup"
                className="rounded-control bg-accent px-3 py-1.5 text-card font-medium text-on-accent transition-colors duration-150 hover:opacity-90"
              >
                Join
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function HeaderLink({ href, children }) {
  return (
    <Link
      href={href}
      className="rounded-control px-2.5 py-1.5 text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
    >
      {children}
    </Link>
  );
}
