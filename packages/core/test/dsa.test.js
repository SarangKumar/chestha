import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessTopic, buildExport, createEvent, createList, createMembership, createQuestion,
  createSchedule, createStore, dailyProgress, deriveMastery, deriveProgress,
  diffCuratedMemberships, eventsFor, extractSlug, hasMembership, listFrequency,
  mergeEvents, nextRung, parseImport, problemUrl, questionState, removeList,
  removeMembership, revisionState, scheduleAfterEvent, topicStats, totalSolveEvents,
  uniqueSolvedSlugs, withManualDate,
} from '../src/index.js';

const TODAY = '2026-10-23';
const at = (day, hour = 9) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`).toISOString();

// ─── One canonical question across many lists ────────────────────────────────

test('one question in three lists stays one record with one shared history', () => {
  const q = createQuestion({ url: 'https://leetcode.com/problems/two-sum/', difficulty: 'Easy', topics: ['Array'] });
  const memberships = [
    createMembership('blind-75', q.slug),
    createMembership('neetcode-150', q.slug),
    createMembership('pl_a9f', q.slug),
  ];
  const events = [createEvent({ slug: q.slug, kind: 'solve', at: at(TODAY) })];

  assert.equal(memberships.filter((m) => m.slug === q.slug).length, 3);
  assert.equal(new Set(memberships.map((m) => m.slug)).size, 1, 'one question record');
  // Progress is read from the event stream, so all three lists see the same thing.
  for (const listId of ['blind-75', 'neetcode-150', 'pl_a9f']) {
    const inList = memberships.filter((m) => m.listId === listId).map((m) => m.slug);
    assert.deepEqual(inList.map((slug) => deriveProgress(eventsFor(events, slug))), ['solved']);
  }
});

test('removing a membership, and deleting a list, never touch solving history', () => {
  const slug = 'two-sum';
  const events = [
    createEvent({ slug, kind: 'solve', at: at('2026-09-01') }),
    createEvent({ slug, kind: 'solve', at: at('2026-10-01') }),
  ];
  const before = structuredClone(events);
  let memberships = [createMembership('pl_1', slug), createMembership('blind-75', slug)];

  memberships = removeMembership(memberships, 'pl_1', slug);
  assert.equal(hasMembership(memberships, 'pl_1', slug), false);
  assert.equal(hasMembership(memberships, 'blind-75', slug), true);

  memberships = removeList(memberships, 'blind-75');
  assert.equal(memberships.length, 0, 'all memberships gone');
  assert.deepEqual(events, before, 'history untouched');
  assert.equal(deriveProgress(eventsFor(events, slug)), 'solved');
});

test('duplicate list membership is refused rather than duplicated', () => {
  const memberships = [createMembership('pl_1', 'two-sum')];
  assert.equal(hasMembership(memberships, 'pl_1', 'two-sum'), true);
  const next = hasMembership(memberships, 'pl_1', 'two-sum')
    ? memberships
    : [...memberships, createMembership('pl_1', 'two-sum')];
  assert.equal(next.length, 1);
});

// ─── Unique questions vs total solving events ────────────────────────────────

test('a question solved five times is one unique question and five events', () => {
  const events = Array.from({ length: 5 }, (_, i) =>
    createEvent({ slug: 'two-sum', kind: 'solve', at: at(`2026-10-0${i + 1}`) }));
  events.push(createEvent({ slug: 'valid-anagram', kind: 'solve', at: at('2026-10-06') }));

  assert.equal(uniqueSolvedSlugs(events).size, 2);
  assert.equal(totalSolveEvents(events), 6);
});

test('attempts make a question attempted, not solved', () => {
  const own = [createEvent({ slug: 'x', kind: 'attempt', at: at(TODAY) })];
  assert.equal(deriveProgress(own), 'attempted');
  own.push(createEvent({ slug: 'x', kind: 'solve', at: at(TODAY) }));
  assert.equal(deriveProgress(own), 'solved');
});

// ─── Revision is not a solve ─────────────────────────────────────────────────

test('completing a revision does not create a solve or a new-question credit', () => {
  const events = [createEvent({ slug: 'two-sum', kind: 'solve', at: at('2026-09-01') })];
  const after = [...events, createEvent({ slug: 'two-sum', kind: 'revision', at: at(TODAY), confidence: 4 })];

  assert.equal(totalSolveEvents(after), 1, 'still one solve');
  const day = dailyProgress(after, TODAY);
  assert.equal(day.newSolved, 0, 'no new-question credit from a revision');
  assert.equal(day.revisionsDone, 1);
});

test('the two daily targets cannot double-count the same work', () => {
  const events = [
    createEvent({ slug: 'a', kind: 'solve', at: at(TODAY, 9) }),
    createEvent({ slug: 'a', kind: 'solve', at: at(TODAY, 14) }), // same question twice today
    createEvent({ slug: 'b', kind: 'solve', at: at('2026-09-01') }), // first solve was earlier
    createEvent({ slug: 'b', kind: 'solve', at: at(TODAY) }),        // repeat solve today
    createEvent({ slug: 'c', kind: 'revision', at: at(TODAY) }),
    createEvent({ slug: 'd', kind: 'attempt', at: at(TODAY) }),
  ];
  const day = dailyProgress(events, TODAY);
  assert.equal(day.newSolved, 1, 'only "a" is newly solved today; "b" was first solved in September');
  assert.equal(day.revisionsDone, 1);
  assert.equal(day.attempts, 1, 'attempts count toward neither target');
  assert.equal(day.solveEvents, 3);
});

// ─── Revision scheduling and date boundaries ─────────────────────────────────

test('the ladder advances on confidence and never advances an assisted touch', () => {
  assert.equal(nextRung(-1, { confidence: 4 }), 1, 'first confident solve lands on 7 days');
  assert.equal(nextRung(1, { confidence: 4 }), 2);
  assert.equal(nextRung(2, { confidence: 3 }), 2, 'holds');
  assert.equal(nextRung(2, { confidence: 2 }), 1, 'drops one');
  assert.equal(nextRung(3, { confidence: 1 }), 0, 'back to the first rung');
  assert.equal(nextRung(3, { confidence: 4 }), 3, 'cannot exceed the last rung');
  assert.equal(nextRung(1, { confidence: 4, assisted: true }), 1, 'assisted never advances');
});

test('a schedule is derived from the event local day, not from "now"', () => {
  const event = createEvent({ slug: 'x', kind: 'solve', at: at('2026-10-01'), confidence: 4 });
  const schedule = scheduleAfterEvent(createSchedule(), event);
  assert.equal(schedule.rung, 1);
  assert.equal(schedule.nextDue, '2026-10-08', '7 days after the solve, not after today');
});

test('revision state respects the local date boundary exactly', () => {
  assert.equal(revisionState(createSchedule({ nextDue: '2026-10-22' }), TODAY), 'overdue');
  assert.equal(revisionState(createSchedule({ nextDue: TODAY }), TODAY), 'due');
  assert.equal(revisionState(createSchedule({ nextDue: '2026-10-24' }), TODAY), 'scheduled');
  assert.equal(revisionState(createSchedule(), TODAY), 'none');
  assert.equal(revisionState(null, TODAY), 'none');
});

test('a manual date overrides the suggestion and is marked as the user’s', () => {
  const schedule = withManualDate(scheduleAfterEvent(createSchedule(), createEvent({ slug: 'x', at: at(TODAY), confidence: 4 })), '2026-12-25');
  assert.equal(schedule.nextDue, '2026-12-25');
  assert.equal(schedule.overridden, true);
});

test('a lapse is recorded when a revision drops the question back a rung', () => {
  let schedule = scheduleAfterEvent(createSchedule(), createEvent({ slug: 'x', at: at('2026-10-01'), confidence: 4 }));
  assert.equal(schedule.lapses, 0);
  schedule = scheduleAfterEvent(schedule, createEvent({ slug: 'x', kind: 'revision', at: at('2026-10-08'), confidence: 2 }));
  assert.equal(schedule.lapses, 1);
  assert.equal(schedule.completed, 1);
});

// ─── Derived five-value status ───────────────────────────────────────────────

test('the five display statuses derive from the three stored axes', () => {
  const events = [];
  const schedules = {};
  assert.equal(questionState('x', events, schedules, TODAY).status, 'not-started');

  events.push(createEvent({ slug: 'x', kind: 'attempt', at: at(TODAY) }));
  assert.equal(questionState('x', events, schedules, TODAY).status, 'attempted');

  events.push(createEvent({ slug: 'x', kind: 'solve', at: at(TODAY), confidence: 3 }));
  assert.equal(questionState('x', events, schedules, TODAY).status, 'solved');

  schedules.x = createSchedule({ nextDue: '2026-10-01' });
  assert.equal(questionState('x', events, schedules, TODAY).status, 'needs-revision', 'due work outranks everything');

  schedules.x = createSchedule({ nextDue: '2026-12-01' });
  events.push(createEvent({ slug: 'x', kind: 'revision', at: at(TODAY), confidence: 4 }));
  events.push(createEvent({ slug: 'x', kind: 'solve', at: at(TODAY), confidence: 4 }));
  const state = questionState('x', events, schedules, TODAY);
  assert.equal(state.mastered, true);
  assert.equal(state.status, 'mastered');
  assert.equal(state.progress, 'solved', 'the progress axis is unchanged by mastery');
});

test('mastery needs a revision and is denied to assisted work', () => {
  const base = (extra) => [
    createEvent({ slug: 'x', kind: 'solve', at: at('2026-10-01'), confidence: 4 }),
    createEvent({ slug: 'x', ...extra }),
  ];
  assert.equal(deriveMastery(base({ kind: 'solve', at: at(TODAY), confidence: 4 })), false, 'two solves alone are not mastery');
  assert.equal(deriveMastery(base({ kind: 'revision', at: at(TODAY), confidence: 4 })), true);
  assert.equal(deriveMastery(base({ kind: 'revision', at: at(TODAY), confidence: 4, assisted: true })), false);
  assert.equal(deriveMastery(base({ kind: 'revision', at: at(TODAY), confidence: 3 })), false);
});

// ─── List frequency is family-weighted ───────────────────────────────────────

test('nested curated lists count once per family, not once per list', () => {
  const memberships = [
    createMembership('blind-75', 'two-sum'),
    createMembership('grind-75', 'two-sum'),      // same family as blind-75
    createMembership('neetcode-150', 'two-sum'),
    createMembership('neetcode-250', 'two-sum'),  // same family as neetcode-150
  ];
  const freq = listFrequency(memberships, 'two-sum');
  assert.equal(freq.lists, 4);
  assert.equal(freq.families, 2, 'four lists, but only two independent opinions');
});

test('a membership dropped from its source stops counting toward frequency', () => {
  const memberships = [
    createMembership('blind-75', 'x'),
    { ...createMembership('neetcode-150', 'x'), removedFromSource: '2026-05-01T00:00:00.000Z' },
  ];
  assert.equal(listFrequency(memberships, 'x').lists, 1);
});

// ─── Curated refresh is a diff, never a delete ───────────────────────────────

test('refreshing a curated list marks removals instead of deleting them', () => {
  const existing = [
    createMembership('neetcode-150', 'two-sum'),
    createMembership('neetcode-150', 'old-question'),
    createMembership('pl_1', 'untouched'),
  ];
  const { memberships, added, removed } = diffCuratedMemberships(
    existing, 'neetcode-150', ['two-sum', 'new-question'], '2026-05-01T00:00:00.000Z',
  );

  assert.deepEqual(added, ['new-question']);
  assert.deepEqual(removed, ['old-question']);
  const dropped = memberships.find((m) => m.slug === 'old-question');
  assert.ok(dropped, 'the dropped question is still present');
  assert.equal(dropped.removedFromSource, '2026-05-01T00:00:00.000Z');
  assert.ok(memberships.some((m) => m.listId === 'pl_1'), 'other lists untouched');
});

// ─── Import deduplication ────────────────────────────────────────────────────

test('re-importing the same activity adds nothing', () => {
  const existing = [createEvent({ slug: 'two-sum', kind: 'solve', at: at('2026-10-01', 9) })];
  const incoming = [
    { slug: 'two-sum', kind: 'solve', at: at('2026-10-01', 18) }, // same question, kind and day
    { slug: 'valid-anagram', kind: 'solve', at: at('2026-10-02') },
    { slug: '', kind: 'solve', at: at('2026-10-02') },            // unusable
  ];
  const first = mergeEvents(existing, incoming);
  assert.equal(first.added, 1);
  assert.equal(first.skipped, 2);

  const second = mergeEvents(first.merged, incoming);
  assert.equal(second.added, 0, 'importing twice is a no-op');
  assert.equal(second.merged.length, first.merged.length);
});

// ─── URLs and invalid metadata ───────────────────────────────────────────────

test('problem URLs are validated, and contest links are refused', () => {
  assert.equal(extractSlug('https://leetcode.com/problems/two-sum/').slug, 'two-sum');
  assert.equal(extractSlug('https://leetcode.com/problems/two-sum/description/?envType=x').slug, 'two-sum');
  assert.equal(extractSlug('two-sum').slug, 'two-sum');
  for (const bad of [
    'https://leetcode.com/contest/weekly-1/problems/x/',
    'https://leetcode.com/explore/learn/card/x/problems/y/',
    'https://example.com/problems/two-sum/',
    'https://leetcode.com/problemset/all/',
    'not a url',
    '',
  ]) {
    const result = extractSlug(bad);
    assert.equal(result.ok, false, `should refuse: ${bad}`);
    assert.ok(result.reason.length > 8, 'refusal gives a specific reason');
  }
});

test('a URL is never derived from a title, and incomplete metadata is marked', () => {
  const q = createQuestion({ url: 'https://leetcode.com/problems/n-queens-ii/' });
  assert.equal(q.slug, 'n-queens-ii');
  assert.equal(problemUrl(q.slug), 'https://leetcode.com/problems/n-queens-ii/');
  assert.equal(q.titleIsGuess, true, 'the title is flagged as a guess, not asserted');
  assert.equal(q.difficulty, null);
  assert.deepEqual(q.topics, []);
  assert.equal(q.metadataSource, 'manual');
  assert.equal(createQuestion({ url: 'https://example.com/x' }), null, 'an unusable URL yields no record');
});

// ─── Weak topics with insufficient data ──────────────────────────────────────

test('a topic is never called weak from a tiny sample', () => {
  const questions = [createQuestion({ url: 'https://leetcode.com/problems/a/', topics: ['Graph'] })];
  const events = [createEvent({ slug: 'a', kind: 'solve', at: at(TODAY), confidence: 1 })];
  const [row] = topicStats(questions, events, {}, TODAY);
  const verdict = assessTopic(row);
  assert.equal(verdict.weak, false);
  assert.equal(verdict.verdict, 'insufficient-data');
  assert.match(verdict.reason, /at least 5/);
});

test('an unsolved question alone never makes a topic weak', () => {
  const questions = Array.from({ length: 8 }, (_, i) =>
    createQuestion({ url: `https://leetcode.com/problems/q${i}/`, topics: ['Graph'] }));
  const [row] = topicStats(questions, [], {}, TODAY);
  assert.equal(row.unsolved, 8);
  assert.equal(row.touched, 0);
  assert.equal(assessTopic(row).weak, false, 'untouched is not weak, it is just unstarted');
});

