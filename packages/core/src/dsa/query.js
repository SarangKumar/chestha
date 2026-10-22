import { todayISO } from '../dates.js';
import { matchesQuestionQuery, topicKey } from './questions.js';
import { listFrequency } from './lists.js';
import { questionState } from './status.js';

/**
 * Filtering, sorting and grouping for the question library. Kept out of the
 * component so the combinations are testable: the point of this screen is that
 * filters compose, and that is easy to get subtly wrong in JSX.
 */

export const QUESTION_SORTS = {
  frequency: 'List overlap',
  difficulty: 'Difficulty',
  title: 'Title',
  topic: 'Topic',
  status: 'Progress',
  lastSolved: 'Last solved',
  nextRevision: 'Next revision',
  priority: 'My priority',
};

export const GROUPINGS = {
  none: 'No grouping',
  difficulty: 'Difficulty',
  topic: 'Topic',
  list: 'Curated list',
  status: 'Progress',
};

export const REVISION_FILTERS = {
  all: 'Any revision state',
  due: 'Due today',
  overdue: 'Overdue',
  scheduled: 'Scheduled',
  none: 'Not scheduled',
  actionable: 'Due or overdue',
};

export const DIFFICULTY_RANK = { Easy: 0, Medium: 1, Hard: 2 };
const STATUS_RANK = { 'needs-revision': 0, attempted: 1, 'not-started': 2, solved: 3, mastered: 4 };

export const EMPTY_FILTERS = {
  query: '',
  difficulty: 'all',
  topic: 'all',
  curatedList: 'all',
  personalList: 'all',
  status: 'all',
  revision: 'all',
  minFamilies: 0,
  bookmarked: false,
  premium: 'all',      // all | only | exclude
  needsPractice: false,
};

export function hasActiveFilters(filters) {
  return Object.entries(EMPTY_FILTERS).some(([key, blank]) => filters[key] !== blank);
}

/**
 * Builds the row model once: a question, its derived state, and its list
 * frequency. Sorting and grouping both read from this, so they cannot disagree.
 */
export function buildRows({ questions, events, schedules, questionState: perQuestion = {}, curatedMemberships = [] }, today = todayISO()) {
  return questions.map((question) => ({
    question,
    state: questionState(question.slug, events, schedules, today),
    frequency: listFrequency(curatedMemberships, question.slug),
    user: perQuestion[question.slug] ?? { bookmarked: false, priority: 0, notes: '' },
    schedule: schedules?.[question.slug] ?? null,
  }));
}

export function filterRows(rows, filters, { personalMemberships = [] } = {}) {
  const f = { ...EMPTY_FILTERS, ...filters };
  const inPersonal = new Set(
    f.personalList === 'all' ? [] : personalMemberships.filter((m) => m.listId === f.personalList).map((m) => m.slug),
  );

  return rows.filter(({ question, state, frequency, user }) => {
    if (!matchesQuestionQuery(question, f.query)) return false;
    if (f.difficulty !== 'all' && question.difficulty !== f.difficulty) return false;
    if (f.topic !== 'all' && !question.topics.some((t) => topicKey(t) === f.topic)) return false;
    if (f.curatedList !== 'all' && !frequency.listIds.includes(f.curatedList)) return false;
    if (f.personalList !== 'all' && !inPersonal.has(question.slug)) return false;
    if (f.status !== 'all' && state.status !== f.status) return false;
    if (f.bookmarked && !user.bookmarked) return false;
    if (f.premium === 'only' && !question.paidOnly) return false;
    if (f.premium === 'exclude' && question.paidOnly) return false;
    if (Number(f.minFamilies) > 0 && frequency.families < Number(f.minFamilies)) return false;

    if (f.revision !== 'all') {
      const wanted = f.revision === 'actionable'
        ? ['due', 'overdue'].includes(state.revision)
        : state.revision === f.revision;
      if (!wanted) return false;
    }

    // "Needs more practice" is low confidence or a revision that lapsed — the
    // questions that have given this person trouble, not merely unsolved ones.
    if (f.needsPractice) {
      const lowConfidence = state.confidence !== null && state.confidence <= 2;
      const assisted = state.events.some((e) => e.assisted);
      if (!lowConfidence && !assisted) return false;
    }

    return true;
  });
}

