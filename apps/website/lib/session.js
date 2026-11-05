import { auth } from '@/auth';

/** The signed-in user, or null. Safe to call from any server component. */
export async function currentUser() {
  const session = await auth();
  return session?.user ?? null;
}

/** The signed-in user's id, or null — what every ownership check needs. */
export async function currentUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

/** The site's own origin, for absolute share and OG URLs. */
export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
}

/**
 * Where "your account" points for this user, or null when nobody is signed in.
 *
 * A provisional handle is not a chosen one, so an account that has not named
 * itself is sent to the form rather than to a profile it has not picked — the
 * same rule /account applies. It lives here, beside `currentUser`, because the
 * header and the landing both need it and a second copy would be a link that
 * 404s on one of them after the rule changes.
 */
export function accountHome(user) {
  if (!user) return null;
  if (!user.handle || user.handleChosen === false) return '/onboarding/username';
  return `/user/${user.handle}`;
}

/** The short label that goes with that link. */
export function accountLabel(user) {
  if (!user) return null;
  if (!user.handle || user.handleChosen === false) return 'Pick a username';
  return `@${user.handle}`;
}
