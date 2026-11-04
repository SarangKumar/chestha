import { ownPostsUrl } from '@chestha/core';
import { SITE_URL } from '../siteLinks.js';

/**
 * Talking to `/api/posts/mine`.
 *
 * Deliberately *not* a cached store like `session.js` and `profile.js`. Those
 * answer a question asked on every New Tab, where painting from cache before
 * the network is the whole point. This is asked only when the editor is open,
 * and a draft list served from a stale cache is the one thing an author must
 * never see — they would edit a version that no longer exists and overwrite
 * the real one. So every call goes to the server and the component holds the
 * result.
 *
 * `credentials: 'include'` on each: the same Chromium exemption that lets
 * `/api/session` work from an extension page applies here. See the note in
 * `apps/website/app/api/session/route.js` for why that holds.
 */

async function send(method, body) {
  const response = await fetch(ownPostsUrl(SITE_URL), {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    credentials: 'include',
    cache: 'no-store',
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // A non-JSON answer is a proxy or a sign-in page, not our route.
    payload = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      // The server's own words when it gave them — they are written for the
      // author ("Another post already uses that address") and are better than
      // anything this layer could invent.
      error: payload?.error ?? 'That did not work. Check your connection and try again.',
      status: response.status,
    };
  }
  return { ok: true, ...payload };
}

export function listOwnPosts() {
  return send('GET');
}

export function createDraft(input = {}) {
  return send('POST', input);
}

/** Content, status, or both. The server applies content first. */
export function savePost(id, patch) {
  return send('PATCH', { id, ...patch });
}

export function deletePost(id) {
  return send('DELETE', { id });
}
