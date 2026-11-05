import { activeSoundIds, matchingPreset } from './sound.js';
import { isOverdue, selectCompletedOn, selectToday } from './tasks.js';

/**
 * The island's snapshot: the one thing the workspace tells the rest of Chrome.
 *
 * The island is drawn twice — as React inside the workspace, and as a plain DOM
 * overlay injected into other pages by a content script. Those two run in
 * different worlds and cannot share a store: a content script lives in the
 * page's origin and cannot read the workspace's IndexedDB, and the page cannot
 * reach into a tab it does not own. What crosses between them is this object,
 * written to `chrome.storage.local` by the workspace and read by everything
 * else.
 *
 * Two rules make that safe to maintain:
 *
 *  - **It is a projection, not a mirror.** Only what the island draws is in it.
 *    No task notes, no tags, no file names, no account identity — a snapshot
 *    that leaked the workspace into every page would be a worse privacy
 *    problem than the overlay itself, and the smallest honest payload is also
 *    the one that cannot grow one by accident.
 *  - **The reader never trusts the writer.** `coerceIslandSnapshot` runs on
 *    everything read back, because the value outlives the version that wrote
 *    it: an extension updated under a stale snapshot must not crash drawing
 *    it, and an overlay injected into a hostile page must not be steerable by
 *    anything that page can reach.
 *
 * Nothing here touches `chrome.*` — it is a pure shape, so the whole contract
 * is testable without a browser.
 */

/** Where the snapshot lives in `chrome.storage.local`. */
export const ISLAND_KEY = 'chestha.island';

/** Bumped when the shape changes in a way an older reader must not misread. */
export const ISLAND_VERSION = 1;

/** Where the island may appear. */
export const ISLAND_MODES = ['off', 'workspace', 'everywhere'];

/**
 * Commands the overlay may send back. An unknown one is dropped rather than
 * forwarded, so the list is the whole protocol and the relay has no opinions.
 */
export const ISLAND_COMMANDS = ['play', 'pause', 'stop', 'loop', 'complete', 'open'];

/** How long a snapshot stays believable without a refresh, in milliseconds. */
export const ISLAND_STALE_MS = 90_000;

const str = (value, max = 120) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const bool = (value) => value === true;
const count = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};
const seconds = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * The empty snapshot: valid, drawable, and says there is nothing to draw.
 *
 * `owner` is the id of the workspace tab that wrote it. Audio belongs to one
 * page's AudioContext, so with two Chestha tabs open only one of them is
 * actually making sound — and before this field existed they each published
 * their own view, so the last writer won and the overlay showed whichever tab
 * happened to write most recently. The owner is what lets a silent tab know to
 * mirror the playing one instead of contradicting it.
 */
export function emptyIslandSnapshot() {
  return {
    v: ISLAND_VERSION,
    at: 0,
    owner: '',
    mode: 'workspace',
    sound: null,
    media: null,
    tasks: { pending: [], done: 0, total: 0 },
  };
}

/**
 * Builds the snapshot from the workspace's own state.
 *
 * `allowed` is the gating answer, already decided by the caller — this module
 * deliberately does not import the gating table, because the rule there is
 * "unknown is not signed out" and re-deciding it here would be a second place
 * for that to be got wrong. A gated half simply arrives as `false` and its
 * part of the snapshot is left empty.
 *
 * `pendingLimit` bounds the payload: the overlay shows two and says "+N more",
 * so sending the whole list would put every task title you own into storage
 * that every tab's content script can read.
 */
