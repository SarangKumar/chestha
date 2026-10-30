import { AREAS } from '../schema.js';
import { mergeEvents } from '../dsa/events.js';

/**
 * Workspace sync, built on the fact that storage is already per-area: each
 * area is an independent record, so each area syncs independently and a
 * conflict in `settings` cannot endanger `tasks`.
 *
 * Every area carries a server-assigned integer revision. A client remembers
 * the revision it last saw (`baseRev`); a push carrying the current server
 * revision is a clean fast-forward, and anything else is a genuine concurrent
 * edit that has to be merged. Revisions are used rather than clocks because
 * device clocks disagree, and a skewed clock silently discards real work.
 *
 * How an area merges depends on the *shape* of what it stores, which is not
 * uniform: only `tasks` is a bare id-keyed list, `tags` is a list of plain
 * strings, and the other record collections sit nested inside an object
 * alongside derived caches. So each area declares its own descriptor below
 * rather than being guessed at from its name.
 */

/** @typedef {'records'|'set'|'events'|'replace'|'nested'} MergeKind */

/**
 * - **records** — id-keyed list; merges per record, so two devices editing
 *   different tasks both keep their edit. This is what makes sync worth having.
 * - **set** — list of scalars; merged as a union, since a string carries no
 *   timestamp to compare and losing a tag is worse than keeping a stale one.
 * - **events** — append-only stream, deduplicated by identity. An event is a
 *   fact that happened; it is never edited, so a union is exactly right.
 * - **replace** — one settings-shaped object with no meaningful field-level
 *   merge (a widget grid, a preferences blob). The newer side wins whole and
 *   the loser is handed back rather than dropped.
 * - **nested** — an object holding one or more of the above under named keys,
 *   with everything else replaced.
 *
 * @type {Record<string, {kind: MergeKind, key?: string, stamp?: string, collections?: object}>}
 */
export const AREA_MERGE = {
  tasks: { kind: 'records', key: 'id', stamp: 'updatedAt' },
  tags: { kind: 'set' },
  // A single text blob. Merging two edits of one document needs a text-level
  // three-way diff, which is a far larger problem than this pass; LWW with the
  // loser preserved is the honest interim answer.
  notes: { kind: 'replace' },
  dashboard: { kind: 'replace' },
  sound: { kind: 'replace' },
  settings: { kind: 'replace' },

  // Rebuilt from the bundled packs, so it is derived data rather than user
  // work: replacing it loses nothing that cannot be regenerated.
  'dsa.library': { kind: 'replace' },
  'dsa.progress': {
    kind: 'nested',
    collections: {
      // Solving history is the irreplaceable part of the DSA section and
      // reuses the existing dedupe rule rather than inventing a second one.
      events: { kind: 'events' },
      // A schedule is keyed by slug and recomputed from events; the later
      // write wins per slug.
      schedules: { kind: 'map', stamp: 'updatedAt' },
    },
    // `questionState` is a derived cache and is rebuilt, not merged.
  },
  'dsa.lists': {
    kind: 'nested',
    collections: {
      lists: { kind: 'records', key: 'id', stamp: 'updatedAt' },
      memberships: { kind: 'set', identity: (m) => `${m?.listId}::${m?.slug}` },
    },
  },
  'dsa.settings': { kind: 'replace' },

  'grove.settings': { kind: 'replace' },
  // Per-day tracked totals, keyed by local day. The later write wins per day,
  // which is wrong if the *same* day was tracked on two devices at once:
  // neither summing (double-counts an overlap) nor picking one (loses the
  // other) is right without per-session detail. Recorded as an open decision
  // in AGENTS.md; picking one day's total is the lesser harm for now.
  'grove.time': { kind: 'nested', collections: { days: { kind: 'map', stamp: 'updatedAt' } } },
  'grove.ledger': {
    kind: 'nested',
    collections: { events: { kind: 'events' } },
  },
  'grove.focus': {
    kind: 'nested',
    collections: { sessions: { kind: 'records', key: 'id', stamp: 'updatedAt' } },
  },
  'grove.garden': { kind: 'replace' },
};

/** Every area that participates in sync. */
export const SYNC_AREAS = AREAS;

export function isSyncableArea(area) {
  return SYNC_AREAS.includes(area);
}

/** The merge kind for an area. Unknown areas replace, the conservative default. */
export function areaStrategy(area) {
  return AREA_MERGE[area]?.kind ?? 'replace';
}

function instant(value) {
  const t = Date.parse(value ?? '');
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Key order is insertion order in JSON, so a plain `JSON.stringify` would rank
 * two logically identical objects differently. Sorting keys makes the form
 * depend only on content.
 */
function stableString(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableString).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableString(value[k])}`).join(',')}}`;
}

