/**
 * The only place the app talks to the service worker's storage.
 *
 * Kept apart from the drain hook so the store's actions can clear tracker state
 * without importing anything that imports the store back.
 *
 * Everything here is feature-detected: the same build runs as a Chrome extension and
 * as a plain web app on localhost, and on localhost there is no worker, no tracking
 * and nothing to talk to.
 */
export const KEY_RULES = 'grove.rules';
export const KEY_INBOX = 'grove.inbox';
export const KEY_PAUSED = 'grove.paused';
export const KEY_ACTIVE = 'grove.active';

export const trackingAvailable = () => typeof chrome !== 'undefined'
  && Boolean(chrome?.storage?.local)
  && Boolean(chrome?.tabs);

/** Clears the worker's own copies when website-time data is deleted or reset. */
export async function clearTrackerState() {
  if (!trackingAvailable()) return;
  try {
    await chrome.storage.local.remove([KEY_INBOX, KEY_ACTIVE]);
  } catch {
    /* the worker will simply re-open a segment; nothing depends on this succeeding */
  }
}
