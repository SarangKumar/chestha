import { currentUser } from '@/lib/session';
import { extensionHeaders, extensionPreflight } from '@/lib/extensionCors';
import { getProfileCard } from '@/lib/profile';

/**
 * The signed-in person's own card, for the extension's New Tab.
 *
 * Same shape of problem as `/api/session`, and the same two constraints apply:
 * the request reaches here from an extension *page* with `host_permissions`
 * for this origin, which is what makes Chromium send the `SameSite=Lax`
 * session cookie, and the answer must never be cached because it is
 * per-viewer. See the long note in `api/session/route.js` for the mechanism.
 *
 * **Why it is a second endpoint rather than a bigger `/api/session`.** That
 * route answers one question — is there an account behind this cookie — and is
 * called on every New Tab. This one is called only when a card is on screen,
 * costs several queries, and returns much more. Merging them would make the
 * cheap, frequent question pay for the expensive, rare one, and would widen
 * the payload that every New Tab receives.
 *
 * **It answers only for yourself.** There is no handle parameter: the subject
 * is whoever the cookie belongs to. A public profile is already readable at
 * `/user/<handle>` and does not need an API, and a parameter here would be a
 * way to enumerate accounts with a cookie attached.
 *
 * The credentialed CORS rules are shared — see `lib/extensionCors.js`.
 */
export async function GET(request) {
  const headers = extensionHeaders(request);

  try {
    const user = await currentUser();
    if (!user?.handle) {
      // Not an error: a signed-out New Tab asks this too, and the card renders
      // its signed-out state from the `signedIn: false` rather than from a 401
      // it would have to tell apart from a real failure.
      return Response.json({ signedIn: false }, { headers });
    }

    const profile = await getProfileCard(user.handle);
    if (!profile) return Response.json({ signedIn: false }, { headers });

    // `posts` is dropped: the card shows counts, and shipping every published
    // post to a widget would be the largest payload in the extension.
    const { posts, id, ...card } = profile;
    return Response.json({ signedIn: true, profile: card }, { headers });
  } catch (error) {
    // A failure must not read as signed out — the workspace's whole gating
    // rule is that only a definite answer locks anything.
    console.error('[api/profile] could not build the card', error);
    return Response.json({ error: 'Could not read the profile.' }, { status: 503, headers });
  }
}

export function OPTIONS(request) {
  return extensionPreflight(request);
}
