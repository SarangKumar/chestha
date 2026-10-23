/**
 * A thin launcher, deliberately.
 *
 * The whole workspace is bundled into the extension, so clicking the icon opens
 * it from `chrome-extension://`. Nothing is fetched from the network, and there
 * is no second copy of the UI to maintain inside a popup.
 *
 * Four permissions, and no more. `tabs` raises an already-open workspace rather than
 * opening a duplicate, and lets the tracker read the active tab's address. `idle`
 * says whether you are at the keyboard, `alarms` wakes this worker once a minute,
 * and `storage` holds the handful of segments the page has not drained yet.
 *
 * There is **no host permission and no content script**: the extension can see which
 * site a tab is on, and nothing whatsoever about what is on the page. That limit is
 * deliberate and is what the Grove's privacy claim rests on.
 *
 * Note the storage boundary — this runs on its own origin, so its data is
 * separate from the same app served over http. An export/import moves data
 * between them.
 */
import { startTracking } from './tracker.js';

const APP_URL = chrome.runtime.getURL('index.html');

// Listeners are registered at the top level, as MV3 requires: the worker is woken by
// the event it must handle, so anything registered later would simply never fire.
startTracking();

chrome.action.onClicked.addListener(async () => {
  const [existing] = await chrome.tabs.query({ url: `${APP_URL}*` });
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url: APP_URL });
});