export function buildIslandSnapshot({
  owner = '',
  mode = 'workspace',
  sound = {},
  catalogue = [],
  tasks = [],
  today = '',
  media = null,
  allowed = { sounds: false, tasks: false },
  now = Date.now(),
  pendingLimit = 3,
} = {}) {
  const snapshot = emptyIslandSnapshot();
  snapshot.at = Number.isFinite(now) ? now : 0;
  snapshot.owner = str(owner, 64);
  snapshot.mode = ISLAND_MODES.includes(mode) ? mode : 'workspace';

  if (allowed.sounds) {
    const knownIds = catalogue.map((item) => item?.id).filter(Boolean);
    const mix = sound.lastMix ?? {};
    const active = activeSoundIds(mix, knownIds);
    if (active.length > 0) {
      const sounds = active
        .map((id) => catalogue.find((item) => item?.id === id))
        .filter(Boolean);
      const single = sounds.length === 1 ? sounds[0] : null;
      const saved = matchingPreset(sound.presets, mix, knownIds);

      snapshot.sound = {
        title: str(single ? single.name : saved?.name ?? 'Unsaved mix'),
        subtitle: str(single ? single.group : `${sounds.length} sounds`),
        credit: str(single ? single.credit : sounds.map((item) => item.name).join(' · '), 160),
        count: sounds.length,
        saved: Boolean(saved),
        streaming: sounds.some((item) => item?.stream === true),
        playing: bool(sound.playing),
        loop: sound.loop !== false,
        volume: Math.min(1, Math.max(0, Number(sound.masterVolume) || 0)),
      };

      if (media && seconds(media.duration) > 0) {
        snapshot.media = {
          position: Math.min(seconds(media.position), seconds(media.duration)),
          duration: seconds(media.duration),
        };
      }
    }
  }

  if (allowed.tasks) {
    // `selectToday` is already "open, and due today or overdue" — it excludes
    // completed tasks and includes overdue ones, so concatenating it with
    // `selectOverdue` would list every late task twice. Overdue is pulled to
    // the front instead, because a late task is the one the top of the screen
    // most needs to say.
    const todays = selectToday(tasks, today);
    const open = [
      ...todays.filter((task) => isOverdue(task, today)),
      ...todays.filter((task) => !isOverdue(task, today)),
    ];
    // Done *today* is a completion instant falling in today's local day, not a
    // task dated today that happens to be finished — those are different
    // questions, and only this one can be answered from `completedAt`.
    const done = selectCompletedOn(tasks, today).length;

    snapshot.tasks = {
      pending: open.slice(0, pendingLimit).map((task) => ({
        id: str(task.id, 64),
        title: str(task.title),
        overdue: isOverdue(task, today),
      })),
      // The count is the whole list even though the list is clipped: "+4 more"
      // has to be true, and a number is not a leak the way a title is.
      pendingCount: open.length,
      done,
      total: done + open.length,
    };
  }

  return snapshot;
}

/**
 * Normalises anything read back from storage into a drawable snapshot.
 *
 * Returns the empty snapshot rather than null for an unusable value: every
 * caller draws the result, and a reader that has to check for null before
 * every field is a reader that will one day forget to.
 */
export function coerceIslandSnapshot(raw) {
  const out = emptyIslandSnapshot();
  if (!raw || typeof raw !== 'object') return out;
  if (raw.v !== ISLAND_VERSION) return out;

  out.at = count(raw.at);
  out.owner = str(raw.owner, 64);
  out.mode = ISLAND_MODES.includes(raw.mode) ? raw.mode : 'workspace';

  if (raw.sound && typeof raw.sound === 'object' && str(raw.sound.title)) {
    out.sound = {
      title: str(raw.sound.title),
      subtitle: str(raw.sound.subtitle),
      credit: str(raw.sound.credit, 160),
      count: count(raw.sound.count),
      saved: bool(raw.sound.saved),
      streaming: bool(raw.sound.streaming),
      playing: bool(raw.sound.playing),
      loop: raw.sound.loop !== false,
      volume: Math.min(1, Math.max(0, Number(raw.sound.volume) || 0)),
    };

    if (raw.media && typeof raw.media === 'object' && seconds(raw.media.duration) > 0) {
      const duration = seconds(raw.media.duration);
      out.media = { position: Math.min(seconds(raw.media.position), duration), duration };
    }
  }

  if (raw.tasks && typeof raw.tasks === 'object') {
    const pending = Array.isArray(raw.tasks.pending) ? raw.tasks.pending : [];
    out.tasks = {
      pending: pending
        .filter((task) => task && typeof task === 'object' && str(task.id, 64) && str(task.title))
        .slice(0, 5)
        .map((task) => ({
          id: str(task.id, 64),
          title: str(task.title),
          overdue: bool(task.overdue),
        })),
      done: count(raw.tasks.done),
      total: count(raw.tasks.total),
    };
    out.tasks.pendingCount = Math.max(count(raw.tasks.pendingCount), out.tasks.pending.length);
  }

  return out;
}

