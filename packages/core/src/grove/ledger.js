import { newId } from '../ids.js';
import { todayISO } from '../dates.js';

/**
 * The reward ledger: the one authoritative record of every XP award in the app.
 *
 * Append-only. Nothing is ever edited or removed — a mistaken award is cancelled by
 * appending a reversal, so the history can always explain the balance it produced.
 *
 * Duplicate prevention is the whole point of this module, and it is one mechanism:
 * every earnable thing names an idempotency `key`, and a key that is already present
 * is refused. Not an error — a refusal. Reward processing is expected to be retried
 * (a re-drained segment, a session recovered twice, a reload mid-write), and a retry
 * that silently does nothing is the correct outcome, not an exceptional one.
 */
export const REWARD_SOURCES = ['task', 'website', 'focus', 'adjustment'];

/** Events older than this are compacted into one row per day. */
export const ROLLUP_AFTER_DAYS = 180;

export function defaultLedger() {
  return { events: [], rollups: [], lifetime: { xp: 0, seeds: 0, seedsSpent: 0 } };
}

function int(value, fallback = 0) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Normalises one award. `xp` and `seeds` are floored to integers here so no other
 * module has to think about fractions — a reward of 7.5 XP would otherwise make the
 * balance depend on the order events were summed in.
 */
export function createRewardEvent(input = {}) {
  const at = typeof input.at === 'string' && !Number.isNaN(new Date(input.at).getTime())
    ? input.at
    : new Date().toISOString();
  return {
    id: newId('rw'),
    key: String(input.key ?? ''),
    at,
    localDay: typeof input.localDay === 'string' ? input.localDay : todayISO(new Date(at)),
    source: REWARD_SOURCES.includes(input.source) ? input.source : 'adjustment',
    xp: int(input.xp),
    seeds: int(input.seeds),
    ref: input.ref && typeof input.ref === 'object' ? { ...input.ref } : {},
    reverses: typeof input.reverses === 'string' ? input.reverses : null,
    note: String(input.note ?? '').slice(0, 160),
  };
}

/** Ids of events that have been cancelled by a reversal. */
function reversedIds(ledger) {
  const out = new Set();
  for (const event of ledger.events) if (event.reverses) out.add(event.reverses);
  return out;
}

/**
 * Whether this key has already been paid.
 *
 * A reversed event does not hold its key: undoing a completion and genuinely
 * completing the task again later must earn, or undo would quietly be a punishment.
 *
 * The check covers live events only. Rolled-up days keep totals, not keys, which
 * bounds storage — see `rollupLedger`. Website keys are day-scoped and focus keys
 * belong to a finished session, so neither can recur; a task id could, but only by
 * being reopened and re-completed more than ROLLUP_AFTER_DAYS later, which is work
 * genuinely done twice half a year apart. That is a deliberate bound, not an oversight.
 */
export function hasRewardKey(ledger, key) {
  if (!key) return false;
  const reversed = reversedIds(ledger);
  return ledger.events.some((event) => event.key === key && !reversed.has(event.id));
}

/**
 * @returns {{ ledger: object, event: object|null, duplicate: boolean }}
 *   `ledger` is the same object when nothing was appended, so a caller can skip a
 *   write by identity, exactly as `store.update` already does.
 */
export function appendReward(ledger, input) {
  const event = createRewardEvent(input);
  if (!event.key) throw new Error('A reward event needs an idempotency key.');
  if (hasRewardKey(ledger, event.key)) return { ledger, event: null, duplicate: true };
  return {
    ledger: {
      ...ledger,
      events: [...ledger.events, event],
      lifetime: addToLifetime(ledger.lifetime, event),
    },
    event,
    duplicate: false,
  };
}

/** Appends several awards under one pass. Duplicates are dropped individually. */
export function appendRewards(ledger, inputs) {
  let next = ledger;
  const added = [];
  for (const input of inputs) {
    const result = appendReward(next, input);
    next = result.ledger;
    if (result.event) added.push(result.event);
  }
  return { ledger: next, events: added };
}