test('a weak topic explains itself in a sentence', () => {
  const questions = Array.from({ length: 6 }, (_, i) =>
    createQuestion({ url: `https://leetcode.com/problems/g${i}/`, topics: ['Graph'] }));
  const events = questions.map((q, i) =>
    createEvent({ slug: q.slug, kind: 'solve', at: at(`2026-10-0${i + 1}`), confidence: 2, assisted: true }));
  const [row] = topicStats(questions, events, {}, TODAY);
  const verdict = assessTopic(row);
  assert.equal(verdict.weak, true);
  assert.match(verdict.reason, /confidence|needed help/);
});

// ─── Storage, migration and recovery ─────────────────────────────────────────

test('the DSA areas persist and reload through the store', async () => {
  const store = createStore();
  await store.init();
  await store.ensureArea('dsa.library');

  store.update('dsa.library', (lib) => ({
    ...lib,
    questions: [createQuestion({ url: 'https://leetcode.com/problems/two-sum/', difficulty: 'Easy', topics: ['Array'] })],
    curatedLists: [createList({ id: 'blind-75', name: 'Blind 75', kind: 'curated' })],
    curatedMemberships: [createMembership('blind-75', 'two-sum')],
  }));
  store.update('dsa.progress', (p) => ({
    ...p,
    events: [createEvent({ slug: 'two-sum', kind: 'solve', at: at(TODAY), confidence: 4 })],
  }));
  await store.flush();

  const state = store.getState();
  assert.equal(state['dsa.library'].questions.length, 1);
  assert.equal(state['dsa.progress'].events.length, 1);
  assert.equal(state['dsa.library'].curatedMemberships.length, 1);
});

