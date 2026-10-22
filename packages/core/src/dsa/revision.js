import { addDays, compareISO, todayISO } from '../dates.js';
import { eventLocalDay } from './events.js';

/**
 * A confidence-keyed interval ladder, deliberately not SM-2 or FSRS: a DSA
 * problem is revised a handful of times in its life, which is far too few
 * reviews to feed a parameter-fitting model. Four rungs, explainable in a
 * sentence, and every date the user can override.
 */
export const LADDER_DAYS = [3, 7, 21, 60];

export const UNSCHEDULED_RUNG = -1;

/**
 * Confidence 4 advances a rung, 3 holds, 2 drops one, 1 returns to the first.
 * An assisted touch never advances, whatever the confidence.
 */
export function nextRung(currentRung, { confidence = 3, assisted = false } = {}) {
  const start = currentRung < 0 ? 0 : currentRung;
  const last = LADDER_DAYS.length - 1;
  if (confidence === 1) return 0;
  if (confidence === 2) return Math.max(0, start - 1);
  if (assisted) return start;
  if (confidence === 4) return Math.min(last, start + 1);
  return start;
}

export function intervalForRung(rung) {
  return LADDER_DAYS[Math.min(Math.max(0, rung), LADDER_DAYS.length - 1)];
}

export function createSchedule(input = {}) {
  return {
    rung: Number.isInteger(input.rung) ? input.rung : UNSCHEDULED_RUNG,
    nextDue: typeof input.nextDue === 'string' ? input.nextDue : null,
    overridden: input.overridden === true,
    completed: Number.isInteger(input.completed) ? input.completed : 0,
    lapses: Number.isInteger(input.lapses) ? input.lapses : 0,
  };
}

/** Applies a solve or revision outcome to a schedule. Suggestion only. */
export function scheduleAfterEvent(schedule, event) {
  const current = schedule ?? createSchedule();
  const rung = nextRung(current.rung, { confidence: event.confidence ?? 3, assisted: event.assisted });
  const from = eventLocalDay(event) ?? todayISO();
  const droppedBack = current.rung >= 0 && rung < current.rung;
  return {
    ...current,
    rung,
    nextDue: addDays(from, intervalForRung(rung)),
    overridden: false,
    completed: current.completed + (event.kind === 'revision' ? 1 : 0),
    lapses: current.lapses + (droppedBack ? 1 : 0),
  };
}

export function withManualDate(schedule, iso) {
  const current = schedule ?? createSchedule();
  return { ...current, nextDue: iso, overridden: true, rung: current.rung < 0 ? 0 : current.rung };
}

export function clearSchedule(schedule) {
  const current = schedule ?? createSchedule();
  return { ...current, nextDue: null, overridden: false };
}

export function revisionState(schedule, today = todayISO()) {
  if (!schedule || !schedule.nextDue) return 'none';
  const cmp = compareISO(schedule.nextDue, today);
  if (cmp < 0) return 'overdue';
  if (cmp === 0) return 'due';
  return 'scheduled';
}

export function isActionableToday(schedule, today = todayISO()) {
  const state = revisionState(schedule, today);
  return state === 'due' || state === 'overdue';
}

/** Plain-language explanation; the schedule is never presented as a prediction. */
export function explainSchedule(schedule) {
  if (!schedule || !schedule.nextDue) return 'Not scheduled for revision.';
  if (schedule.overridden) return `You set this date yourself (${schedule.nextDue}).`;
  const days = intervalForRung(schedule.rung);
  return `Suggested ${days} days after your last touch, based on the confidence you recorded.`;
}