/** Whether a snapshot has anything worth drawing at all. */
export function islandHasContent(snapshot) {
  if (!snapshot) return false;
  if (snapshot.sound) return true;
  return (snapshot.tasks?.pendingCount ?? 0) > 0 || (snapshot.tasks?.done ?? 0) > 0;
}

/**
 * Whether a snapshot is too old to show.
 *
 * The workspace republishes on every change and on a heartbeat. If that stops —
 * the tab was closed, the machine slept, the page crashed — the last snapshot
 * is a claim about a workspace that is no longer there, and "Playing" over a
 * silent browser is exactly the kind of lie an always-visible overlay must not
 * tell. Stale snapshots are not drawn.
 */
export function isIslandStale(snapshot, now = Date.now(), staleMs = ISLAND_STALE_MS) {
  if (!snapshot?.at) return true;
  return now - snapshot.at > staleMs;
}

/**
 * Whether the stored snapshot belongs to a *different*, still-live workspace
 * tab — whatever it is doing.
 *
 * This is the primitive the other three questions are built from, and the
 * distinction from "owned" below is the fix for a flicker. Keying everything
 * on *playing* meant two tabs swapped the record back and forth whenever
 * neither was: each wrote, each saw the other's write, each wrote again, and
 * both islands alternated between their own view and a mirror of the other's.
 * Freshness and identity are stable facts; "is playing" is not.
 */
export function islandRecordedElsewhere(snapshot, self, now = Date.now()) {
  if (!snapshot?.owner || !self) return false;
  if (snapshot.owner === self) return false;
  return !isIslandStale(snapshot, now);
}

/**
 * Whether live audio belongs to a different tab. Narrower than the above: the
 * record is somebody else's *and* they are playing through it.
 */
export function islandOwnedElsewhere(snapshot, self, now = Date.now()) {
  return islandRecordedElsewhere(snapshot, self, now) && Boolean(snapshot.sound?.playing);
}

/**
 * Whether this tab may overwrite the stored snapshot.
 *
 * Whoever has the audio always owns the record. Everyone else leaves a live
 * tab's record alone — including another silent tab's, which is what stops
 * two idle workspace tabs rewriting it at each other as fast as the storage
 * events arrive.
 */
export function mayPublishIsland(mine, stored, self, now = Date.now()) {
  if (mine?.sound?.playing) return true;
  return !islandRecordedElsewhere(stored, self, now);
}

/**
 * Whether this tab may *remove* the stored snapshot.
 *
 * Only the tab that wrote it. A second workspace tab opening with nothing to
 * show used to delete the playing tab's record outright, which took the
 * overlay off every page until the next heartbeat put it back — a flicker
 * with a thirty-second period, and the reason this is a separate rule rather
 * than a reuse of the publish one.
 */
export function mayClearIsland(stored, self, now = Date.now()) {
  return !islandRecordedElsewhere(stored, self, now);
}

/**
 * What to call the thing that is playing.
 *
 * The audio host knows the *track* — it resolved the catalogue — but not the
 * *mix*: presets live in the workspace store and the host has none. A tab
 * holding the same mix can therefore improve "2 sounds" to "Rain + fire".
 *
 * The condition is the point. There is no cross-tab store sync in this app,
 * so a New Tab opened after the music started holds an empty mix and knows
 * nothing about what is playing — and a tab holding a *different* mix knows
 * something actively wrong. Either way its name is not the name of what you
 * are hearing, and preferring it is how the second tab came to disagree with
 * the first. The local name is used only when this tab's mix is the one
 * coming out of the browser.
 *
 * @param {{count?: number, title?: string}|null} shared the host's record
 * @param {string} localName what this tab would call its own mix
 * @param {number} localCount how many sounds this tab has in that mix
 */
export function islandTitle(shared, localName, localCount) {
  if (!shared) return '';
  const knowsThisMix = localCount > 0 && localCount === shared.count;
  if (knowsThisMix && localName) return localName;
  return shared.title ?? '';
}

/** Whether a command name is one the relay is allowed to forward. */
export function isIslandCommand(name) {
  return ISLAND_COMMANDS.includes(name);
}
