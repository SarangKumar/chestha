import { SESSION_IN, isSyncableArea } from '@chestha/core';
import { SITE_URL } from '../siteLinks.js';
import { isExtensionRuntime } from './platform.js';
import { read as readSession } from './session.js';

/**
 * Pushing workspace areas to the account they belong to.
 *
 * **Why this exists at all.** The merge rules, the revision scheme and the
 * `WorkspaceArea` table were all written long before anything served them, so
 * no device had ever sent an area anywhere — solving a question wrote to
 * IndexedDB and stopped there. This is the client half of `/api/sync`.
 *
 * Three things shape it:
 *
 *  - **It is push-then-adopt, not a full two-way engine.** The server answers
 *    every push with the authoritative value, so a device that pushes gets the
 *    merged result back in the same round trip. That is enough to make solving
 *    durable and shared, and it is deliberately less than continuous sync,
 *    which needs conflict UI this pass does not have.
 *  - **Only the DSA areas are wired.** The endpoint serves every area, and the
 *    merge rules cover every area, but a device that silently pushed `tasks`
 *    and `settings` could lose work in ways nothing here has been able to test
 *    against a real database. Progress is the thing that was asked for and the
 *    thing whose merge rule — an append-only event union — cannot lose a write.
 *  - **Failures are silent and local-first.** A push that cannot complete
 *    leaves the local store untouched and retries on the next change. Nothing
 *    about the workspace depends on the network having worked.
 *
 * The revision each area was last seen at lives in `chrome.storage.local`
 * beside the data, not in the synced blob: it describes this device's
 * relationship to the server, and syncing it would be circular.
 */

const REV_KEY = 'chestha.sync.revs';

/**
 * The areas this pass pushes.
 *
 * `dsa.progress` is solving history and the revision schedule — the
 * irreplaceable part. `dsa.lists` is personal grouping. `dsa.library` is
 * deliberately absent: it is rebuilt from the bundled packs, so it is derived
 * data that would cost megabytes per push to carry nothing the other device
 * cannot regenerate.
 */
export const SYNCED_AREAS = ['dsa.progress', 'dsa.lists'];

/** Changes land in bursts — a solve writes progress and may rewrite a list. */
const DEBOUNCE_MS = 4000;

let revisions = null;
let timer = null;
const pending = new Set();
let pushing = false;

function storage() {
  if (isExtensionRuntime()) {
    try {
      const area = chrome?.storage?.local;
      if (!area) return null;
      return {
        async get() { return (await area.get(REV_KEY))?.[REV_KEY] ?? null; },
        async set(value) { await area.set({ [REV_KEY]: value }); },
      };
    } catch {
      return null;
    }
  }
  return {
    async get() {
      try {
        const raw = localStorage.getItem(REV_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    },
    async set(value) {
      try { localStorage.setItem(REV_KEY, JSON.stringify(value)); } catch { /* best effort */ }
    },
  };
}

const store = storage();

async function loadRevisions() {
  if (revisions) return revisions;
  revisions = {};
  try {
    const stored = await store?.get();
    if (stored && typeof stored === 'object') revisions = { ...stored };
  } catch {
    /* an unreadable revision map means starting from 0, which merges rather
       than overwrites — the safe direction */
  }
  return revisions;
}

async function rememberRevision(area, rev) {
  revisions = { ...(revisions ?? {}), [area]: rev };
  try { await store?.set(revisions); } catch { /* best effort */ }
}

/**
 * Push one area and adopt whatever the server says it now holds.
 *
 * @returns {Promise<{ok: boolean, value?: unknown, merged?: boolean}>}
 */
export async function pushArea(area, value, tombstones = []) {
  if (!isSyncableArea(area)) return { ok: false };
  if (readSession().state !== SESSION_IN) return { ok: false };

  const revs = await loadRevisions();

  try {
    const response = await fetch(new URL('/api/sync', SITE_URL).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      // The cookie is the whole point, and the same Chromium exemption that
      // makes `/api/session` work from an extension page applies here.
      credentials: 'include',
      cache: 'no-store',
      body: JSON.stringify({ area, baseRev: revs[area] ?? 0, value, tombstones }),
    });
    if (!response.ok) return { ok: false };

    const result = await response.json();
    if (Number.isInteger(result?.rev)) await rememberRevision(area, result.rev);
    return { ok: true, value: result?.value, merged: Boolean(result?.merged) };
  } catch {
    // Offline, blocked, or a malformed answer. The local store is already
    // correct; the next change tries again.
    return { ok: false };
  }
}

/**
 * Note that an area changed. Pushes are debounced and coalesced, so marking
 * the same area ten times in a second is one request.
 */
export function markDirty(area) {
  if (!SYNCED_AREAS.includes(area)) return;
  pending.add(area);
}

/**
 * Start watching a store and pushing what changes.
 *
 * Returns an unsubscribe. The comparison is by reference per area, which is
 * exactly how the store already updates — it replaces an area's object when
 * that area changes — so this notices real writes and not re-renders.
 */
export function watch(workspaceStore) {
  let previous = snapshotOf(workspaceStore.getState());

  const flush = async () => {
    timer = null;
    if (pushing || pending.size === 0) return;
    if (readSession().state !== SESSION_IN) { pending.clear(); return; }

    pushing = true;
    try {
      const state = workspaceStore.getState();
      for (const area of [...pending]) {
        pending.delete(area);
        // eslint-disable-next-line no-await-in-loop
        await pushArea(area, state[area]);
      }
    } finally {
      pushing = false;
    }
  };

  return workspaceStore.subscribe(() => {
    const next = snapshotOf(workspaceStore.getState());
    for (const area of SYNCED_AREAS) {
      if (next[area] !== previous[area]) markDirty(area);
    }
    previous = next;

    if (pending.size > 0 && timer === null) {
      timer = setTimeout(flush, DEBOUNCE_MS);
    }
  });
}

function snapshotOf(state) {
  const out = {};
  for (const area of SYNCED_AREAS) out[area] = state?.[area];
  return out;
}

/** Flush immediately — used when a tab is being hidden or closed. */
export async function flushNow(workspaceStore) {
  if (pending.size === 0 || readSession().state !== SESSION_IN) return;
  const state = workspaceStore.getState();
  for (const area of [...pending]) {
    pending.delete(area);
    // eslint-disable-next-line no-await-in-loop
    await pushArea(area, state[area]);
  }
}
