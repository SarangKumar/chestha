/**
 * A thin launcher, deliberately.
 *
 * The whole workspace is bundled into the extension, so clicking the icon opens
 * it from `chrome-extension://`. Nothing is fetched from the network, and there
 * is no second copy of the UI to maintain inside a popup.
 *
 * `tabs` is the only permission requested, and solely so an already-open
 * workspace is raised instead of opening a duplicate. There is no host
 * permission: the extension never reads or touches any other site.
 *
 * Note the storage boundary — this runs on its own origin, so its data is
 * separate from the same app served over http. An export/import moves data
 * between them.
 */
const APP_URL = chrome.runtime.getURL('index.html');

chrome.action.onClicked.addListener(async () => {
  const [existing] = await chrome.tabs.query({ url: `${APP_URL}*` });
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url: APP_URL });
});
