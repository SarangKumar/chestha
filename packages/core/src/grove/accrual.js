import { todayISO } from '../dates.js';
import { LIMITS } from './schema.js';
import { matchRule } from './rules.js';
import { websiteRewards } from './thresholds.js';

/**
 * Turning observed time into credited time.
 *
 * The service worker observes; this decides. Everything here is pure, so the rules
 * that govern a day's XP can be tested without a browser, a tab or a clock.
 *
 * Two guards shape the whole module, and both fail in the same direction — recorded
 * time is never more than real active time:
 *
 *  - `MAX_TICK_MS` caps any single interval. A worker that slept for an hour with a
 *    tab open credits 150 seconds, not an hour. An unattended machine cannot farm XP.
 *  - Segment ids are remembered, so a re-drained inbox, a reload mid-write or a second
 *    tab cannot credit the same seconds twice.
 */

/** The service worker's heartbeat. */
export const HEARTBEAT_MS = 60_000;

/** The most one interval may credit: 2.5 heartbeats, so one missed beat still pays. */
export const MAX_TICK_MS = 150_000;

/**
 * Seconds to credit between two checkpoints.
 *
 * A clock moved backwards yields a negative interval, which credits nothing rather
 * than throwing or wrapping: a system clock change may shift which local day gets
 * credit, but can never fabricate time.
 */
export function creditableMs(lastSeenMs, nowMs) {
  const delta = nowMs - lastSeenMs;
  if (!Number.isFinite(delta) || delta <= 0) return 0;
  return Math.min(delta, MAX_TICK_MS);
}

/**
 * Splits an interval at local midnight so each part lands in the day it happened in.
 * Returns one part in the ordinary case.
 */
export function splitAtMidnight(startMs, endMs) {
  const parts = [];
  let cursor = startMs;
  while (cursor < endMs) {
    const date = new Date(cursor);
    const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
    const slice = Math.min(midnight, endMs);
    parts.push({ localDay: todayISO(new Date(cursor)), seconds: Math.round((slice - cursor) / 1000) });
    cursor = slice;
  }
  return parts.filter((part) => part.seconds > 0);
}

function emptyDay() {
  return { rules: {}, websiteXp: 0, taskXp: 0 };
}

function emptyRecord() {
  return { seconds: 0, awarded: [], focusCoveredSeconds: 0 };
}

/**
 * Folds observed segments into the time record and says what they earned.
 *
 * Segments are applied in the order they closed, so threshold crossings are
 * deterministic however they arrived. Nothing is written here — the caller persists
 * the returned record and appends the returned rewards in one pass, so a crash
 * between the two leaves the segments undrained and the next attempt simply repeats.
 *
 * @param segments {{id, host, localDay, seconds, closedAt, duringFocus}[]}
 * @returns {{ time, rewards, accepted: string[] }}
 */
export function applySegments(settings, time, segments) {
  const seen = new Set(time.seenSegments);
  const days = { ...time.days };
  const rewards = [];
  const accepted = [];

  const ordered = [...segments]
    .filter((segment) => segment && typeof segment === 'object' && typeof segment.id === 'string')
    .sort((a, b) => String(a.closedAt).localeCompare(String(b.closedAt)));

  for (const segment of ordered) {
    if (seen.has(segment.id)) continue;      // the idempotency guard, before anything else
    seen.add(segment.id);
    accepted.push(segment.id);

    const seconds = Math.max(0, Math.round(Number(segment.seconds) || 0));
    if (seconds === 0) continue;

    const rule = matchRule(settings.rules, segment.host);
    if (!rule) continue;                     // a host with no rule is not recorded at all

    const localDay = segment.localDay || todayISO();
    const day = days[localDay] ?? emptyDay();
    const previous = day.rules[rule.id] ?? emptyRecord();

    // Time inside a focus session is kept for the history but earns nothing: the
    // session is how that hour is paid for. One activity, one payment.
    if (segment.duringFocus && settings.focus.suspendWebsiteXp) {
      days[localDay] = {
        ...day,
        rules: {
          ...day.rules,
          [rule.id]: { ...previous, focusCoveredSeconds: previous.focusCoveredSeconds + seconds },
        },
      };
      continue;
    }

    // Non-productive rules are tracked for insight and never paid.
    const total = previous.seconds + seconds;
    if (!rule.productive) {
      days[localDay] = { ...day, rules: { ...day.rules, [rule.id]: { ...previous, seconds: total } } };
      continue;
    }

    const earned = websiteRewards({
      settings,
      rule,
      localDay,
      seconds: total,
      awarded: previous.awarded,
      dayWebsiteXp: day.websiteXp,
    });

    rewards.push(...earned.rewards);
    days[localDay] = {
      ...day,
      websiteXp: day.websiteXp + earned.xp,
      rules: { ...day.rules, [rule.id]: { ...previous, seconds: total, awarded: earned.awarded } },
    };
  }

  return {
    time: { days: pruneDays(days), seenSegments: [...seen].slice(-LIMITS.seenSegments) },
    rewards,
    accepted,
  };
}

/** Keeps the record bounded without touching the days a user might still look at. */
function pruneDays(days) {
  const keys = Object.keys(days).sort().slice(-LIMITS.days);
  return Object.fromEntries(keys.map((key) => [key, days[key]]));
}

/** Seconds recorded for one rule on one day, paid or focus-covered. */
export function secondsFor(time, localDay, ruleId) {
  const record = time.days[localDay]?.rules[ruleId];
  if (!record) return { seconds: 0, focusCoveredSeconds: 0 };
  return { seconds: record.seconds, focusCoveredSeconds: record.focusCoveredSeconds };
}

/** Total tracked seconds across every rule on a day. */
export function totalSecondsOn(time, localDay) {
  const day = time.days[localDay];
  if (!day) return 0;
  return Object.values(day.rules).reduce((sum, r) => sum + r.seconds + r.focusCoveredSeconds, 0);
}

/** Forgets every recorded second without touching the ledger, tasks or the garden. */
export function clearWebsiteTime() {
  return { days: {}, seenSegments: [] };
}
