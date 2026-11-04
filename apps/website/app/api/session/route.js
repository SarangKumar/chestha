import { currentUser } from '@/lib/session';
import { extensionHeaders, extensionPreflight } from '@/lib/extensionCors';

/**
 * "Is there an account behind this cookie?" — for the extension's New Tab.
 *
 * Why this exists at all: the extension New Tab is a static client bundle on
 * its own `chrome-extension://` origin, so it cannot read a server component or
 * call `auth()` directly. Gating a section on sign-in needs a plain endpoint it
 * can ask.
 *
 * **How the cookie reaches here from an extension origin.** Chromium treats a
 * request as first-party for SameSite purposes when "the request initiator is
 * an extension with access to the requested URL" — see
 * `chrome/browser/extensions/extension_samesite_cookies_browsertest.cc`. So the
 * `SameSite=Lax` NextAuth session cookie *is* sent, provided two things hold:
 * the extension declares `host_permissions` for this origin (it does, injected
 * at assembly time by `scripts/build-extension.mjs`), and the request is made
 * from the extension *page* rather than its service worker — a worker has no
 * initiator frame and the exemption does not apply. That is why the fetch lives
 * in `apps/extension/src/app/session.js`, which runs on the New Tab page.
 *
 * Three things this route is responsible for:
 *
 *  - **Saying as little as possible.** The answer is a boolean plus the handle,
 *    because that is all the workspace renders. No email, no id, no session
 *    token. The email is the one field `buildProfileCard` exists to keep out of
 *    public surfaces, and this must not become a second way to read it.
 *  - **Never caching.** The answer is per-viewer and changes the moment someone
 *    signs out, so `no-store` is a correctness requirement, not a tuning
 *    choice: a cached `signedIn: true` on a shared CDN is a session leak.
 *  - **Not echoing arbitrary origins.** A credentialed response must name one
 *    origin — `*` is invalid with credentials, and echoing whatever `Origin`
 *    arrives would let any website read this with the visitor's cookie. The
 *    packed extension needs no CORS header at all (its host permission exempts
 *    it), so the dev-server allowlist that implements this lives in
 *    `lib/extensionCors.js`, shared with every other cookie'd route.
 */

export async function GET(request) {
  const headers = extensionHeaders(request);

  try {
    const user = await currentUser();

    if (!user) {
      return Response.json({ signedIn: false, checkedAt: new Date().toISOString() }, { headers });
    }

    return Response.json(
      {
        signedIn: true,
        checkedAt: new Date().toISOString(),
        user: {
          // The canonical lowercase key. `displayUsername` is not on the JWT,
          // and `coerceSession` falls back to the handle for the label rather
          // than this route adding a database read per New Tab to recover the
          // casing.
          handle: typeof user.handle === 'string' ? user.handle : '',
          // Whether they still owe us a username. The workspace uses it to send
          // someone to /onboarding/username instead of linking to a profile
          // they have not named yet — the same rule `/account` applies.
          handleChosen: user.handleChosen !== false,
        },
      },
      { headers },
    );
  } catch (error) {
    // A failure here must not read as "signed out" — that would gate the
    // workspace on a database hiccup. A 503 with no `signedIn` key coerces to
    // `unknown` in `coerceSession`, which fails open.
    console.error('[api/session] session read failed', error);
    return Response.json({ error: 'Could not read the session.' }, { status: 503, headers });
  }
}

export function OPTIONS(request) {
  return extensionPreflight(request);
}
