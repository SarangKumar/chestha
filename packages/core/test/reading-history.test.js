import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groupHistoryByDay, readStreak, readingDay,
} from '@chestha/core';

/**
 * These tests exist because the streak is the one number on the card that is
 * computed rather than counted, and every way of getting it wrong is a way of
 * telling someone they lost a streak they did not lose.
 */

test('a day is resolved in the reader’s zone, not the server’s', () => {
  // 23:30 UTC on the 1st is already the 2nd in Kolkata (+5:30).
  const instant = '2026-03-01T23:30:00.000Z';
  assert.equal(readingDay(instant, 'UTC'), '2026-03-01');
  assert.equal(readingDay(instant, 'Asia/Kolkata'), '2026-03-02');
});

test('an unparseable instant is null rather than today', () => {
  assert.equal(readingDay('not a date'), null);
  assert.equal(readingDay(null), null);
});

test('an unknown zone falls back to UTC instead of throwing', () => {
  assert.equal(readingDay('2026-03-01T10:00:00.000Z', 'Mars/Olympus'), '2026-03-01');
});

test('consecutive days count, and the newest gap stops the count', () => {
  const streak = readStreak(
    [
      '2026-03-05T10:00:00.000Z',
      '2026-03-04T10:00:00.000Z',
      '2026-03-03T10:00:00.000Z',
      // Gap on the 2nd.
      '2026-03-01T10:00:00.000Z',
    ],
    { now: '2026-03-05T12:00:00.000Z' },
  );
  assert.equal(streak, 3);
});

test('several reads on one day are one day', () => {
  const streak = readStreak(
    ['2026-03-05T08:00:00.000Z', '2026-03-05T09:00:00.000Z', '2026-03-05T22:00:00.000Z'],
    { now: '2026-03-05T23:00:00.000Z' },
  );
  assert.equal(streak, 1);
});

test('a streak survives a today with no reads yet', () => {
  // The whole morning would otherwise show a broken streak.
  const streak = readStreak(
    ['2026-03-04T10:00:00.000Z', '2026-03-03T10:00:00.000Z'],
    { now: '2026-03-05T09:00:00.000Z' },
  );
  assert.equal(streak, 2);
});

test('a gap of two days is not a streak at all', () => {
  const streak = readStreak(
    ['2026-03-01T10:00:00.000Z'],
    { now: '2026-03-05T09:00:00.000Z' },
  );
  assert.equal(streak, 0);
});

test('no history is zero, not NaN', () => {
  assert.equal(readStreak([]), 0);
  assert.equal(readStreak(null), 0);
  assert.equal(readStreak(['nonsense']), 0);
});

test('history groups newest day first, newest read first within a day', () => {
  const groups = groupHistoryByDay([
    { id: 'a', readAt: '2026-03-04T10:00:00.000Z' },
    { id: 'b', readAt: '2026-03-05T08:00:00.000Z' },
    { id: 'c', readAt: '2026-03-05T20:00:00.000Z' },
  ]);
  assert.deepEqual(groups.map((g) => g.day), ['2026-03-05', '2026-03-04']);
  assert.deepEqual(groups[0].items.map((i) => i.id), ['c', 'b']);
});

test('a row with no usable timestamp is dropped, not bucketed under today', () => {
  const groups = groupHistoryByDay([
    { id: 'a', readAt: '2026-03-04T10:00:00.000Z' },
    { id: 'bad', readAt: undefined },
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].items.map((i) => i.id), ['a']);
});
