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