/**
 * Cancels an award by appending its negation. The original stays visible in the
 * history: "earned, then undone" is the truth, and hiding it would make the balance
 * unexplainable from the events that produced it.
 */
export function reverseReward(ledger, eventId) {
  const original = ledger.events.find((event) => event.id === eventId);
  if (!original || original.reverses) return { ledger, event: null, reversed: false };
  const result = appendReward(ledger, {
    key: `rev:${original.id}`,
    source: original.source,
    xp: -original.xp,
    seeds: -original.seeds,
    localDay: original.localDay,
    ref: original.ref,
    reverses: original.id,
    note: `Undone: ${original.note}`.slice(0, 160),
  });
  return { ledger: result.ledger, event: result.event, reversed: !result.duplicate };
}

function addToLifetime(lifetime, event) {
  return {
    ...lifetime,
    // Clamped at zero: a reversal can only ever cancel an award that was made, so a
    // negative lifetime means the cache has drifted, not that XP was lost.
    xp: Math.max(0, lifetime.xp + event.xp),
    seeds: Math.max(0, lifetime.seeds + event.seeds),
  };
}

/** The truth, recomputed from events and rollups. The cache is checked against this. */
export function computeLifetime(ledger) {
  let xp = 0;
  let seeds = 0;
  for (const row of ledger.rollups) { xp += row.xp; seeds += row.seeds; }
  for (const event of ledger.events) { xp += event.xp; seeds += event.seeds; }
  return { xp: Math.max(0, xp), seeds: Math.max(0, seeds), seedsSpent: ledger.lifetime.seedsSpent };
}

/** Repairs the cached totals if they disagree with the ledger. Cheap and idempotent. */
export function reconcileLifetime(ledger) {
  const computed = computeLifetime(ledger);
  const current = ledger.lifetime;
  if (computed.xp === current.xp && computed.seeds === current.seeds) return ledger;
  return { ...ledger, lifetime: { ...current, ...computed } };
}

/** Spendable seeds: earned minus spent. Never negative. */
export function availableSeeds(ledger) {
  return Math.max(0, ledger.lifetime.seeds - ledger.lifetime.seedsSpent);
}

export function totalXp(ledger) {
  return ledger.lifetime.xp;
}

/** XP recorded for one local day, optionally from one source. Used by the daily caps. */
export function xpOnDay(ledger, localDay, source = null) {
  let total = 0;
  for (const event of ledger.events) {
    if (event.localDay !== localDay) continue;
    if (source && event.source !== source) continue;
    total += event.xp;
  }
  if (total === 0) {
    const row = ledger.rollups.find((r) => r.localDay === localDay);
    if (row) return source ? (row.bySource[source] ?? 0) : row.xp;
  }
  return Math.max(0, total);
}

/**
 * Compacts everything before `beforeLocalDay` into one row per day.
 *
 * Totals are preserved exactly, so the balance is unchanged by a rollup — the ledger
 * stays explorable for half a year and bounded forever.
 */
export function rollupLedger(ledger, beforeLocalDay) {
  const stale = ledger.events.filter((event) => event.localDay < beforeLocalDay);
  if (stale.length === 0) return ledger;

  const byDay = new Map();
  for (const row of ledger.rollups) byDay.set(row.localDay, { ...row, bySource: { ...row.bySource } });
  for (const event of stale) {
    const row = byDay.get(event.localDay) ?? { localDay: event.localDay, xp: 0, seeds: 0, bySource: {} };
    row.xp += event.xp;
    row.seeds += event.seeds;
    row.bySource[event.source] = (row.bySource[event.source] ?? 0) + event.xp;
    byDay.set(event.localDay, row);
  }

  return {
    ...ledger,
    events: ledger.events.filter((event) => event.localDay >= beforeLocalDay),
    rollups: [...byDay.values()].sort((a, b) => (a.localDay < b.localDay ? -1 : 1)),
  };
}
