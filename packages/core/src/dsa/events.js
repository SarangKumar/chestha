import { newId } from '../ids.js';
import { todayISO } from '../dates.js';

/**
 * One event stream per workspace, covering three kinds of thing that happen to a
 * question. Keeping revisions in the same stream is what makes "a revision is not
 * a solve" structural rather than a convention someone has to remember.
 */
export const EVENT_KINDS = ['solve', 'attempt', 'revision'];

export const CONFIDENCE_LABELS = {
  1: 'Could not do it',
  2: 'Needed a hint',
  3: 'Got it, with effort',
  4: 'Could teach it',
};

export function createEvent(input = {}) {
  const kind = EVENT_KINDS.includes(input.kind) ? input.kind : 'solve';
  const confidence = [1, 2, 3, 4].includes(Number(input.confidence)) ? Number(input.confidence) : null;
  return {
    id: newId('ev'),
    slug: String(input.slug ?? '').trim(),
    kind,
    at: validInstant(input.at) ?? new Date().toISOString(),
    assisted: input.assisted === true,
    confidence,
    notes: String(input.notes ?? ''),
  };
}

function validInstant(value) {
  if (typeof value !== 'string') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** An event's instant grouped into the local calendar day it fell in. */
export function eventLocalDay(event) {
  const d = new Date(event.at);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function eventsFor(events, slug) {
  return events.filter((e) => e.slug === slug).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

export function byDate(events) {
  return [...events].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** Progress is derived from events and is monotonic; it is never set directly. */
export function deriveProgress(questionEvents) {
  if (questionEvents.some((e) => e.kind === 'solve')) return 'solved';
  if (questionEvents.some((e) => e.kind === 'attempt' || e.kind === 'revision')) return 'attempted';
  return 'not-started';
}

/**
 * Mastery is explainable in one sentence rather than scored: confidence 4 on the
 * two most recent rated touches, at least one of which was a revision.
 */
export function deriveMastery(questionEvents) {
  const rated = questionEvents.filter((e) => e.confidence !== null);
  if (rated.length < 2) return false;
  const recent = rated.slice(-2);
  const allConfident = recent.every((e) => e.confidence === 4 && !e.assisted);
  const includesRevision = recent.some((e) => e.kind === 'revision');
  return allConfident && includesRevision;
}

export function solveEvents(questionEvents) {
  return questionEvents.filter((e) => e.kind === 'solve');
}

export function firstSolveAt(questionEvents) {
  const solves = solveEvents(questionEvents);
  return solves.length ? solves[0].at : null;
}

export function lastSolveAt(questionEvents) {
  const solves = solveEvents(questionEvents);
  return solves.length ? solves[solves.length - 1].at : null;
}

/** A question solved five times is one unique question and five events. */
export function uniqueSolvedSlugs(events) {
  return new Set(events.filter((e) => e.kind === 'solve').map((e) => e.slug));
}

export function totalSolveEvents(events) {
  return events.filter((e) => e.kind === 'solve').length;
}

/**
 * Imported activity is deduplicated per question, per kind, per local day, so
 * re-importing the same export is a no-op and manual history is never replaced.
 */
export function dedupeKey(event) {
  return `${event.slug}|${event.kind}|${eventLocalDay(event)}`;
}

export function mergeEvents(existing, incoming) {
  const seen = new Set(existing.map(dedupeKey));
  const added = [];
  let skipped = 0;
  for (const raw of incoming) {
    const event = raw.id ? raw : createEvent(raw);
    if (!event.slug) { skipped += 1; continue; }
    const key = dedupeKey(event);
    if (seen.has(key)) { skipped += 1; continue; }
    seen.add(key);
    added.push(event);
  }
  return { merged: [...existing, ...added], added: added.length, skipped };
}
