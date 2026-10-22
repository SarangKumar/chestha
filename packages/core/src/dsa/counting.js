import { todayISO } from '../dates.js';
import { eventLocalDay } from './events.js';

/**
 * The two daily targets read different event kinds, so a question cannot be
 * counted toward both and double-counting is structurally impossible.
 *
 *  - new: the local day of a question's FIRST solve event, counted once ever.
 *  - revision: each completed revision event, on the day it happened.
 *
 * An attempted-but-unsolved question counts toward neither. A question solved
 * twice in one day earns one new credit, not two.
 */
export function dailyProgress(events, day = todayISO()) {
  const firstSolveDay = new Map();
  for (const event of events) {
    if (event.kind !== 'solve') continue;
    const at = eventLocalDay(event);
    if (!at) continue;
    const seen = firstSolveDay.get(event.slug);
    if (!seen || at < seen) firstSolveDay.set(event.slug, at);
  }

  let newSolved = 0;
  for (const at of firstSolveDay.values()) if (at === day) newSolved += 1;

  const revisions = events.filter((e) => e.kind === 'revision' && eventLocalDay(e) === day);
  const attempts = events.filter((e) => e.kind === 'attempt' && eventLocalDay(e) === day);

  return {
    newSolved,
    revisionsDone: revisions.length,
    attempts: attempts.length,
    solveEvents: events.filter((e) => e.kind === 'solve' && eventLocalDay(e) === day).length,
  };
}

export function goalState(events, settings, day = todayISO()) {
  const progress = dailyProgress(events, day);
  return {
    ...progress,
    newTarget: settings.dailyNewTarget,
    revisionTarget: settings.dailyRevisionTarget,
    newMet: progress.newSolved >= settings.dailyNewTarget,
    revisionMet: progress.revisionsDone >= settings.dailyRevisionTarget,
  };
}

/** Activity per local day, for the analytics grid. Never invents missing days. */
export function activityByDay(events) {
  const map = new Map();
  for (const event of events) {
    const day = eventLocalDay(event);
    if (!day) continue;
    const row = map.get(day) ?? { day, solve: 0, attempt: 0, revision: 0 };
    row[event.kind] += 1;
    map.set(day, row);
  }
  return [...map.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
}
