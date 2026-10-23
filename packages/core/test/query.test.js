import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_FILTERS, GROUPINGS, QUESTION_SORTS, buildRows, createEvent, createMembership,
  createQuestion, createSchedule, difficultyProgress, filterRows, groupRows,
  hasActiveFilters, listProgress, sheetShortLabel, sortRows,
} from '../src/index.js';

const TODAY = '2026-10-23';
const at = (day, hour = 9) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`).toISOString();

const q = (slug, difficulty, topics, paidOnly = false) =>
  createQuestion({ slug, title: slug.replace(/-/g, ' '), difficulty, topics, paidOnly });

// A small library with deliberate overlap, so filter composition is observable.
function fixture() {
  const questions = [
    q('two-sum', 'Easy', ['Array', 'Hash Table']),
    q('course-schedule', 'Medium', ['Graph', 'Topological Sort']),
    q('word-ladder', 'Hard', ['Graph', 'BFS']),
    q('median-arrays', 'Hard', ['Array', 'Binary Search'], true),
    q('valid-anagram', 'Easy', ['Hash Table']),
  ];
  const curatedMemberships = [
    createMembership('blind-75', 'two-sum'),
    createMembership('neetcode-150', 'two-sum'),
    createMembership('grind-75', 'two-sum'),          // blind family again
    createMembership('blind-75', 'course-schedule'),
    createMembership('neetcode-150', 'word-ladder'),
  ];
  const events = [
    createEvent({ slug: 'two-sum', kind: 'solve', at: at('2026-10-01'), confidence: 4 }),
    createEvent({ slug: 'course-schedule', kind: 'solve', at: at('2026-10-20'), confidence: 2, assisted: true }),
    createEvent({ slug: 'word-ladder', kind: 'attempt', at: at('2026-10-22') }),
  ];
  const schedules = {
    'two-sum': createSchedule({ rung: 1, nextDue: '2026-12-01' }),
    'course-schedule': createSchedule({ rung: 0, nextDue: '2026-10-10' }), // overdue
  };
  const questionState = { 'word-ladder': { bookmarked: true, priority: 2, notes: '' } };
  return { questions, events, schedules, questionState, curatedMemberships };
}

const rows = () => buildRows(fixture(), TODAY);
const slugs = (list) => list.map((r) => r.question.slug);

test('rows carry the question, its derived state and its list frequency', () => {
  const built = rows();
  assert.equal(built.length, 5);
  const twoSum = built.find((r) => r.question.slug === 'two-sum');
  assert.equal(twoSum.state.progress, 'solved');
  assert.equal(twoSum.frequency.lists, 3);
  assert.equal(twoSum.frequency.families, 2, 'grind and blind are one family');
});

test('an unfiltered view returns everything', () => {
  assert.equal(filterRows(rows(), EMPTY_FILTERS).length, 5);
  assert.equal(hasActiveFilters(EMPTY_FILTERS), false);
  assert.equal(hasActiveFilters({ ...EMPTY_FILTERS, difficulty: 'Hard' }), true);
});

test('each filter narrows on its own', () => {
  const all = rows();
  assert.deepEqual(slugs(filterRows(all, { difficulty: 'Hard' })).sort(), ['median-arrays', 'word-ladder']);
  assert.deepEqual(slugs(filterRows(all, { topic: 'graph' })).sort(), ['course-schedule', 'word-ladder']);
  assert.deepEqual(slugs(filterRows(all, { curatedList: 'blind-75' })).sort(), ['course-schedule', 'two-sum']);
  assert.deepEqual(slugs(filterRows(all, { status: 'solved' })), ['two-sum']);
  assert.deepEqual(slugs(filterRows(all, { bookmarked: true })), ['word-ladder']);
  assert.deepEqual(slugs(filterRows(all, { premium: 'only' })), ['median-arrays']);
  assert.equal(filterRows(all, { premium: 'exclude' }).length, 4);
  assert.deepEqual(slugs(filterRows(all, { query: 'anagram' })), ['valid-anagram']);
  assert.deepEqual(slugs(filterRows(all, { minFamilies: 2 })), ['two-sum']);
});

test('revision filters distinguish due, overdue and unscheduled', () => {
  const all = rows();
  assert.deepEqual(slugs(filterRows(all, { revision: 'overdue' })), ['course-schedule']);
  assert.deepEqual(slugs(filterRows(all, { revision: 'scheduled' })), ['two-sum']);
  assert.deepEqual(slugs(filterRows(all, { revision: 'actionable' })), ['course-schedule']);
  assert.equal(filterRows(all, { revision: 'none' }).length, 3, 'the three with no schedule');
});

test('"needs more practice" means trouble, not merely unsolved', () => {
  const practice = filterRows(rows(), { needsPractice: true });
  assert.deepEqual(slugs(practice), ['course-schedule'], 'low confidence and assisted');
  assert.ok(!slugs(practice).includes('median-arrays'), 'an untouched question is not "needs practice"');
});

test('filters compose — the worked example from the spec', () => {
  // Medium-or-harder graph questions, unsolved, in at least one curated list.
  const result = filterRows(rows(), { topic: 'graph', status: 'attempted', curatedList: 'neetcode-150' });
  assert.deepEqual(slugs(result), ['word-ladder']);

  // A combination that nothing satisfies returns empty rather than ignoring one.
  assert.deepEqual(filterRows(rows(), { difficulty: 'Easy', topic: 'graph' }), []);
});

test('a personal list filter reads personal memberships', () => {
  const memberships = [createMembership('pl_1', 'median-arrays'), createMembership('pl_1', 'two-sum')];
  const result = filterRows(rows(), { personalList: 'pl_1' }, { personalMemberships: memberships });
  assert.deepEqual(slugs(result).sort(), ['median-arrays', 'two-sum']);
});

test('every sort is total and deterministic', () => {
  const all = rows();
  for (const key of Object.keys(QUESTION_SORTS)) {
    const once = slugs(sortRows(all, key));
    const twice = slugs(sortRows([...all].reverse(), key));
    assert.equal(once.length, 5, `${key} keeps every row`);
    assert.deepEqual(once, twice, `${key} does not depend on input order`);
  }
});

test('sorts order by the thing they claim to', () => {
  const all = rows();
  assert.equal(slugs(sortRows(all, 'frequency'))[0], 'two-sum', 'most families first');
  assert.equal(slugs(sortRows(all, 'difficulty'))[0], 'two-sum', 'Easy first');
  assert.deepEqual(slugs(sortRows(all, 'title')), ['course schedule', 'median arrays', 'two sum', 'valid anagram', 'word ladder'].map((t) => t.replace(/ /g, '-')));
  assert.equal(slugs(sortRows(all, 'priority'))[0], 'word-ladder', 'highest user priority first');
  assert.equal(slugs(sortRows(all, 'nextRevision'))[0], 'course-schedule', 'soonest due first');
  assert.equal(slugs(sortRows(all, 'lastSolved'))[0], 'course-schedule', 'most recent solve first');
});

test('never-solved and unscheduled questions sink rather than sorting as oldest', () => {
  const all = rows();
  const bySolve = slugs(sortRows(all, 'lastSolved'));
  assert.ok(bySolve.indexOf('median-arrays') > bySolve.indexOf('two-sum'), 'unsolved is last');
  const byRevision = slugs(sortRows(all, 'nextRevision'));
  assert.ok(byRevision.indexOf('word-ladder') > byRevision.indexOf('two-sum'), 'unscheduled is last');
});

test('grouping by difficulty is ordered easy to hard and partitions the rows', () => {
  const groups = groupRows(rows(), 'difficulty');
  assert.deepEqual(groups.map((g) => g.key), ['Easy', 'Medium', 'Hard']);
  assert.equal(groups.reduce((n, g) => n + g.rows.length, 0), 5, 'every row appears exactly once');
});

test('grouping by topic lists a question under each of its topics', () => {
  const groups = groupRows(rows(), 'topic');
  const graph = groups.find((g) => g.key === 'graph');
  assert.deepEqual(slugs(graph.rows).sort(), ['course-schedule', 'word-ladder']);
  const array = groups.find((g) => g.key === 'array');
  assert.ok(slugs(array.rows).includes('two-sum'), 'two-sum is under Array as well as Hash Table');
  assert.ok(groups.reduce((n, g) => n + g.rows.length, 0) > 5, 'multi-topic questions appear more than once, by design');
});

test('grouping by curated list uses list names and flags the ungrouped', () => {
  const groups = groupRows(rows(), 'list', { lists: [{ id: 'blind-75', name: 'Blind 75' }] });
  assert.equal(groups.find((g) => g.key === 'blind-75').label, 'Blind 75');
  assert.ok(groups.some((g) => g.key === 'none'), 'questions in no curated list are grouped too');
  assert.deepEqual(slugs(groups.find((g) => g.key === 'none').rows).sort(), ['median-arrays', 'valid-anagram']);
});

test('no grouping returns a single bucket, and every grouping key is labelled', () => {
  const flat = groupRows(rows(), 'none');
  assert.equal(flat.length, 1);
  assert.equal(flat[0].rows.length, 5);
  for (const key of Object.keys(GROUPINGS)) {
    assert.ok(GROUPINGS[key], `${key} has a label`);
    assert.doesNotThrow(() => groupRows(rows(), key, { lists: [] }));
  }
});

test('difficulty progress counts solved against available', () => {
  const progress = difficultyProgress(rows());
  assert.deepEqual(progress.Easy, { solved: 1, total: 2 });
  assert.deepEqual(progress.Medium, { solved: 1, total: 1 });
  assert.deepEqual(progress.Hard, { solved: 0, total: 2 });
});

test('list progress reflects shared solving state', () => {
  const progress = listProgress(rows(), [{ id: 'blind-75', name: 'Blind 75' }, { id: 'neetcode-150', name: 'NeetCode 150' }]);
  const blind = progress.find((p) => p.list.id === 'blind-75');
  assert.equal(blind.total, 2);
  // Both of its questions have a solve event. course-schedule's *status* is
  // "needs revision" because it is overdue, but its progress axis is still
  // solved — which is the separation these three axes exist to keep.
  assert.equal(blind.solved, 2);

  const neetcode = progress.find((p) => p.list.id === 'neetcode-150');
  assert.equal(neetcode.total, 2, 'two-sum and word-ladder');
  assert.equal(neetcode.solved, 1, 'word-ladder was only attempted');
});

test('premium status survives into the question record', () => {
  const premium = rows().find((r) => r.question.slug === 'median-arrays');
  assert.equal(premium.question.paidOnly, true, 'so the row can show a premium marker');
  assert.equal(rows().find((r) => r.question.slug === 'two-sum').question.paidOnly, false);
});

// ─── Grouping must not contradict an active filter ───────────────────────────

test('grouping by sheet respects an active sheet filter', () => {
  const all = rows();
  const filtered = filterRows(all, { curatedList: 'blind-75' });

  // Without the restriction, these questions also belong to neetcode-150 and
  // grind-75, so grouping emitted a group for each — which reads as though the
  // sheet filter had done nothing.
  const unrestricted = groupRows(filtered, 'list', { lists: [] });
  assert.ok(unrestricted.length > 1, 'the old behaviour spanned several sheets');

  const restricted = groupRows(filtered, 'list', {
    lists: [{ id: 'blind-75', name: 'Blind 75' }],
    onlyList: 'blind-75',
  });
  assert.equal(restricted.length, 1, 'only the filtered sheet is grouped');
  assert.equal(restricted[0].label, 'Blind 75');
  assert.equal(restricted[0].rows.length, filtered.length, 'and it holds every filtered row');
});

test('grouping by topic respects an active topic filter', () => {
  const filtered = filterRows(rows(), { topic: 'graph' });
  const unrestricted = groupRows(filtered, 'topic', {});
  assert.ok(unrestricted.length > 1, 'those questions carry other topics too');

  const restricted = groupRows(filtered, 'topic', { onlyTopic: 'graph' });
  assert.equal(restricted.length, 1);
  assert.equal(restricted[0].key, 'graph');
  assert.equal(restricted[0].rows.length, 2);
});

test('with no filter, grouping still shows every sheet and topic a question is in', () => {
  const all = rows();
  const bySheet = groupRows(all, 'list', { lists: [] });
  assert.ok(bySheet.length > 1, 'multi-sheet membership is still visible');
  const byTopic = groupRows(all, 'topic', {});
  assert.ok(byTopic.some((g) => g.key === 'graph') && byTopic.some((g) => g.key === 'array'));
});

test('sheet labels are short enough to sit in a row', () => {
  assert.equal(sheetShortLabel('blind-75', 'Blind 75'), 'Blind 75');
  assert.equal(sheetShortLabel('neetcode-150', 'NeetCode 150'), 'NC 150');
  assert.equal(sheetShortLabel('leetcode-top-interview-150', 'LeetCode Top Interview 150'), 'Top 150');
  // An unknown sheet still gets something compact rather than its full name.
  assert.equal(sheetShortLabel('company-x-40', 'Company X 40'), 'CX 40');
  assert.ok(sheetShortLabel('mystery', ''), 'never returns empty');
});

test('a question reports every sheet it belongs to, not just a count', () => {
  const twoSum = rows().find((r) => r.question.slug === 'two-sum');
  assert.deepEqual(twoSum.frequency.listIds.sort(), ['blind-75', 'grind-75', 'neetcode-150']);
  assert.equal(twoSum.frequency.lists, 3);
  assert.equal(twoSum.frequency.families, 2, 'so the row can show both numbers honestly');
});
