import { SESSION_IN, profileCardUrl } from '@chestha/core';
import { SITE_URL } from '../siteLinks.js';
import { isExtensionRuntime } from './platform.js';
import { read as readSession, subscribe as subscribeSession } from './session.js';

/**
 * The signed-in person's own card, cached the way the session is.
 *
 * It is a second store rather than more fields on the session one, for the
 * same reason `/api/profile` is a second endpoint: the session answer is one
 * boolean asked on every New Tab, and this is several queries asked only when
 * a card is on screen. Folding them together would make every tab pay for a
 * card most tabs never show.
 *
 * Three rules it shares with `session.js`, and for the same reasons:
 *
 *  - **The fetch happens on this page, not in the service worker.** Chromium's
 *    SameSite exemption needs an initiator frame with host access; a worker
 *    has none, so the cookie would simply not be sent.
 *  - **The cache answers first.** `read()` is synchronous so a card paints
 *    immediately and an offline New Tab shows the last known numbers rather
 *    than a spinner that never resolves.
 *  - **A failure is never a sign-out.** Offline, a 503 or a malformed body all
 *    leave the previous answer in place.
 *
 * One rule of its own: **it follows the session.** Signing out has to empty
 * this, or the card would keep showing a name and a streak belonging to an
 * account that is no longer there.
 */

const STORAGE_KEY = 'chestha.profile';

/** Long enough that opening tabs in a row is one request; short enough that a
 *  post published this morning shows up today. The counts are not live data. */
const MAX_AGE_MS = 15 * 60 * 1000;

let current = { state: 'unknown', profile: null, checkedAt: null };
let hydrated = false;
let inFlight = null;
const listeners = new Set();

function emit() {
  for (const listener of listeners) listener();
}

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

function adopt(next) {
  // `useSyncExternalStore` compares by identity, so an unchanged answer must
  // not produce a new object or every check would re-render the card.
  const same = next.state === current.state
    && next.profile?.handle === current.profile?.handle
    && next.profile?.stats?.posts === current.profile?.stats?.posts
    && next.profile?.stats?.followers === current.profile?.stats?.followers
    && next.profile?.stats?.postsRead === current.profile?.stats?.postsRead
    && next.profile?.stats?.readStreak === current.profile?.stats?.readStreak;
  if (same) return;
  current = next;
  emit();
}

function coerce(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.signedIn !== true) return { state: 'signed-out', profile: null, checkedAt: raw.checkedAt ?? null };
  const profile = raw.profile;
  if (!profile || typeof profile.handle !== 'string' || !profile.handle) return null;
  return {
    state: 'ready',
    profile: {
      handle: profile.handle,
      displayUsername: profile.displayUsername || profile.handle,
      name: typeof profile.name === 'string' ? profile.name : '',
      bio: typeof profile.bio === 'string' ? profile.bio : '',
      image: typeof profile.image === 'string' ? profile.image : null,
      interests: Array.isArray(profile.interests) ? profile.interests : [],
      topTags: Array.isArray(profile.topTags) ? profile.topTags : [],
      stats: profile.stats && typeof profile.stats === 'object' ? profile.stats : {},
    },
    checkedAt: raw.checkedAt ?? new Date().toISOString(),
  };
}

async function hydrate() {
  if (hydrated) return;
  hydrated = true;
  if (!store) return;
  try {
    const cached = coerce(await store.get());
    if (cached) adopt(cached);
  } catch {
    /* an unreadable cache is an unknown profile, which is where we started */
  }
}

function isStale() {
  if (!current.checkedAt) return true;
  const age = Date.now() - Date.parse(current.checkedAt);
  return !Number.isFinite(age) || age > MAX_AGE_MS;
}

export async function check({ force = false } = {}) {
  await hydrate();

  // Nothing to ask for while the session says there is no account. Asking
  // anyway would be a request per New Tab that can only ever answer "no".
  if (readSession().state !== SESSION_IN) {
    adopt({ state: 'signed-out', profile: null, checkedAt: new Date().toISOString() });
    return current;
  }

  if (!force && !isStale()) return current;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const response = await fetch(profileCardUrl(SITE_URL), {
        headers: { Accept: 'application/json' },
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) return current;

      const next = coerce({ ...(await response.json()), checkedAt: new Date().toISOString() });
      if (!next) return current;

      adopt(next);
      if (store) await store.set(next.state === 'ready' ? { signedIn: true, ...next } : { signedIn: false });
      return current;
    } catch {
      // Offline, blocked, or a malformed body — all of them mean "we still do
      // not know", which is not the same as "no account".
      return current;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

export async function start() {
  await hydrate();
  await check();
  return current;
}

export async function forget() {
  adopt({ state: 'unknown', profile: null, checkedAt: null });
  if (store) {
    try {
      await store.set(null);
    } catch {
      /* best effort */
    }
  }
}

/**
 * Drop the card when the session stops saying "signed in".
 *
 * Without this, signing out on the website would leave a name, an avatar and a
 * streak on the New Tab until the cache aged out — showing someone else's
 * identity on a shared machine, which is the one failure here that actually
 * matters.
 */
let lastSessionState = readSession().state;
subscribeSession(() => {
  const state = readSession().state;
  if (state === lastSessionState) return;
  lastSessionState = state;
  if (state !== SESSION_IN) forget();
  else check({ force: true });
});
