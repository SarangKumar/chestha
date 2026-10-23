import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, classify, createStore, createTask, buildExport, parseImport,
  isOverdue, monthGrid, selectNoDate, selectToday, sortTasks, todayISO,
} from '../src/index.js';

const TODAY = '2026-10-22';

test('open tasks are partitioned across the open buckets', () => {
  const tasks = [
    createTask({ title: 'overdue', due: '2026-10-01' }),
    createTask({ title: 'today', due: TODAY }),
    createTask({ title: 'soon', due: '2026-10-25' }),
    createTask({ title: 'later', due: '2026-12-01' }),
    createTask({ title: 'undated' }),
  ];
  const buckets = tasks.map((t) => classify(t, TODAY, 7));
  assert.deepEqual(buckets, ['overdue', 'today', 'upcoming', 'later', 'nodate']);
  assert.equal(new Set(buckets).size, buckets.length, 'each task lands in exactly one bucket');
});

test('Today includes everything overdue', () => {
  const tasks = [
    createTask({ title: 'a', due: '2026-10-01' }),
    createTask({ title: 'b', due: TODAY }),
    createTask({ title: 'c', due: '2026-11-01' }),
  ];
  assert.deepEqual(selectToday(tasks, TODAY).map((t) => t.title), ['a', 'b']);
});

test('a completed task is never overdue, and reopening restores overdue', () => {
  const task = createTask({ title: 'late', due: '2026-10-01' });
  assert.equal(isOverdue(task, TODAY), true);
  const done = { ...task, completedAt: new Date().toISOString() };
  assert.equal(isOverdue(done, TODAY), false);
  assert.equal(classify(done, TODAY), 'completed');
  const reopened = { ...done, completedAt: null };
  assert.equal(isOverdue(reopened, TODAY), true, 'overdue again immediately, with no grace period');
});

test('undated tasks sink in sorts but are never dropped', () => {
  const tasks = [createTask({ title: 'undated' }), createTask({ title: 'dated', due: TODAY })];
  assert.deepEqual(sortTasks(tasks, 'due').map((t) => t.title), ['dated', 'undated']);
  assert.equal(selectNoDate(tasks).length, 1);
});

test('date arithmetic crosses month, year and DST boundaries', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2027-03-01', -1), '2027-02-28');
  assert.equal(addDays('2026-11-01', 1), '2026-11-02'); // US DST change
  assert.equal(addDays('2026-03-29', 1), '2026-03-30'); // EU DST change
});

test('the month grid is always six rows of seven days', () => {
  for (const month of ['2026-01-01', '2026-02-01', '2026-10-22', '2024-02-10']) {
    const grid = monthGrid(month);
    assert.equal(grid.length, 6);
    assert.ok(grid.every((week) => week.length === 7));
  }
});

test('the store reports ready even when storage cannot be opened at all', async () => {
  // The dashboard holds its widgets back until `ready`, so a path that never
  // sets it would leave a permanently blank grid — a worse failure than any
  // storage problem it might be reporting. There is no IndexedDB in node, so
  // this already exercises the fallback; the guarantee is that `ready` arrives
  // regardless.
  const store = createStore();
  assert.equal(store.getStatus().ready, false, 'not ready before init');

  await store.init();

  const status = store.getStatus();
  assert.equal(status.ready, true, 'the app must always open');
  assert.ok(status.mode, 'and always names the mode it opened in');
  // Degrading is reported rather than hidden.
  assert.equal(status.mode, 'memory', 'node has no IndexedDB, so it fell back');
  assert.ok(status.storageReason, 'with a reason a person can read');

  // Falling back still yields usable defaults, not a half-built state.
  assert.ok(Array.isArray(store.getState().tasks));
  assert.ok(store.getState().dashboard.widgets.length > 0);
});

test('an unmodified export reproduces state exactly', async () => {
  const store = createStore();
  await store.init();
  store.update('tasks', () => [
    createTask({ title: 'Write spec', due: TODAY, priority: 'high', tags: ['work', 'Work', ' deep '] }),
    createTask({ title: 'Buy milk' }),
  ]);
  store.update('notes', () => ({ text: 'scratch' }));
  await store.flush();

  const payload = buildExport(store.getState());
  const result = parseImport(JSON.stringify(payload));
  assert.equal(result.ok, true);
  assert.equal(result.summary.tasks, 2);
  assert.deepEqual(result.data.tasks, store.getState().tasks);
  assert.deepEqual(result.data.notes, { text: 'scratch' });
  assert.deepEqual(result.data.tasks[0].tags, ['work', 'deep'], 'tags dedupe case-insensitively');
});

test('import refuses bad input with a specific reason and changes nothing', async () => {
  const store = createStore();
  await store.init();
  store.update('tasks', () => [createTask({ title: 'keep me' })]);
  const before = structuredClone(store.getState());

  const cases = ['', 'not json at all', '[]', '{"format":"other","version":1,"data":{}}',
    '{"format":"vistaar.workspace","data":{}}',
    '{"format":"vistaar.workspace","version":99,"data":{}}'];
  for (const input of cases) {
    const result = parseImport(input);
    assert.equal(result.ok, false, `should refuse: ${input}`);
    assert.ok(result.error.length > 10, 'refusal states a specific reason');
  }
  assert.deepEqual(store.getState(), before, 'a refused import touches no data');
});

test('corrupt stored data degrades per area without losing the rest', async () => {
  const store = createStore();
  await store.init();
  store.update('tasks', () => [
    { title: 'valid', createdAt: new Date().toISOString() },
    { title: '   ' },
    'garbage',
    null,
  ]);
  assert.equal(store.getState().tasks.length, 1);
  store.update('dashboard', () => ({ widgets: 'broken' }));
  assert.ok(store.getState().dashboard.widgets.length > 0, 'default layout restored');
});

test('todayISO returns a local calendar date', () => {
  assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(todayISO(new Date(2026, 9, 22, 23, 50)), '2026-10-22', 'late evening is still the local day');
});