test('the library is not loaded until it is asked for', async () => {
  const store = createStore();
  await store.init();
  assert.equal(store.getStatus().loadedAreas.includes('dsa.library'), false, 'skipped at init');
  assert.equal(store.getStatus().loadedAreas.includes('dsa.progress'), true, 'small areas load eagerly');
  await store.ensureArea('dsa.library');
  assert.equal(store.getStatus().loadedAreas.includes('dsa.library'), true);
});

test('corrupt library data resets only the library, never personal history', async () => {
  const store = createStore();
  await store.init();
  await store.ensureArea('dsa.library');

  store.update('dsa.progress', (p) => ({
    ...p,
    events: [createEvent({ slug: 'two-sum', kind: 'solve', at: at(TODAY) })],
  }));
  store.update('dsa.library', () => ({ questions: 'not a list', curatedLists: 42 }));

  assert.deepEqual(store.getState()['dsa.library'].questions, [], 'library degraded to empty');
  assert.equal(store.getState()['dsa.progress'].events.length, 1, 'history survived');
});

test('duplicate question records are collapsed to one on read', async () => {
  const store = createStore();
  await store.init();
  await store.ensureArea('dsa.library');
  store.update('dsa.library', (lib) => ({
    ...lib,
    questions: [
      { slug: 'two-sum', title: 'Two Sum' },
      { slug: 'two-sum', title: 'Two Sum (duplicate)' },
      { slug: 'TWO-SUM', title: 'Different case' },
      { title: 'No slug at all' },
    ],
  }));
  const questions = store.getState()['dsa.library'].questions;
  assert.equal(questions.length, 1, 'slug is identity, case-insensitively');
  assert.equal(questions[0].title, 'Two Sum', 'the first record wins');
});

