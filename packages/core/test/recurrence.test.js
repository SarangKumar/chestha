import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVERY_DAY, WEEKDAYS_ONLY, WEEKEND_ONLY, coerceArea, coerceRecurrence, createRecurrence,
  createTask, describeRecurrence, firstOccurrence, isRecurring, nextInstance, nextOccurrence,
  normalizeWeekdays, weekdayIndex,
} from '../src/index.js';

const weekly = (days) => createRecurrence({ weekdays: days });
const monthly = (day) => createRecurrence({ kind: 'monthly', monthDay: day });

// 2026-10-23 is a Friday.
const FRIDAY = '2026-10-23';

test('the label is derived from the days, so the two cannot disagree', () => {
  assert.equal(describeRecurrence(weekly(EVERY_DAY)), 'Every day');
  assert.equal(describeRecurrence(weekly(WEEKDAYS_ONLY)), 'Every weekday');
  assert.equal(describeRecurrence(weekly(WEEKEND_ONLY)), 'Every weekend');
  assert.equal(describeRecurrence(weekly([1])), 'Every Mon');
  assert.equal(describeRecurrence(weekly([1, 3])), 'Every Mon, Wed');
  assert.equal(describeRecurrence(monthly(1)), 'Monthly on the 1st');
  assert.equal(describeRecurrence(monthly(2)), 'Monthly on the 2nd');
  assert.equal(describeRecurrence(monthly(3)), 'Monthly on the 3rd');
  assert.equal(describeRecurrence(monthly(11)), 'Monthly on the 11th');
  assert.equal(describeRecurrence(monthly(22)), 'Monthly on the 22nd');
  assert.equal(describeRecurrence(null), 'Does not repeat');
});

test('weekday selection is normalised and bounded', () => {
  assert.deepEqual(normalizeWeekdays([3, 1, 1, 3]), [1, 3], 'deduped and sorted');
  assert.deepEqual(normalizeWeekdays([-1, 7, 'x', null, 2]), [2], 'out-of-range values dropped');
  assert.deepEqual(normalizeWeekdays('nope'), []);
});

test('a pattern with no days selected does not repeat', () => {
  assert.equal(coerceRecurrence({ kind: 'weekly', weekdays: [] }), null);
  assert.equal(coerceRecurrence(null), null);
  assert.equal(coerceRecurrence('daily'), null);
  assert.equal(isRecurring({ recurrence: null }), false);
  assert.equal(isRecurring(createTask({ title: 'x', recurrence: { weekdays: [1] } })), true);
});

test('the next occurrence is always strictly after the date given', () => {
  assert.equal(nextOccurrence(FRIDAY, weekly(EVERY_DAY)), '2026-10-24', 'never returns the same day');
  assert.equal(weekdayIndex('2026-10-26'), 1, 'Monday');
  assert.equal(nextOccurrence(FRIDAY, weekly(WEEKDAYS_ONLY)), '2026-10-26', 'Friday skips the weekend');
  assert.equal(nextOccurrence(FRIDAY, weekly(WEEKEND_ONLY)), '2026-10-24', 'Saturday');
  assert.equal(nextOccurrence(FRIDAY, weekly([5])), '2026-10-30', 'a week later for the same weekday');
});

test('the first occurrence can be today, unlike the next one', () => {
  assert.equal(firstOccurrence(FRIDAY, weekly([5])), FRIDAY, 'today already matches');
  assert.equal(firstOccurrence(FRIDAY, weekly([1])), '2026-10-26');
  assert.equal(firstOccurrence('2026-10-15', monthly(15)), '2026-10-15');
});

test('a monthly task on the 31st lands on the last day of a shorter month', () => {
  // Skipping the occurrence would be worse than moving it by a day.
  assert.equal(nextOccurrence('2026-01-31', monthly(31)), '2026-02-28');
  assert.equal(nextOccurrence('2024-01-31', monthly(31)), '2024-02-29', 'leap year');
  assert.equal(nextOccurrence('2026-04-30', monthly(31)), '2026-05-31');
});

test('a clamped monthly task returns to its chosen day, it does not drift', () => {
  // The bug to avoid: landing on Feb 28 and then repeating on the 28th forever.
  let date = '2026-01-31';
  const pattern = monthly(31);
  const run = [];
  for (let i = 0; i < 4; i += 1) { date = nextOccurrence(date, pattern); run.push(date); }
  assert.deepEqual(run, ['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
});

test('a monthly pattern crosses the year boundary', () => {
  assert.equal(nextOccurrence('2026-12-15', monthly(15)), '2027-01-15');
  assert.equal(nextOccurrence('2026-12-31', monthly(1)), '2027-01-01');
});

test('completing a recurring task yields the next instance, clean', () => {
  const task = createTask({
    title: 'Standup', notes: 'daily sync', priority: 'medium', tags: ['work'],
    due: FRIDAY, recurrence: { weekdays: WEEKDAYS_ONLY },
  });
  const next = nextInstance(task, FRIDAY);

  assert.equal(next.due, '2026-10-26', 'the following weekday');
  assert.equal(next.title, 'Standup');
  assert.deepEqual(next.tags, ['work']);
  assert.equal(next.priority, 'medium');
  assert.deepEqual(next.recurrence, task.recurrence, 'the pattern carries forward');
  assert.equal(next.completedAt, undefined, 'a new occurrence starts uncompleted');

  // Two separate records: five solves of a habit are five tasks, not one edited.
  const spawned = createTask(next);
  assert.notEqual(spawned.id, task.id);
});

test('a non-recurring task spawns nothing', () => {
  assert.equal(nextInstance(createTask({ title: 'One off', due: FRIDAY }), FRIDAY), null);
});

test('an overdue recurring task schedules from today, not from its stale date', () => {
  const task = createTask({ title: 'Water plants', due: '2026-09-01', recurrence: { weekdays: EVERY_DAY } });
  const next = nextInstance(task, FRIDAY);
  assert.equal(next.due, '2026-10-24', 'the day after today, not the day after September');
});

test('a future-dated recurring task schedules from its own due date', () => {
  const task = createTask({ title: 'Review', due: '2026-11-02', recurrence: { weekdays: [1] } });
  assert.equal(nextInstance(task, FRIDAY).due, '2026-11-09', 'the Monday after its own');
});

test('a pattern survives storage, and a broken one degrades to no repeat', () => {
  const { value } = coerceArea('tasks', [
    { title: 'Standup', createdAt: new Date().toISOString(), recurrence: { kind: 'weekly', weekdays: [1, 2, 3, 4, 5] } },
    { title: 'Rent', createdAt: new Date().toISOString(), recurrence: { kind: 'monthly', monthDay: 99 } },
    { title: 'Broken', createdAt: new Date().toISOString(), recurrence: { kind: 'weekly', weekdays: [] } },
    { title: 'Junk', createdAt: new Date().toISOString(), recurrence: 'every day' },
  ]);
  assert.deepEqual(value[0].recurrence.weekdays, [1, 2, 3, 4, 5]);
  assert.equal(value[1].recurrence.monthDay, 31, 'clamped into range');
  assert.equal(value[2].recurrence, null, 'no days means no repeat');
  assert.equal(value[3].recurrence, null, 'unusable value means no repeat');
});

test('an existing task without a pattern still loads', () => {
  const { value } = coerceArea('tasks', [{ title: 'Old task', createdAt: new Date().toISOString() }]);
  assert.equal(value[0].recurrence, null);
  assert.equal(value[0].title, 'Old task');
});
