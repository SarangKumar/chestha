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
 * There **is** now a content script, added with the island, and the claim this
 * file used to make has to be read more carefully as a result. It is still true
 * that nothing here, and nothing in `island.js`, ever reads a page: the content
 * script appends one element, draws inside a closed shadow root, and queries
 * the document for nothing. What changed is the *capability* — the match
 * pattern is `<all_urls>`, so Chrome asks for "read and change all your data on
 * all websites" at install, and the user has to take the restraint on trust
 * where before the manifest proved it. The Grove's accounting is unchanged: it
 * reads the active tab's address through the `tabs` permission and nothing on
 * the page, exactly as it did.
 *
 * The host permission is still only the website's own origin, written at build
 * time for `/api/session`. The content script does not add one.
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

/**
 * The audio host.
 *
 * `chrome.offscreen` belongs to the worker, so creating the document lives
 * here and pages ask for it. Playback used to stop the moment the New Tab was
 * navigated away — typing a search into the start page killed the music — and
 * an offscreen document is the only thing Chrome keeps alive independently of
 * a tab for this reason.
 *
 * Creation races: two New Tabs can ask at the same moment, and the second
 * `createDocument` throws "Only a single offscreen document may be created".
 * The in-flight promise is shared, and the error is answered by asking whether
 * a document exists rather than by failing the caller.
 */
const OFFSCREEN_URL = 'offscreen.html';
let creating = null;

async function hasOffscreen() {
  try {
    if (chrome.offscreen?.hasDocument) return await chrome.offscreen.hasDocument();
  } catch {
    /* fall through to the context query below */
  }
  try {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    return contexts.length > 0;
  } catch {
    return false;
  }
}

async function ensureOffscreen() {
  if (!chrome.offscreen) return false;
  if (await hasOffscreen()) return true;
  if (!creating) {
    creating = chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Plays the ambient mix and the user’s own tracks so sound continues when the workspace tab is navigated away or closed.',
    }).catch(() => undefined).finally(() => { creating = null; });
  }
  await creating;
  return hasOffscreen();
}

async function openWorkspace() {
  const [existing] = await chrome.tabs.query({ url: `${APP_URL}*` });
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url: APP_URL });
}

chrome.action.onClicked.addListener(openWorkspace);

/**
 * The island's relay.
 *
 * The overlay in a page cannot reach the workspace: it is a different origin,
 * and the audio it is controlling lives in the workspace page's AudioContext.
 * So it sends here, and this forwards to the extension's own pages, where
 * `islandBridge.js` is listening.
 *
 * `chrome.runtime.sendMessage` from the worker reaches extension pages only —
 * never content scripts — so a forwarded command cannot land back in a web
 * page. When no workspace tab is open there is nothing listening and the send
 * rejects; that is not an error but the answer to the question, and the right
 * response is to open the workspace so the click still did something.
 *
 * Commands are checked against a fixed list rather than forwarded blindly: a
 * content script runs inside pages the user does not control.
 */
const ISLAND_COMMANDS = ['play', 'pause', 'stop', 'loop', 'complete', 'open'];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'audio/ensure') return false;
  if (sender?.id !== chrome.runtime.id) return false;

  ensureOffscreen().then(
    (ok) => sendResponse({ ok }),
    () => sendResponse({ ok: false }),
  );
  return true;
});

/**
 * "The record looks wrong, ask the host to say it again."
 *
 * Sent by the overlay when it can see a workspace record but no audio record,
 * which means a write did not land somewhere. It deliberately does **not**
 * create the offscreen document: a page with no music playing must not spawn
 * an audio host just by being looked at. If there is no host, there is nothing
 * to refresh and nothing happens.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'island/refresh') return false;
  if (sender?.id !== chrome.runtime.id) return false;

  (async () => {
    if (!(await hasOffscreen())) { sendResponse({ ok: false }); return; }
    await chrome.runtime
      .sendMessage({ type: 'audio/command', command: 'state', payload: {} })
      .catch(() => undefined);
    sendResponse({ ok: true });
  })();
  return true;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'island/relay') return false;
  if (sender?.id !== chrome.runtime.id) return false;
  if (!ISLAND_COMMANDS.includes(message.command)) return false;

  (async () => {
    if (message.command === 'open') {
      await openWorkspace();
      sendResponse({ ok: true, opened: true });
      return;
    }
    // Transport controls go to the audio host, which is where the sound
    // actually is — not to a workspace tab, which may not be open at all. The
    // host is woken first for the same reason.
    const forAudio = { play: 'play', pause: 'pause', stop: 'stop', loop: 'loop' };
    if (forAudio[message.command]) {
      if (await ensureOffscreen()) {
        await chrome.runtime.sendMessage({
          type: 'audio/command',
          command: forAudio[message.command],
          payload: message.command === 'loop' ? { loop: message.payload?.loop } : {},
        }).catch(() => undefined);
        sendResponse({ ok: true });
        return;
      }
    }

    try {
      await chrome.runtime.sendMessage({
        type: 'island/command',
        command: message.command,
        payload: message.payload ?? null,
        // Which workspace tab the overlay was looking at. With two open, a
        // `play` obeyed by both would start the same mix twice.
        target: message.target ?? null,
      });
      sendResponse({ ok: true });
    } catch {
      await openWorkspace();
      sendResponse({ ok: false, opened: true });
    }
  })();

  // The response is sent from a promise, so the channel has to stay open.
  return true;
});