test('memberships pointing at unknown questions are dropped as dangling', async () => {
  const store = createStore();
  await store.init();
  await store.ensureArea('dsa.library');
  store.update('dsa.library', (lib) => ({
    ...lib,
    questions: [createQuestion({ url: 'https://leetcode.com/problems/two-sum/' })],
    curatedLists: [createList({ id: 'blind-75', name: 'Blind 75', kind: 'curated' })],
    curatedMemberships: [
      createMembership('blind-75', 'two-sum'),
      createMembership('blind-75', 'does-not-exist'),
      createMembership('no-such-list', 'two-sum'),
    ],
  }));
  const memberships = store.getState()['dsa.library'].curatedMemberships;
  assert.equal(memberships.length, 1);
  assert.equal(memberships[0].slug, 'two-sum');
});

test('export round-trips DSA data, and a version 1 backup still restores', async () => {
  const store = createStore();
  await store.init();
  await store.ensureAllAreas();
  store.update('dsa.progress', (p) => ({
    ...p,
    events: [createEvent({ slug: 'two-sum', kind: 'solve', at: at(TODAY) })],
  }));
  store.update('dsa.lists', (l) => ({ ...l, lists: [createList({ name: 'Interview Prep' })] }));
  await store.flush();

  const payload = buildExport(store.getState());
  assert.equal(payload.version, 3);
  const result = parseImport(JSON.stringify(payload));
  assert.equal(result.ok, true);
  assert.equal(result.summary.dsaEvents, 1);
  assert.equal(result.summary.dsaLists, 1);
  assert.deepEqual(result.data['dsa.progress'].events, store.getState()['dsa.progress'].events);

  // A pre-DSA backup must still import, with the new areas defaulted.
  const v1 = { format: 'chestha.workspace', version: 1, exportedAt: new Date().toISOString(),
    data: { tasks: [], tags: [], notes: { text: 'old' }, dashboard: { widgets: [] }, sound: {}, settings: {} } };
  const legacy = parseImport(JSON.stringify(v1));
  assert.equal(legacy.ok, true, 'version 1 files still import');
  assert.equal(legacy.data.notes.text, 'old');
  assert.deepEqual(legacy.data['dsa.library'].questions, []);
  assert.deepEqual(legacy.data['dsa.progress'].events, []);
});

