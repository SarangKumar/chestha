import { todayISO } from '../dates.js';
import { deriveMastery, deriveProgress, eventsFor } from './events.js';
import { revisionState } from './revision.js';

/**
 * The product asks for five statuses, and also asks that solving, revision and
 * mastery be kept separate. A single enum cannot hold all three — a question is
 * routinely solved, due for revision and low-confidence at once. So three
 * independent axes are stored, and the five labels are derived for display and
 * filtering from those axes.
 */
export const STATUSES = ['not-started', 'attempted', 'solved', 'needs-revision', 'mastered'];

export const STATUS_LABELS = {
  'not-started': 'Not started',
  attempted: 'Attempted',
  solved: 'Solved',
  'needs-revision': 'Needs revision',
  mastered: 'Mastered',
};

/** @returns {{ progress, revision, mastered, status, confidence }} */
export function questionState(slug, events, schedules, today = todayISO()) {
  const own = eventsFor(events, slug);
  const progress = deriveProgress(own);
  const mastered = deriveMastery(own);
  const revision = revisionState(schedules?.[slug], today);
  const rated = own.filter((e) => e.confidence !== null);
  return {
    progress,
    revision,
    mastered,
    confidence: rated.length ? rated[rated.length - 1].confidence : null,
    status: deriveStatus({ progress, revision, mastered }),
    events: own,
  };
}

/**
 * Precedence is by what the user should act on: something due outranks a badge
 * saying it is mastered.
 */
export function deriveStatus({ progress, revision, mastered }) {
  if (revision === 'due' || revision === 'overdue') return 'needs-revision';
  if (mastered) return 'mastered';
  return progress;
}
