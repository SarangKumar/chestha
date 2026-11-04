/**
 * Headers for the routes the extension calls **with its cookie**.
 *
 * This was written out by hand in `/api/session` and again in `/api/profile`,
 * and a third copy in the authoring routes would have been the point where the
 * allowlist in one of them quietly fell out of step with the others. The rule
 * it encodes is the one worth not getting wrong twice:
 *
 *  - **Never echo an arbitrary `Origin`.** A credentialed response must name a
 *    single origin — `*` is invalid with credentials — and echoing whatever
 *    arrives would let any website read these with the visitor's cookie.
 *  - **The packed extension needs no CORS header at all.** Its declared
 *    `host_permissions` for this origin is what exempts it. So the allowlist
 *    below exists only for the Vite dev server, and only outside production.
 *  - **Never cached.** Every one of these answers is per-viewer, so a cached
 *    one on a shared CDN is a session leak rather than a stale page.
 *
 * Public, uncredentialed routes do not use this — see `/api/posts`, which is
 * genuinely `*` because nothing it returns is personal.
 */

/** `npm run dev:extension` serves the workspace here against the site on :3000. */
const DEV_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

const DEFAULT_METHODS = 'GET, OPTIONS';

/**
 * @param {Request} request
 * @param {{methods?: string, extra?: object}} [options] `methods` is what this
 *   route actually implements — advertising verbs it answers 405 to is a lie
 *   the preflight tells on the route's behalf.
 */
export function extensionHeaders(request, { methods = DEFAULT_METHODS, extra = {} } = {}) {
  const headers = {
    'Cache-Control': 'no-store',
    // The body does not vary by origin but the CORS header does, so any cache
    // in front of this must key on both.
    Vary: 'Origin, Cookie',
    ...extra,
  };

  const origin = request?.headers?.get('origin');
  if (process.env.NODE_ENV !== 'production' && origin && DEV_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Access-Control-Allow-Methods'] = methods;
    headers['Access-Control-Allow-Headers'] = 'Accept, Content-Type';
  }
  return headers;
}

/** The preflight answer. Same allowlist, no body. */
export function extensionPreflight(request, options) {
  return new Response(null, { status: 204, headers: extensionHeaders(request, options) });
}