test('an import that is refused leaves DSA data untouched', async () => {
  const store = createStore();
  await store.init();
  await store.ensureAllAreas();
  store.update('dsa.progress', (p) => ({ ...p, events: [createEvent({ slug: 'keep-me', at: at(TODAY) })] }));
  const before = structuredClone(store.getState()['dsa.progress']);

  for (const bad of ['', '{]', '{"format":"other","version":2,"data":{}}', '{"format":"chestha.workspace","version":99,"data":{}}']) {
    assert.equal(parseImport(bad).ok, false);
  }
  assert.deepEqual(store.getState()['dsa.progress'], before);
});

test('daily targets are configurable and clamped to a sane range', async () => {
  const store = createStore();
  await store.init();
  store.update('dsa.settings', (s) => ({ ...s, dailyNewTarget: 999, dailyRevisionTarget: -4 }));
  const settings = store.getState()['dsa.settings'];
  assert.equal(settings.dailyNewTarget, 50);
  assert.equal(settings.dailyRevisionTarget, 0);
});

// ─── Data packs ──────────────────────────────────────────────────────────────

import { applyPack, parsePack } from '../src/index.js';
import { readFileSync } from 'node:fs';

const PACK_PATH = new URL('../../../apps/web/public/dsa-packs/curated-core.json', import.meta.url);

const emptyLibrary = () => ({ questions: [], curatedLists: [], curatedMemberships: [] });

test('the bundled curated pack parses and matches its documented list sizes', () => {
  const result = parsePack(readFileSync(PACK_PATH, 'utf8'));
  assert.equal(result.ok, true, result.ok ? '' : result.error);

  const { pack, summary } = result;
  assert.equal(summary.skipped, 0, 'every record in the shipped pack is usable');

  const sizes = Object.fromEntries(pack.lists.map((l) => [
    l.id, pack.memberships.filter((m) => m.listId === l.id).length,
  ]));
  assert.deepEqual(sizes, {
    'blind-75': 75,
    'neetcode-150': 150,
    'neetcode-250': 250,
    'leetcode-75': 75,
    'leetcode-top-interview-150': 150,
  });

  // Every membership must resolve to a question that is actually in the pack.
  const slugs = new Set(pack.questions.map((q) => q.slug));
  assert.ok(pack.memberships.every((m) => slugs.has(m.slug)), 'no dangling memberships');
  assert.ok(pack.questions.every((q) => q.difficulty), 'every shipped question has a difficulty');
  assert.ok(pack.questions.every((q) => /^[a-z0-9-]+$/.test(q.slug)), 'every slug is well formed');
  assert.ok(pack.provenance?.questions?.licence, 'provenance records a licence');
});

