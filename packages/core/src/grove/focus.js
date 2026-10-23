import { newId } from '../ids.js';
import { todayISO } from '../dates.js';
import { PLANT_STAGES } from './schema.js';

/**
 * Focus sessions.
 *
 * Elapsed time is **always derived from timestamps**, never accumulated by a ticking
 * counter. A render tick only re-renders. That is what makes a suspended tab, a
 * throttled timer, a sleeping laptop and a browser restart non-events: on reopen the
 * same arithmetic over the same stored instants produces the same answer.
 *
 * Eligible time is elapsed minus paused, capped at the planned duration — leaving a
 * finished timer running cannot earn more than it promised. Idle is deliberately NOT
 * subtracted: declaring a session is the user saying this time counts, and they may be
 * reading paper or thinking. Elapsed time is not attention, and the UI says so.
 */

/** How long a session may sit unfinished before it is written off rather than paid. */
export const ABANDON_AFTER_MS = 12 * 60 * 60 * 1000;

const ms = (minutes) => minutes * 60 * 1000;

export function createSession(input = {}) {
  return {
    id: newId('fs'),
    startedAt: input.startedAt ?? new Date().toISOString(),
    plannedMinutes: Math.min(180, Math.max(1, Math.round(Number(input.plannedMinutes) || 25))),
    taskId: input.taskId ?? null,
    pauses: [],
    endedAt: null,
    outcome: 'running',
    plantInstanceId: input.plantInstanceId ?? null,
  };
}

export function isPaused(session) {
  const last = session.pauses[session.pauses.length - 1];
  return Boolean(last && !last.resumedAt);
}

export function pauseSession(session, at = new Date().toISOString()) {
  if (session.endedAt || isPaused(session)) return session;
  return { ...session, pauses: [...session.pauses, { pausedAt: at, resumedAt: null }] };
}

export function resumeSession(session, at = new Date().toISOString()) {
  if (session.endedAt || !isPaused(session)) return session;
  const pauses = session.pauses.slice(0, -1);
  return { ...session, pauses: [...pauses, { ...session.pauses[session.pauses.length - 1], resumedAt: at }] };
}

/** Time spent paused, counting an open pause up to `now`. */
export function pausedMs(session, now = Date.now()) {
  let total = 0;
  for (const pause of session.pauses) {
    const from = Date.parse(pause.pausedAt);
    const to = pause.resumedAt ? Date.parse(pause.resumedAt) : now;
    if (Number.isFinite(from) && Number.isFinite(to) && to > from) total += to - from;
  }
  return total;
}

export function elapsedMs(session, now = Date.now()) {
  const end = session.endedAt ? Date.parse(session.endedAt) : now;
  return Math.max(0, end - Date.parse(session.startedAt));
}

/** Elapsed minus paused, never more than was planned. */
export function eligibleMs(session, now = Date.now()) {
  const raw = elapsedMs(session, now) - pausedMs(session, now);
  return Math.min(ms(session.plannedMinutes), Math.max(0, raw));
}

export function eligibleMinutes(session, now = Date.now()) {
  return Math.floor(eligibleMs(session, now) / 60000);
}

/** 0 → 1. Used for the ring, the countdown and the plant's growth. */
export function sessionProgress(session, now = Date.now()) {
  return Math.min(1, eligibleMs(session, now) / ms(session.plannedMinutes));
}

export function remainingMs(session, now = Date.now()) {
  return Math.max(0, ms(session.plannedMinutes) - eligibleMs(session, now));
}

/** The instant a session reaches its planned duration, given the pauses so far. */
export function plannedEndAt(session, now = Date.now()) {
  return Date.parse(session.startedAt) + ms(session.plannedMinutes) + pausedMs(session, now);
}

export function stageForProgress(progress) {
  if (progress >= 1) return PLANT_STAGES[3];
  if (progress >= 0.6) return PLANT_STAGES[2];
  if (progress >= 0.25) return PLANT_STAGES[1];
  return PLANT_STAGES[0];
}

export function isComplete(session, now = Date.now()) {
  return eligibleMs(session, now) >= ms(session.plannedMinutes);
}

/**
 * Ends a session. `outcome` is derived, never asserted by the caller: a session that
 * reached its planned duration completed, whatever button was pressed.
 */
export function endSession(session, { at = new Date().toISOString(), outcome = null } = {}) {
  if (session.endedAt) return session;
  const now = Date.parse(at);
  const complete = isComplete(session, now);
  return {
    ...session,
    // An open pause is closed at the same instant, so paused time cannot keep growing
    // after the session is over.
    pauses: isPaused(session)
      ? [...session.pauses.slice(0, -1), { ...session.pauses[session.pauses.length - 1], resumedAt: at }]
      : session.pauses,
    endedAt: at,
    outcome: outcome ?? (complete ? 'completed' : 'ended-early'),
  };
}

/**
 * Brings a session found still running back to the present.
 *
 * Forgiving by design: a session whose tab was closed completes at the moment it would
 * have completed, not at the moment it was last seen. The extension cannot tell "shut
 * the laptop and kept working" from "wandered off", and the product would rather be
 * generous than wrong in the direction that punishes. Past the abandonment window that
 * generosity stops: a session left open overnight is written off with the time it had
 * genuinely earned, and never the completion bonus.
 *
 * @returns the same session when nothing needed to change, so a caller can skip a write.
 */
export function recoverSession(session, now = Date.now()) {
  if (!session || session.endedAt || session.outcome !== 'running') return session;

  if (isComplete(session, now)) {
    const endedAt = new Date(plannedEndAt(session, now)).toISOString();
    return { ...endSession(session, { at: endedAt }), outcome: 'recovered' };
  }
  if (now - Date.parse(session.startedAt) > ms(session.plannedMinutes) + ABANDON_AFTER_MS) {
    return endSession(session, { at: new Date(now).toISOString(), outcome: 'abandoned' });
  }
  return session;
}

/**
 * What a finished session paid. Two separate events, two separate keys: the time is
 * earned by sitting there, the bonus by finishing, and the history should be able to
 * say which was which.
 *
 * `abandoned` earns its time but never the bonus — the planned duration was reached
 * only by a clock, not by a person.
 */
export function focusRewards(settings, session) {
  if (!session.endedAt) return [];
  const { xpPerMinute, completionBonusPct, maxEligibleMinutes } = settings.focus;
  const minutes = Math.min(maxEligibleMinutes, eligibleMinutes(session, Date.parse(session.endedAt)));
  const localDay = todayISO(new Date(session.endedAt));
  const completed = session.outcome === 'completed' || session.outcome === 'recovered';
  const xp = minutes * xpPerMinute;
  const seeds = (completed ? 1 : 0) + Math.floor(minutes / 30);

  const rewards = [];
  if (xp > 0 || seeds > 0) {
    rewards.push({
      key: `focus:${session.id}:time`,
      source: 'focus',
      xp,
      seeds,
      localDay,
      ref: { sessionId: session.id, part: 'time' },
      note: `${minutes} min focus session`,
    });
  }
  const bonus = completed ? Math.round((xp * completionBonusPct) / 100) : 0;
  if (bonus > 0) {
    rewards.push({
      key: `focus:${session.id}:bonus`,
      source: 'focus',
      xp: bonus,
      seeds: 0,
      localDay,
      ref: { sessionId: session.id, part: 'bonus' },
      note: 'Session completed in full',
    });
  }
  return rewards;
}
