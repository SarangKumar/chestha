import {
  ISLAND_KEY, coerceIslandSnapshot, mayClearIsland, mayPublishIsland,
} from '@chestha/core';
import { isExtensionRuntime } from './platform.js';

/**
 * The workspace's half of the island bridge.
 *
 * The overlay injected into other sites cannot read the workspace's store, and
 * it cannot play audio — the AudioContext lives in this page. So this module
 * does two things and nothing else:
 *
 *  1. **Publishes** the snapshot to `chrome.storage.local`, where the content
 *     script in every tab can read it and subscribe to changes.
 *  2. **Receives** the commands that overlay sends back, relayed here by the
 *     service worker, and hands them to whatever the app registered.
 *
 * Everything is guarded on `isExtensionRuntime()`: the same bundle is served as
 * a plain website, where `chrome` does not exist and all of this is a no-op.
 * Nothing in the UI may depend on any of it having worked.
 *
 * The heartbeat matters as much as the writes. A snapshot says "playing", and
 * if this tab is closed the audio stops with it — but the snapshot would sit in
 * storage claiming otherwise. Readers treat a snapshot older than
 * `ISLAND_STALE_MS` as gone, so republishing on a timer is what makes the
 * overlay disappear when the workspace does, without the workspace getting a
 * chance to say goodbye.
 */

const HEARTBEAT_MS = 30_000;

/**
 * This tab's identity, for the lifetime of this page.
 *
 * Audio lives in one page's AudioContext, so with two workspace tabs open only
 * one of them is making sound. Every snapshot is stamped with whoever wrote
 * it, which is what lets the silent tab mirror the playing one rather than
 * publish a contradicting view of the same mix.
 */