test('applying the pack builds one record per question despite list overlap', () => {
  const { pack } = parsePack(readFileSync(PACK_PATH, 'utf8'));
  const { library, added, listsAdded } = applyPack(emptyLibrary(), pack);

  assert.equal(listsAdded, 5);
  assert.equal(added, library.questions.length);
  assert.equal(new Set(library.questions.map((q) => q.slug)).size, library.questions.length, 'no duplicates');
  // Far more memberships than questions: the lists heavily overlap.
  assert.ok(library.curatedMemberships.length > library.questions.length);
  assert.equal(library.curatedMemberships.length, 700);

  const twoSum = library.questions.find((q) => q.slug === 'two-sum');
  assert.ok(twoSum, 'Two Sum is present');
  assert.equal(twoSum.metadataSource, 'imported');
  assert.equal(twoSum.titleIsGuess, false);
});

test('re-applying the same pack changes nothing', () => {
  const { pack } = parsePack(readFileSync(PACK_PATH, 'utf8'));
  const first = applyPack(emptyLibrary(), pack);
  const second = applyPack(first.library, pack);

  assert.equal(second.added, 0);
  assert.equal(second.listsAdded, 0);
  assert.deepEqual(second.membershipChanges, [], 'no membership churn on a repeat import');
  assert.equal(second.library.questions.length, first.library.questions.length);
  assert.equal(second.library.curatedMemberships.length, first.library.curatedMemberships.length);
});

test('a pack never overwrites metadata the user entered by hand', () => {
  const library = {
    questions: [{
      slug: 'two-sum', title: 'My own title', titleIsGuess: false,
      difficulty: 'Hard', topics: ['My Topic'], leetcodeId: null,
      metadataSource: 'manual', verifiedAt: null, addedAt: '2026-01-01T00:00:00.000Z',
    }],
    curatedLists: [], curatedMemberships: [],
  };
  const pack = {
    id: 'p', name: 'p',
    questions: [{ slug: 'two-sum', title: 'Two Sum', difficulty: 'Easy', topics: ['Array'], leetcodeId: 1, paidOnly: false }],
    lists: [], memberships: [],
  };
  const { library: next } = applyPack(library, pack);
  const q = next.questions[0];
  assert.equal(q.title, 'My own title');
  assert.equal(q.difficulty, 'Hard');
  assert.deepEqual(q.topics, ['My Topic']);
  assert.equal(q.metadataSource, 'manual');
  assert.equal(q.leetcodeId, 1, 'but a blank field is still filled in');
});

test('a pack does upgrade a guessed title and blank metadata', () => {
  const library = {
    questions: [{
      slug: 'two-sum', title: 'Two Sum', titleIsGuess: true, difficulty: null, topics: [],
      leetcodeId: null, metadataSource: 'manual', verifiedAt: null, addedAt: '2026-01-01T00:00:00.000Z',
    }],
    curatedLists: [], curatedMemberships: [],
  };
  const pack = {
    id: 'p', name: 'p',
    questions: [{ slug: 'two-sum', title: 'Two Sum', difficulty: 'Easy', topics: ['Array', 'Hash Table'], leetcodeId: 1, paidOnly: false }],
    lists: [], memberships: [],
  };
  const { library: next } = applyPack(library, pack);
  assert.equal(next.questions[0].difficulty, 'Easy');
  assert.deepEqual(next.questions[0].topics, ['Array', 'Hash Table']);
  assert.equal(next.questions[0].titleIsGuess, false);
  assert.equal(next.questions[0].metadataSource, 'imported');
});

test('applying a pack cannot touch solving history', async () => {
  const store = createStore();
  await store.init();
  await store.ensureArea('dsa.library');
  store.update('dsa.progress', (p) => ({
    ...p, events: [createEvent({ slug: 'two-sum', kind: 'solve', at: at(TODAY), confidence: 4 })],
  }));
  const historyBefore = structuredClone(store.getState()['dsa.progress']);

  const { pack } = parsePack(readFileSync(PACK_PATH, 'utf8'));
  store.update('dsa.library', (lib) => applyPack(lib, pack).library);

  assert.ok(store.getState()['dsa.library'].questions.length > 300);
  assert.deepEqual(store.getState()['dsa.progress'], historyBefore, 'history is in a different area and is untouched');
  // And progress is now visible against the imported question.
  assert.equal(questionState('two-sum', store.getState()['dsa.progress'].events, {}, TODAY).progress, 'solved');
});

test('a malformed pack is refused with a specific reason', () => {
  for (const [input, expected] of [
    ['', /empty/i],
    ['{nope', /valid JSON/i],
    ['[]', /pack object/i],
    ['{"version":1,"questions":[]}', /format marker/i],
    ['{"format":"other","version":1,"questions":[]}', /reports its format/i],
    ['{"format":"chestha.dsa.pack","questions":[]}', /version number/i],
    ['{"format":"chestha.dsa.pack","version":99,"questions":[]}', /newer version/i],
    ['{"format":"chestha.dsa.pack","version":1}', /no question list/i],
  ]) {
    const result = parsePack(input);
    assert.equal(result.ok, false, `should refuse: ${input}`);
    assert.match(result.error, expected);
  }
});