/**
 * Breaks a same-timestamp tie on the *content* of the two sides, not on which
 * side they arrived from. Position-based tie-breaking ("remote wins") is not
 * commutative, so two devices merging the same pair in opposite positions
 * would each keep a different record and never converge. Comparing content
 * gives one total order every device computes the same way.
 *
 * @returns {number} > 0 when `a` should win.
 */
function breakTie(a, b) {
  const sa = stableString(a);
  const sb = stableString(b);
  if (sa === sb) return 0;
  return sa > sb ? 1 : -1;
}

/**
 * Merges two versions of an id-keyed record list.
 *
 * Deletions need tombstones. Without them a record deleted on device A is
 * simply absent from A's list, and merging with B — where it still exists —
 * resurrects it. So a delete must be recorded as `{ id, deletedAt }`; callers
 * that cannot supply tombstones will see deletes undone, which is why the
 * local store has to log them rather than just splicing the array.
 *
 * @param {{ records: object[], tombstones?: {id: string, deletedAt: string}[] }} local
 * @param {{ records: object[], tombstones?: {id: string, deletedAt: string}[] }} remote
 * @param {{ key?: string, stamp?: string }} [spec]
 * @returns {{ records: object[], tombstones: object[], stats: object }}
 */
export function mergeRecordArea(local, remote, spec = {}) {
  const key = spec.key ?? 'id';
  const stamp = spec.stamp ?? 'updatedAt';

  const tombstones = new Map();
  for (const side of [local, remote]) {
    for (const stone of side?.tombstones ?? []) {
      const id = stone?.[key] ?? stone?.id;
      if (!id) continue;
      const existing = tombstones.get(id);
      // Keep the earliest delete: the record was gone from that moment on.
      if (!existing || instant(stone.deletedAt) < instant(existing.deletedAt)) {
        tombstones.set(id, { id, deletedAt: stone.deletedAt });
      }
    }
  }

  const merged = new Map();
  const stats = { localWins: 0, remoteWins: 0, deleted: 0 };

  const take = (record, side) => {
    if (!record || typeof record !== 'object') return;
    const id = record[key];
    if (!id) return;
    const existing = merged.get(id);
    if (!existing) {
      merged.set(id, { record, side });
      return;
    }
    // Same record on both sides: the later edit wins, and an exact tie is
    // broken on content so the result does not depend on which device merged.
    const delta = instant(record[stamp]) - instant(existing.record[stamp]);
    if (delta > 0 || (delta === 0 && breakTie(record, existing.record) > 0)) {
      merged.set(id, { record, side });
    }
  };

  for (const record of local?.records ?? []) take(record, 'local');
  for (const record of remote?.records ?? []) take(record, 'remote');

  const records = [];
  for (const { record, side } of merged.values()) {
    const stone = tombstones.get(record[key]);
    // An edit after the delete revives the record: the user touched it last.
    if (stone && instant(record[stamp]) <= instant(stone.deletedAt)) {
      stats.deleted += 1;
      continue;
    }
    if (side === 'local') stats.localWins += 1;
    else stats.remoteWins += 1;
    records.push(record);
  }

  return { records, tombstones: [...tombstones.values()], stats };
}

/**
 * Union of two scalar (or identity-keyed) lists. A plain string has no
 * timestamp to compare, and a tag or list membership reappearing is a far
 * smaller harm than one silently vanishing, so nothing is dropped. Order
 * follows local first so a device's own list does not reshuffle under it.
 */
