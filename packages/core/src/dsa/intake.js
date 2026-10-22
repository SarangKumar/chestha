import { extractSlug, splitPastedInput, titleGuessFromSlug } from './identity.js';
import { hasMembership } from './lists.js';

/**
 * Turns pasted input into a reviewable plan before anything is written. Users
 * paste lists, not single URLs, so each line gets its own outcome and the whole
 * batch is applied only once they confirm.
 *
 * Outcomes: `matched` (already in the library), `new` (a record will be created),
 * `already` (already in this list), `duplicate` (repeated in the paste itself),
 * `rejected` (with a specific reason).
 */
export function planIntake(text, { questions = [], memberships = [], listId = null } = {}) {
  const known = new Map(questions.map((q) => [q.slug, q]));
  const seen = new Set();
  const rows = [];

  for (const line of splitPastedInput(text)) {
    const found = extractSlug(line);
    if (!found.ok) {
      rows.push({ input: line, outcome: 'rejected', reason: found.reason });
      continue;
    }

    const { slug } = found;
    if (seen.has(slug)) {
      rows.push({ input: line, slug, outcome: 'duplicate', reason: 'Repeated in this paste.' });
      continue;
    }
    seen.add(slug);

    const existing = known.get(slug);
    if (listId && hasMembership(memberships, listId, slug)) {
      rows.push({
        input: line, slug, outcome: 'already',
        title: existing?.title ?? titleGuessFromSlug(slug),
        reason: 'Already in this list.',
      });
      continue;
    }

    rows.push({
      input: line,
      slug,
      outcome: existing ? 'matched' : 'new',
      title: existing?.title ?? titleGuessFromSlug(slug),
      needsMetadata: !existing || (!existing.difficulty && existing.topics.length === 0),
    });
  }

  return {
    rows,
    counts: {
      matched: rows.filter((r) => r.outcome === 'matched').length,
      new: rows.filter((r) => r.outcome === 'new').length,
      already: rows.filter((r) => r.outcome === 'already').length,
      duplicate: rows.filter((r) => r.outcome === 'duplicate').length,
      rejected: rows.filter((r) => r.outcome === 'rejected').length,
    },
    /** Slugs that will actually be added to the list. */
    actionable: rows.filter((r) => r.outcome === 'matched' || r.outcome === 'new').map((r) => r.slug),
  };
}

export const INTAKE_LABELS = {
  matched: 'In library',
  new: 'Will be created',
  already: 'Already in list',
  duplicate: 'Duplicate line',
  rejected: 'Not added',
};
