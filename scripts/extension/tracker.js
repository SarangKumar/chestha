/**
 * Website-time observation.
 *
 * This file observes; it does not decide. It knows whether a host is covered by some
 * rule and nothing else — no XP, no thresholds, no caps, no levels. Those rules live
 * in `packages/core/src/grove/` where they can be tested without a browser, and the
 * new-tab page applies them when it drains what is collected here.
 *
 * **The service worker never writes IndexedDB.** The app's store caches a whole area
 * in memory and writes it back debounced, with no cross-context notification, so two
 * writers would silently clobber each other. The worker appends immutable segments to
 * chrome.storage.local instead, and the page is the only writer of record.
 *
 * What is stored about you: a registrable domain, a local day, and a number of
 * seconds — only for domains you wrote a rule for. Never a URL, a path, a query, a
 * title, or anything at all about a site you did not configure.
 */
const KEY_RULES = 'grove.rules';          // mirror of the user's rules, written by the page
const KEY_ACTIVE = 'grove.active';        // the one open segment, if any
const KEY_INBOX = 'grove.inbox';          // closed segments waiting to be drained
const KEY_PAUSED = 'grove.paused';        // tracking off, paused, or a focus session running

const ALARM = 'grove.heartbeat';
const MAX_TICK_MS = 150_000;              // mirrors MAX_TICK_MS in grove/accrual.js
const MAX_INBOX = 2000;
const IDLE_SECONDS = 60;

const get = async (key, fallback) => (await chrome.storage.local.get(key))[key] ?? fallback;

function localDayOf(ms) {
  const date = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Label-boundary matching, deliberately duplicated from `grove/rules.js` rather than
 * imported: the worker is a plain file copied into the extension and has no bundler.
 * That file is the authority — if the two ever disagree, this one is wrong. The page
 * re-matches every segment when it drains, so a mistake here can only ever cause a
 * segment to be collected and then discarded, never mis-attributed.
 */
function coveredBy(rules, host) {
  return rules.some((rule) => rule.enabled !== false
    && (host === rule.domain || (rule.includeSubdomains !== false && host.endsWith(`.${rule.domain}`))));
}

function hostOf(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    const host = parsed.hostname.toLowerCase().replace(/\.+$/, '');
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return '';
  }
}

/** Appends closed time, split at local midnight so each part lands in its own day. */
async function appendSegments(active, now) {
  const credited = Math.min(Math.max(0, now - active.lastSeenAt), MAX_TICK_MS);
  if (credited < 1000) return;

  const parts = [];
  let cursor = now - credited;
  while (cursor < now) {
    const date = new Date(cursor);
    const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
    const slice = Math.min(midnight, now);
    parts.push({
      id: `seg_${cursor}_${Math.random().toString(36).slice(2, 8)}`,
      host: active.host,
      localDay: localDayOf(cursor),
      seconds: Math.round((slice - cursor) / 1000),
      closedAt: new Date(slice).toISOString(),
      duringFocus: active.duringFocus === true,
    });
    cursor = slice;
  }

  const inbox = await get(KEY_INBOX, []);
  const next = [...inbox, ...parts.filter((part) => part.seconds > 0)];
  // On overflow the oldest are merged rather than dropped, so a long spell with the
  // app unopened costs resolution, never credit.
  await chrome.storage.local.set({ [KEY_INBOX]: next.length > MAX_INBOX ? merge(next) : next });
}

function merge(segments) {
  const keep = segments.slice(-MAX_INBOX / 2);
  const merged = new Map();
  for (const segment of segments.slice(0, -MAX_INBOX / 2)) {
    const key = `${segment.host}|${segment.localDay}|${segment.duringFocus}`;
    const existing = merged.get(key);
    if (existing) existing.seconds += segment.seconds;
    else merged.set(key, { ...segment, id: `seg_merged_${key}` });
  }
  return [...merged.values(), ...keep];
}

/**
 * The only state change in the module: close whatever was open, then open a new
 * segment if every condition still holds. Every event runs exactly this, so a tab
 * switch, an idle transition, a window blur and the heartbeat cannot drift apart.
 */
export async function reconcile() {
  const now = Date.now();
  const active = await get(KEY_ACTIVE, null);
  if (active) await appendSegments(active, now);
  await chrome.storage.local.remove(KEY_ACTIVE);

  const paused = await get(KEY_PAUSED, { tracking: false, focus: false });
  if (!paused.tracking) return;

  const idle = await chrome.idle.queryState(IDLE_SECONDS);
  if (idle !== 'active') return;

  // The focused window only: exactly one tab in the whole browser can accrue at any
  // instant, which is what makes double-counting structurally impossible rather than
  // merely avoided.
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.url) return;
  const window = await chrome.windows.get(tab.windowId).catch(() => null);
  if (!window?.focused) return;

  const host = hostOf(tab.url);
  if (!host) return;
  const rules = await get(KEY_RULES, []);
  if (!coveredBy(rules, host)) return;

  await chrome.storage.local.set({
    [KEY_ACTIVE]: { host, startedAt: now, lastSeenAt: now, duringFocus: paused.focus === true },
  });
}

/** Keeps the open segment's checkpoint fresh, so a suspension loses one beat at most. */
async function heartbeat() {
  const active = await get(KEY_ACTIVE, null);
  if (!active) { await reconcile(); return; }
  await appendSegments(active, Date.now());
  await chrome.storage.local.set({ [KEY_ACTIVE]: { ...active, lastSeenAt: Date.now() } });
  await reconcile();
}

export function startTracking() {
  chrome.alarms.create(ALARM, { periodInMinutes: 1 });
  chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === ALARM) heartbeat(); });

  chrome.tabs.onActivated.addListener(() => reconcile());
  chrome.tabs.onUpdated.addListener((_id, change) => { if (change.url || change.status === 'complete') reconcile(); });
  chrome.tabs.onRemoved.addListener(() => reconcile());
  chrome.windows.onFocusChanged.addListener(() => reconcile());
  chrome.idle.setDetectionInterval(IDLE_SECONDS);
  chrome.idle.onStateChanged.addListener(() => reconcile());

  // A restart or an update leaves no open segment behind: whatever was open is closed
  // with the time it had, and the next event opens a fresh one.
  chrome.runtime.onStartup.addListener(() => reconcile());
  chrome.runtime.onInstalled.addListener(() => reconcile());
  chrome.storage.local.onChanged.addListener((changes) => {
    if (changes[KEY_PAUSED] || changes[KEY_RULES]) reconcile();
  });
}