test('pack memberships pointing at absent questions are dropped', () => {
  const result = parsePack(JSON.stringify({
    format: 'chestha.dsa.pack', version: 1, questions: [{ slug: 'two-sum', title: 'Two Sum' }],
    lists: [{ id: 'l1', name: 'L1' }],
    memberships: [{ listId: 'l1', slug: 'two-sum' }, { listId: 'l1', slug: 'ghost' }, { listId: 'nope', slug: 'two-sum' }],
  }));
  assert.equal(result.ok, true);
  assert.equal(result.pack.memberships.length, 1);
});

// ─── URL intake and personal lists ───────────────────────────────────────────

import { INTAKE_LABELS, buildRows, filterRows, planIntake, reorderMembership } from '../src/index.js';

test('parsePack still accepts legacy kalpvan.dsa.pack and vistaar.dsa.pack', () => {
  for (const format of ['kalpvan.dsa.pack', 'vistaar.dsa.pack']) {
    const payload = {
      format, version: 1, questions: [{ slug: 'two-sum', title: 'Two Sum' }],
    };
    const result = parsePack(JSON.stringify(payload));
    assert.equal(result.ok, true, `should accept ${format}`);
  }
});
test('pasted input is planned line by line before anything is written', () => {
  const questions = [createQuestion({ url: 'https://leetcode.com/problems/two-sum/', difficulty: 'Easy', topics: ['Array'] })];
  const memberships = [createMembership('pl_1', 'valid-anagram')];
  const plan = planIntake([
    'https://leetcode.com/problems/two-sum/',          // already in library
    'https://leetcode.com/problems/valid-anagram/',    // already in this list
    'https://leetcode.com/problems/group-anagrams/',   // new
    'group-anagrams',                                  // duplicate of the line above
    'https://leetcode.com/contest/weekly-1/problems/x/', // rejected
    'https://example.com/problems/two-sum/',           // rejected
  ].join('\n'), { questions, memberships, listId: 'pl_1' });

  assert.deepEqual(plan.counts, { matched: 1, new: 1, already: 1, duplicate: 1, rejected: 2 });
  assert.deepEqual(plan.actionable, ['two-sum', 'group-anagrams']);
  assert.equal(plan.rows[0].outcome, 'matched');
  assert.equal(plan.rows[1].outcome, 'already');
  assert.equal(plan.rows[2].title, 'Group Anagrams', 'a title is guessed for display');
  assert.ok(plan.rows[4].reason.includes('contest'));
  assert.ok(Object.keys(INTAKE_LABELS).every((k) => INTAKE_LABELS[k]));
});

test('a question added by URL joins the existing record, never a duplicate', () => {
  const questions = [createQuestion({ url: 'https://leetcode.com/problems/two-sum/', difficulty: 'Easy', topics: ['Array'] })];
  const plan = planIntake('https://leetcode.com/problems/two-sum/?envType=x', { questions, memberships: [], listId: 'pl_1' });
  assert.equal(plan.counts.new, 0);
  assert.equal(plan.counts.matched, 1, 'matched to the canonical record');
  assert.equal(plan.rows[0].slug, 'two-sum');
});

test('adding to a personal list shares progress with curated lists', () => {
  const slug = 'two-sum';
  const events = [createEvent({ slug, kind: 'solve', at: at(TODAY), confidence: 4 })];
  const memberships = [createMembership('blind-75', slug), createMembership('pl_1', slug)];

  // The same derived state is visible from either list.
  for (const listId of ['blind-75', 'pl_1']) {
    const inList = memberships.filter((m) => m.listId === listId).map((m) => m.slug);
    assert.deepEqual(inList, [slug]);
    assert.equal(questionState(slug, events, {}, TODAY).progress, 'solved');
  }
});

test('questions in a personal list can be reordered', () => {
  let memberships = [
    createMembership('pl_1', 'a', { order: 0 }),
    createMembership('pl_1', 'b', { order: 1 }),
  ];
  memberships = reorderMembership(memberships, 'pl_1', 'b', 0);
  assert.equal(memberships.find((m) => m.slug === 'b').order, 0);
  assert.equal(memberships.find((m) => m.slug === 'a').order, 0, 'other orders are untouched by this helper');
});

test('personal list memberships survive when the library is reloaded', async () => {
  const store = createStore();
  await store.init();
  store.update('dsa.lists', () => ({
    lists: [createList({ id: 'pl_1', name: 'Interview Prep' })],
    memberships: [createMembership('pl_1', 'a-question-not-in-the-library')],
  }));
  // Personal memberships are not filtered against the library, which may be lazy.
  assert.equal(store.getState()['dsa.lists'].memberships.length, 1);
});

// ─── Manual tracking: bookmark, solve, repeat solves ─────────────────────────

import { scheduleAfterEvent as advance } from '../src/index.js';