export function sortRows(rows, sort = 'frequency') {
  const byTitle = (a, b) => a.question.title.localeCompare(b.question.title, undefined, { sensitivity: 'base' });
  const lastSolve = (row) => {
    const solves = row.state.events.filter((e) => e.kind === 'solve');
    return solves.length ? solves[solves.length - 1].at : null;
  };

  const comparators = {
    frequency: (a, b) => b.frequency.families - a.frequency.families || b.frequency.lists - a.frequency.lists || byTitle(a, b),
    difficulty: (a, b) => (DIFFICULTY_RANK[a.question.difficulty] ?? 9) - (DIFFICULTY_RANK[b.question.difficulty] ?? 9) || byTitle(a, b),
    title: byTitle,
    topic: (a, b) => (a.question.topics[0] ?? '~').localeCompare(b.question.topics[0] ?? '~') || byTitle(a, b),
    status: (a, b) => (STATUS_RANK[a.state.status] ?? 9) - (STATUS_RANK[b.state.status] ?? 9) || byTitle(a, b),
    // Never-solved sinks rather than sorting as "oldest".
    lastSolved: (a, b) => {
      const x = lastSolve(a); const y = lastSolve(b);
      if (x === y) return byTitle(a, b);
      if (!x) return 1;
      if (!y) return -1;
      return x < y ? 1 : -1;
    },
    nextRevision: (a, b) => {
      const x = a.schedule?.nextDue ?? null; const y = b.schedule?.nextDue ?? null;
      if (x === y) return byTitle(a, b);
      if (!x) return 1;
      if (!y) return -1;
      return x < y ? -1 : 1;
    },
    priority: (a, b) => (b.user.priority ?? 0) - (a.user.priority ?? 0) || byTitle(a, b),
  };

  return [...rows].sort(comparators[sort] ?? comparators.frequency);
}

/** @returns {Array<{ key: string, label: string, rows: Array }>} */
export function groupRows(rows, grouping, { lists = [] } = {}) {
  if (!grouping || grouping === 'none') return [{ key: 'all', label: '', rows }];

  const buckets = new Map();
  const push = (key, label, row) => {
    if (!buckets.has(key)) buckets.set(key, { key, label, rows: [] });
    buckets.get(key).rows.push(row);
  };

  for (const row of rows) {
    const { question, state, frequency } = row;
    if (grouping === 'difficulty') {
      push(question.difficulty ?? 'unknown', question.difficulty ?? 'No difficulty recorded', row);
    } else if (grouping === 'status') {
      push(state.status, state.status, row);
    } else if (grouping === 'topic') {
      // A question with several topics appears under each, which is what makes
      // "how am I doing on graphs" answerable.
      if (question.topics.length === 0) push('untagged', 'No topics recorded', row);
      else for (const topic of question.topics) push(topicKey(topic), topic, row);
    } else if (grouping === 'list') {
      if (frequency.listIds.length === 0) push('none', 'Not in a curated list', row);
      else for (const id of frequency.listIds) {
        push(id, lists.find((l) => l.id === id)?.name ?? id, row);
      }
    }
  }

  const ordered = [...buckets.values()];
  if (grouping === 'difficulty') {
    ordered.sort((a, b) => (DIFFICULTY_RANK[a.key] ?? 9) - (DIFFICULTY_RANK[b.key] ?? 9));
  } else if (grouping === 'status') {
    ordered.sort((a, b) => (STATUS_RANK[a.key] ?? 9) - (STATUS_RANK[b.key] ?? 9));
  } else {
    ordered.sort((a, b) => b.rows.length - a.rows.length || a.label.localeCompare(b.label));
  }
  return ordered;
}

/** Per-difficulty solved counts, for the progress panel. */
export function difficultyProgress(rows) {
  const out = { Easy: { solved: 0, total: 0 }, Medium: { solved: 0, total: 0 }, Hard: { solved: 0, total: 0 } };
  for (const { question, state } of rows) {
    const bucket = out[question.difficulty];
    if (!bucket) continue;
    bucket.total += 1;
    if (state.progress === 'solved') bucket.solved += 1;
  }
  return out;
}

export function listProgress(rows, lists) {
  return lists.map((list) => {
    const inList = rows.filter((r) => r.frequency.listIds.includes(list.id));
    return {
      list,
      total: inList.length,
      solved: inList.filter((r) => r.state.progress === 'solved').length,
    };
  });
}
