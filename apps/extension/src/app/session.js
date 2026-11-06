import {
  SESSION_UNKNOWN, coerceSession, sessionUrl, shouldRecheck, unknownSession,
} from '@chestha/core';
import { SITE_URL } from '../siteLinks.js';
import { isExtensionRuntime } from './platform.js';

/**
 * Who the workspace is talking to, and the cache that makes asking cheap.
 *
 * A module singleton for the same reason the audio engine is one: the New Tab
 * mounts a tree that asks this from several places, and two copies would mean
 * two requests and two answers that can disagree.
 *
 * Four things here are load-bearing.
 *
 * **The fetch must happen on this page, not in the service worker.** Chromium
 * exempts a request from SameSite restrictions when the initiator is an
 * extension page with host access to the target; a service worker has no
 * initiator frame and gets no exemption, so the session cookie would simply not
 * be sent and every user would read as signed out. This file runs on the New
 * Tab document. Do not move the fetch into `background.js`.
 *
 * **The cache answers first, always.** `read()` is synchronous against an
 * in-memory value hydrated from `chrome.storage.local`, so the first paint never
 * waits on the network and an offline New Tab gates exactly as the last known
 * answer did. The request only ever *replaces* that answer.
 *
 * **A failure is never a sign-out.** Offline, a 503, a parse error — all coerce
 * to `unknown`, which `isSectionAllowed` treats as permitted. The only thing
 * that locks a section is the website explicitly saying there is no account.
 * This is the rule that keeps a fresh offline install from being unusable.
 *
 * **Storage is best-effort.** `chrome.storage` is absent on the website build
 * and can throw in a private window, so every access is guarded and a failure
 * degrades to asking the network once per page load rather than breaking.
 */

const STORAGE_KEY = 'chestha.session';

let current = unknownSession();
let hydrated = false;
let inFlight = null;
let pendingChange = false;
const listeners = new Set();

function emit() {
  for (const listener of listeners) listener();
}

/**
 * `chrome.storage.local` in the extension, `localStorage` on the website build.
 *
 * The website build is same-origin with the session cookie, so it could read
 * the endpoint on every load — but it costs nothing to cache there too, and one
 * code path is easier to reason about than two.
 */
function storage() {
  if (isExtensionRuntime()) {
    try {
      const area = chrome?.storage?.local;
      if (!area) return null;
      return {
        async get() {
          const bag = await area.get(STORAGE_KEY);
          return bag?.[STORAGE_KEY] ?? null;
        },
        async set(value) {
          await area.set({ [STORAGE_KEY]: value });
        },
      };
    } catch {
      return null;
    }
  }

  return {
    async get() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    async set(value) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      } catch {
        /* private window, or quota — the in-memory copy still serves this page */
      }
    },
  };
}

const store = storage();

/** The current answer. Synchronous by design — the first paint depends on it. */
export function read() {
  return current;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function adopt(session) {
  // Object identity is what `useSyncExternalStore` compares, so an unchanged
  // answer must not produce a new object or every check would re-render the
  // whole tree.
  const same = session.state === current.state
    && session.handle === current.handle
    && session.handleChosen === current.handleChosen;
  if (same) return;
  current = session;
  emit();
}

/**
 * Load the cached answer into memory.
 *
 * Deliberately separate from `check()`: hydration is what makes the gate
 * correct offline, and it must not be skipped just because a request is about
 * to be made.
 */
async function hydrate() {
  if (hydrated) return;
  hydrated = true;
  if (!store) return;
  try {
    const cached = coerceSession(await store.get());
    // A cached `unknown` tells us nothing; keep the one we already have.
    if (cached.state !== current.state) adopt(cached);
  } catch {
    /* an unreadable cache is an unknown session, which is where we started */
  }
}

/**
 * Ask the website. One request at a time, and the answer is cached.
 *
 * `credentials: 'include'` is the whole point: it is what carries the session
 * cookie. This is the one request in the extension that identifies the user,
 * and it goes only to our own origin.
 */
export async function check({ force = false } = {}) {
  await hydrate();
  if (!force && !shouldRecheck(current)) return current;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const response = await fetch(sessionUrl(SITE_URL), {
        headers: { Accept: 'application/json' },
        credentials: 'include',
        // The answer is per-viewer; a cached one would outlive a sign-out.
        cache: 'no-store',
      });
      // A non-2xx carries no `signedIn` key, so it coerces to `unknown` and
      // leaves the previous answer in place rather than locking the workspace.
      if (!response.ok) return current;

      const session = coerceSession(await response.json());
      if (session.state === SESSION_UNKNOWN) return current;

      adopt(session);
      if (store) await store.set(session);
      return current;
    } catch {
      // Offline, blocked, or a malformed body. All of them mean "we still do
      // not know", which is not the same as "signed out".
      return current;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Called once when the workspace mounts.
 *
 * Hydrates unconditionally so the gate is right offline, then asks the network
 * only if the cached answer is stale — which is what keeps ten New Tabs in a
 * row to one request.
 */
export async function start() {
  await hydrate();
  await check();
  return current;
}

/**
 * Note that the answer is about to change elsewhere.
 *
 * Called when someone follows the sign-out link. Forgetting the cached answer
 * here would be useless on its own — the sign-out happens in another tab, and
 * the recheck that followed would run *before* it and cache "signed in" again
 * for another ten minutes. So the click only records that a change is expected,
 * and `resume()` below asks once this page is looked at again.
 */
export function expectChange() {
  pendingChange = true;
}

/**
 * Called when the New Tab becomes visible again.
 *
 * The sign-out happens on the website, in a tab that cannot reach into this
 * one, so coming back is the only signal there is. A forced check runs only
 * when a change was expected; otherwise this is the ordinary freshness check
 * and ten tab switches in a row still make no requests.
 */
export async function resume() {
  if (!pendingChange) return check();
  pendingChange = false;
  return check({ force: true });
}

/**
 * Forget the cached answer.
 *
 * `unknown` fails open rather than locking someone out of a workspace they may
 * still be signed into, so this is safe to call speculatively.
 */
export async function forget() {
  adopt(unknownSession());
  if (store) {
    try {
      await store.set(null);
    } catch {
      /* best effort */
    }
  }
}