export const ISLAND_SELF = (() => {
  try {
    return crypto.randomUUID();
  } catch {
    return `tab-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }
})();

let heartbeat = null;
let latest = null;
let handlers = {};

/** The last snapshot seen in storage — this tab's or another's. */
let shared = null;
const watchers = new Set();
let watching = false;

const announce = () => { for (const watcher of watchers) watcher(); };

const storage = () => {
  try {
    return isExtensionRuntime() ? chrome.storage?.local ?? null : null;
  } catch {
    return null;
  }
};

/**
 * Writes the snapshot, if this is running inside the extension and this tab is
 * entitled to.
 *
 * The entitlement check is the fix for two Chestha tabs disagreeing: a tab with
 * no audio does not overwrite the record of a tab that has some. Decided from
 * the cached `shared` value rather than by reading storage first, because a
 * read-then-write would race the other tab's heartbeat anyway and this is a
 * display record, not a ledger.
 */
export function publishIsland(snapshot) {
  const stamped = { ...snapshot, owner: ISLAND_SELF };
  latest = stamped;
  const area = storage();
  if (!area) return;
  watch();
  if (!mayPublishIsland(stamped, shared, ISLAND_SELF)) return;
  try {
    area.set({ [ISLAND_KEY]: stamped });
  } catch {
    // Storage is full, or the extension context was invalidated by a reload.
    // The overlay simply keeps the previous snapshot until it goes stale.
  }
}

/**
 * Removes the snapshot outright.
 *
 * Called when the island is switched off or nothing is left to show, so the
 * overlay goes immediately rather than waiting out the staleness window.
 */
export function clearIsland() {
  latest = null;
  const area = storage();
  if (!area) return;
  watch();
  // Only the tab that wrote the record may withdraw it. Without this, a second
  // workspace tab with nothing of its own to show deleted the playing tab's
  // record, and the overlay vanished from every page until the next heartbeat
  // restored it.
  if (!mayClearIsland(shared, ISLAND_SELF)) return;
  try {
    area.remove(ISLAND_KEY);
  } catch {
    /* see publishIsland */
  }
}

/**
 * Starts republishing the last snapshot on a timer.
 *
 * Idempotent: several mounts share one interval, because two heartbeats would
 * double the writes without making the snapshot any fresher.
 */
export function startIslandHeartbeat() {
  if (heartbeat || !storage()) return;
  heartbeat = setInterval(() => {
    if (!latest) return;
    publishIsland({ ...latest, at: Date.now() });
  }, HEARTBEAT_MS);
}

/**
 * The shared snapshot, as `useSyncExternalStore` wants it.
 *
 * Reading storage is asynchronous and the store wants a synchronous answer, so
 * the value is cached here and refreshed from the initial read and from every
 * change event. Null until the first read lands, which reads as "nobody else
 * is playing" — the safe default, since the alternative would be a tab
 * refusing to show its own audio while it waits.
 */
export function getIslandShared() {
  return shared;
}

/**
 * Keeps `shared` current.
 *
 * Called from publish and clear as well as from `subscribeIsland`, because the
 * guards depend on it and nothing in the UI subscribes any more — the audio
 * host made the cross-tab mirror unnecessary, and with it went the only
 * reader. A guard reading a value nobody maintains is not a guard.
 */
function watch() {
  if (watching) return;
  const area = storage();
  if (!area) return;
  watching = true;
  try {
    area.get(ISLAND_KEY, (values) => {
      if (chrome.runtime?.lastError) return;
      shared = values?.[ISLAND_KEY] ? coerceIslandSnapshot(values[ISLAND_KEY]) : null;
      announce();
    });
    chrome.storage?.onChanged?.addListener((changes, area2) => {
      if (area2 !== 'local' || !(ISLAND_KEY in changes)) return;
      const next = changes[ISLAND_KEY].newValue;
      shared = next ? coerceIslandSnapshot(next) : null;
      announce();

      // The record was withdrawn — the tab that wrote it closed. If this tab
      // still has something to say it takes over immediately, rather than
      // leaving the overlay off every page until its own next heartbeat.
      // Only one tab wins: the others find a fresh record and stand down.
      if (!shared && latest) publishIsland(latest);
    });
  } catch {
    // No extension storage here (the plain website build).
    watching = false;
  }
}

export function subscribeIsland(listener) {
  watchers.add(listener);
  watch();
  return () => { watchers.delete(listener); };
}

/**
 * Asks the owner tab to do something, by way of the service worker.
 *
 * `target` is the owner's id, so a command meant for the tab holding the audio
 * is not also obeyed by every other workspace tab — which, for `play`, would
 * start the same mix twice.
 */
export function sendIslandCommand(command, payload = null, target = null) {
  if (!isExtensionRuntime()) return;
  try {
    chrome.runtime.sendMessage({ type: 'island/relay', command, payload, target }, () => {
      void chrome.runtime.lastError;
    });
  } catch {
    /* the extension was reloaded under this page */
  }
}

export function stopIslandHeartbeat() {
  if (!heartbeat) return;
  clearInterval(heartbeat);
  heartbeat = null;
}

/**
 * Registers what to do with a command from the overlay.
 *
 * One registry rather than a listener list: there is exactly one workspace in
 * this tab, and two subscribers racing to pause the same mix would be a bug
 * dressed as flexibility. Returns a function that clears it again.
 */
export function onIslandCommand(next) {
  handlers = next ?? {};
  return () => { handlers = {}; };
}

let wired = false;

/**
 * Listens for relayed commands. Called once, from the app's own setup.
 *
 * The sender is checked: a message is only acted on when it came from this
 * extension (`sender.id === chrome.runtime.id`). A content script runs inside
 * pages the user does not control, and the overlay's commands arrive by the
 * same channel a hostile page could try to use.
 */
export function wireIslandCommands() {
  if (wired || !isExtensionRuntime()) return;
  try {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (sender?.id && sender.id !== chrome.runtime.id) return false;
      if (message?.type !== 'island/command') return false;
      // Addressed to a particular tab: everyone else ignores it. Without this
      // a `play` relayed from an overlay would start the mix in every open
      // workspace tab at once.
      if (message.target && message.target !== ISLAND_SELF) return false;

      const handler = handlers[message.command];
      if (typeof handler !== 'function') {
        sendResponse?.({ ok: false, reason: 'no-handler' });
        return false;
      }
      try {
        handler(message.payload);
        sendResponse?.({ ok: true });
      } catch {
        sendResponse?.({ ok: false, reason: 'failed' });
      }
      return false;
    });
    wired = true;
  } catch {
    // No runtime messaging here (plain website build) — commands simply never
    // arrive, which is correct: there is no overlay to send them.
  }
}