/** Mirrors what the UI's "mark solved" action does, so the semantics are pinned. */
function recordSolve(progress, slug, extra = {}) {
  const event = createEvent({ kind: 'solve', slug, ...extra });
  return {
    ...progress,
    events: [...progress.events, event],
    schedules: { ...progress.schedules, [slug]: advance(progress.schedules[slug], event) },
    lastEventId: event.id,
  };
}

test('marking solved records one event and schedules a revision', async () => {
  const store = createStore();
  await store.init();
  store.update('dsa.progress', (p) => recordSolve(p, 'two-sum', { at: at(TODAY) }));

  const progress = store.getState()['dsa.progress'];
  assert.equal(progress.events.length, 1);
  assert.equal(progress.events[0].kind, 'solve');
  assert.equal(questionState('two-sum', progress.events, progress.schedules, TODAY).progress, 'solved');
  assert.ok(progress.schedules['two-sum'].nextDue, 'a revision date was set');
});

test('solving the same question repeatedly accumulates events, not replacements', async () => {
  const store = createStore();
  await store.init();
  for (const day of ['2026-10-01', '2026-10-10', TODAY]) {
    store.update('dsa.progress', (p) => recordSolve(p, 'two-sum', { at: at(day) }));
  }
  const progress = store.getState()['dsa.progress'];

  assert.equal(totalSolveEvents(progress.events), 3, 'three solving events');
  assert.equal(uniqueSolvedSlugs(progress.events).size, 1, 'but one unique question');
  // Which is exactly the count the row badge shows.
  assert.equal(progress.events.filter((e) => e.kind === 'solve' && e.slug === 'two-sum').length, 3);
});

test('undoing a solve removes only that event and restores the prior schedule', async () => {
  const store = createStore();
  await store.init();
  store.update('dsa.progress', (p) => recordSolve(p, 'two-sum', { at: at('2026-10-01') }));
  const afterFirst = structuredClone(store.getState()['dsa.progress']);

  store.update('dsa.progress', (p) => recordSolve(p, 'two-sum', { at: at(TODAY) }));
  const secondId = store.getState()['dsa.progress'].events.at(-1).id;

  // The undo path: drop that event, put the schedule back as it was.
  store.update('dsa.progress', (p) => ({
    ...p,
    events: p.events.filter((e) => e.id !== secondId),
    schedules: { ...p.schedules, 'two-sum': afterFirst.schedules['two-sum'] },
  }));

  const progress = store.getState()['dsa.progress'];
  assert.equal(totalSolveEvents(progress.events), 1, 'back to one solve');
  assert.deepEqual(progress.schedules['two-sum'], afterFirst.schedules['two-sum']);
  assert.equal(questionState('two-sum', progress.events, progress.schedules, TODAY).progress, 'solved');
});

test('a bookmark is per question, persists, and does not touch solving history', async () => {
  const store = createStore();
  await store.init();
  store.update('dsa.progress', (p) => recordSolve(p, 'two-sum', { at: at(TODAY) }));

  const toggle = (slug) => store.update('dsa.progress', (p) => {
    const current = p.questionState[slug] ?? { bookmarked: false, priority: 0, notes: '' };
    return { ...p, questionState: { ...p.questionState, [slug]: { ...current, bookmarked: !current.bookmarked } } };
  });

  toggle('two-sum');
  await store.flush();
  assert.equal(store.getState()['dsa.progress'].questionState['two-sum'].bookmarked, true);
  assert.equal(totalSolveEvents(store.getState()['dsa.progress'].events), 1, 'history untouched');

  toggle('two-sum');
  assert.equal(store.getState()['dsa.progress'].questionState['two-sum'].bookmarked, false, 'toggles back');
  assert.equal(store.getState()['dsa.progress'].questionState['valid-anagram'], undefined, 'other questions unaffected');
});

test('bookmarking a question makes the bookmarked filter find it', async () => {
  const store = createStore();
  await store.init();
  await store.ensureArea('dsa.library');
  store.update('dsa.library', (lib) => ({
    ...lib,
    questions: [
      createQuestion({ url: 'https://leetcode.com/problems/two-sum/', difficulty: 'Easy', topics: ['Array'] }),
      createQuestion({ url: 'https://leetcode.com/problems/valid-anagram/', difficulty: 'Easy', topics: ['Hash Table'] }),
    ],
  }));
  store.update('dsa.progress', (p) => ({
    ...p, questionState: { 'two-sum': { bookmarked: true, priority: 0, notes: '' } },
  }));

  const state = store.getState();
  const rows = buildRows({
    questions: state['dsa.library'].questions,
    events: state['dsa.progress'].events,
    schedules: state['dsa.progress'].schedules,
    questionState: state['dsa.progress'].questionState,
    curatedMemberships: [],
  }, TODAY);

  // The filter that previously had no way of being satisfied from the UI.
  assert.deepEqual(filterRows(rows, { bookmarked: true }).map((r) => r.question.slug), ['two-sum']);
});