export function mergeSetArea(local, remote, spec = {}) {
  const identity = spec.identity ?? ((item) => (typeof item === 'object' ? stableString(item) : String(item)));
  const seen = new Set();
  const out = [];
  for (const item of [...(local ?? []), ...(remote ?? [])]) {
    if (item === null || item === undefined) continue;
    const id = identity(item);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

/**
 * Append-only event streams, deduplicated by the existing DSA rule. An event
 * records something that happened and is never edited, so a union loses
 * nothing — and is the one merge that needs no conflict policy at all.
 */
export function mergeEventArea(local, remote) {
  const { merged } = mergeEvents(Array.isArray(local) ? local : [], Array.isArray(remote) ? remote : []);
  return merged;
}

/** Keyed object (slug → record). The later value wins per key. */
export function mergeMapArea(local, remote, spec = {}) {
  const stamp = spec.stamp ?? 'updatedAt';
  const out = { ...(local && typeof local === 'object' ? local : {}) };
  for (const [key, value] of Object.entries(remote && typeof remote === 'object' ? remote : {})) {
    const mine = out[key];
    if (mine === undefined) { out[key] = value; continue; }
    const delta = instant(value?.[stamp]) - instant(mine?.[stamp]);
    if (delta > 0 || (delta === 0 && breakTie(value, mine) > 0)) out[key] = value;
  }
  return out;
}

/**
 * Last-write-wins for a whole-object area.
 * @returns {{ value: unknown, winner: 'local'|'remote', discarded: unknown }}
 */
export function mergeReplaceArea(local, remote) {
  const localAt = instant(local?.updatedAt);
  const remoteAt = instant(remote?.updatedAt);
  // Content breaks an exact tie, for the same convergence reason as above.
  const localWins = localAt > remoteAt
    || (localAt === remoteAt && breakTie(local?.value, remote?.value) > 0);
  return {
    value: localWins ? local?.value : remote?.value,
    winner: localWins ? 'local' : 'remote',
    discarded: localWins ? remote?.value : local?.value,
  };
}

function mergeCollection(spec, local, remote) {
  switch (spec.kind) {
    case 'records':
      return mergeRecordArea({ records: local }, { records: remote }, spec).records;
    case 'set':
      return mergeSetArea(local, remote, spec);
    case 'events':
      return mergeEventArea(local, remote);
    case 'map':
      return mergeMapArea(local, remote, spec);
    default:
      return remote ?? local;
  }
}

/**
 * Merges one area according to its descriptor. The single entry point callers
 * should use, so no caller has to know an area's shape.
 *
 * @param {string} area
 * @param {{ value: unknown, updatedAt?: string, tombstones?: object[] }} local
 * @param {{ value: unknown, updatedAt?: string, tombstones?: object[] }} remote
 * @returns {{ value: unknown, kind: string, discarded?: unknown }}
 */
export function mergeArea(area, local, remote) {
  const spec = AREA_MERGE[area] ?? { kind: 'replace' };

  if (spec.kind === 'records') {
    const { records, tombstones } = mergeRecordArea(
      { records: local?.value ?? [], tombstones: local?.tombstones },
      { records: remote?.value ?? [], tombstones: remote?.tombstones },
      spec,
    );
    return { value: records, tombstones, kind: spec.kind };
  }
  if (spec.kind === 'set') {
    return { value: mergeSetArea(local?.value, remote?.value, spec), kind: spec.kind };
  }
  if (spec.kind === 'events') {
    return { value: mergeEventArea(local?.value, remote?.value), kind: spec.kind };
  }
  if (spec.kind === 'nested') {
    // Start from the replace winner so unlisted keys — derived caches and
    // scalars — take a coherent whole side rather than a mix of both.
    const base = mergeReplaceArea(local, remote);
    const value = { ...(base.value && typeof base.value === 'object' ? base.value : {}) };
    for (const [key, collectionSpec] of Object.entries(spec.collections ?? {})) {
      value[key] = mergeCollection(collectionSpec, local?.value?.[key], remote?.value?.[key]);
    }
    return { value, kind: spec.kind, discarded: base.discarded };
  }
  const replaced = mergeReplaceArea(local, remote);
  return { value: replaced.value, kind: 'replace', winner: replaced.winner, discarded: replaced.discarded };
}

/**
 * Decides what to do with one area, given what the client has and what the
 * server reports. Pure, so the decision is testable without a network.
 *
 * @param {{ area?: string, baseRev: number, dirty: boolean }} client
 * @param {{ rev: number }} server
 * @returns {{ action: 'noop'|'push'|'pull'|'merge', reason: string }}
 */
export function planAreaSync(client, server) {
  const baseRev = Number.isInteger(client?.baseRev) ? client.baseRev : 0;
  const serverRev = Number.isInteger(server?.rev) ? server.rev : 0;
  const dirty = Boolean(client?.dirty);

  if (serverRev === baseRev) {
    return dirty
      ? { action: 'push', reason: 'Local edits on top of the current revision.' }
      : { action: 'noop', reason: 'Already in step.' };
  }
  if (serverRev > baseRev) {
    return dirty
      ? { action: 'merge', reason: 'Both sides changed since the last sync.' }
      : { action: 'pull', reason: 'The server moved ahead.' };
  }
  // A server revision behind the client's base means the client is holding a
  // revision this server never issued — a restored backup, or a different
  // database. Pushing would overwrite whatever is really there, so the caller
  // has to decide; it is never resolved silently.
  return { action: 'merge', reason: 'The server is behind the revision this device last saw.' };
}

/**
 * Builds a whole-workspace plan, one entry per area.
 * @param {Record<string, {baseRev: number, dirty: boolean}>} clientAreas
 * @param {Record<string, {rev: number}>} serverAreas
 */
export function planSync(clientAreas = {}, serverAreas = {}) {
  const plan = {};
  for (const area of SYNC_AREAS) {
    plan[area] = planAreaSync(
      { area, ...(clientAreas[area] ?? { baseRev: 0, dirty: false }) },
      serverAreas[area] ?? { rev: 0 },
    );
  }
  return plan;
}
