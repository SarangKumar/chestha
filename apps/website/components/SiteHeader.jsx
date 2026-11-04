import Link from 'next/link';
import { currentUser } from '@/lib/session';
import { SignOutButton } from './SignOutButton';
import { BrandMark } from './marketing/BrandMark';
import { GithubStars } from './marketing/GithubStars';
import { MARKETING_NAV } from './marketing/nav';
import { MobileNav } from './marketing/MobileNav';
import { ThemeToggle } from './marketing/ThemeToggle';

/**
 * One header for the whole site — marketing chrome and account controls
 * together.
 *
 * It is a server component so `currentUser()` is read during render: the
 * account area is correct in the first HTML rather than flickering from
 * signed-out to signed-in after hydration. The three interactive pieces
 * (theme, stars, mobile panel) are client islands inside it.
 *
 * The account area is the one thing that differs from the marketing header the
 * extension renders. That header belongs to an app with no accounts; this one
 * sits above pages that do.
 */
export async function SiteHeader() {
  const user = await currentUser();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/70 backdrop-blur-xl">
      <div className="mx-auto flex h-12 w-full max-w-6xl items-center gap-2.5 px-4 sm:gap-3 sm:px-6">
        <MobileNav>
          <AccountLinks user={user} stacked />
        </MobileNav>

        <Link
          href="/"
          className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-2.5"
          aria-label="Chestha home"
        >
          <BrandMark className="size-7" width={28} height={28} alt="" />
          <span className="chestha-display text-card text-ink">Chestha</span>
        </Link>

        <nav className="ml-1 hidden items-center gap-0.5 md:flex" aria-label="Main">
          {MARKETING_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex items-center rounded-control px-2 py-1 text-card font-medium text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
          <GithubStars />
          <ThemeToggle />
          <div className="hidden items-center gap-1.5 md:flex">
            <AccountLinks user={user} />
          </div>
        </div>
      </div>
    </header>
  );
}

/**
 * Signed in: the profile the account owns, and a way out. Signed out: the two
 * ways in. `stacked` is the mobile panel, where these are rows in a list
 * rather than controls on a bar.
 */
function AccountLinks({ user, stacked = false }) {
  const row = stacked
    ? 'block rounded-control px-3 py-2.5 text-card font-medium text-ink transition-colors duration-150 hover:bg-hover'
    : 'inline-flex items-center rounded-control px-2.5 py-1.5 text-card text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink';

  if (user) {
    return (
      <>
        {/* A provisional handle is not a chosen one — the same rule /account
            applies, so an unnamed account is sent to the form rather than to a
            profile it has not named. */}
        {user.handle ? (
          <Link href={user.handleChosen === false ? '/onboarding/username' : `/user/${user.handle}`} className={row}>
            {user.handleChosen === false ? 'Pick a username' : `@${user.handle}`}
          </Link>
        ) : null}
        <SignOutButton />
      </>
    );
  }

  return (
    <>
      <Link href="/signin" className={row}>Sign in</Link>
      <Link
        href="/signup"
        className={
          stacked
            ? 'mt-1 block rounded-control bg-accent px-3 py-2.5 text-card font-medium text-on-accent transition-colors duration-150 hover:opacity-90'
            : 'inline-flex items-center rounded-control bg-accent px-3 py-1.5 text-card font-medium text-on-accent transition-colors duration-150 hover:opacity-90'
        }
      >
        Join
      </Link>
    </>
  );
}
