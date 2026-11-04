/**
 * Reading history — what a person has opened, and the streak that comes out
 * of it.
 *
 * **The date rule matters here more than anywhere.** A read is an *instant*:
 * the moment a post was opened. A streak is counted in *calendar days*. The
 * two are different kinds of value, and this file is the seam between them —
 * so every function that turns one into the other takes the zone explicitly
 * rather than inheriting whatever the machine happens to be set to. A server
 * in UTC and a reader in IST disagree about which day 23:30 belongs to, and a
 * streak that resets at 5:30am is a bug report nobody can reproduce.
 */

/** Keep a history page from becoming an unbounded query. */
export const HISTORY_PAGE_SIZE = 30;

/**
 * The calendar day an instant falls on, as a `YYYY-MM-DD` string.
 *
 * `en-CA` is used because its short date format *is* ISO order — the usual
 * trick, and cheaper and more reliable than assembling parts by hand.
 */
export function readingDay(instant, timeZone = 'UTC') {
  // `new Date(null)` is the epoch, not an error, so a missing timestamp would
  // otherwise bucket silently under 1970 — present, wrong, and invisible.
  if (instant == null || instant === '') return null;
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date);
  } catch {
    // An unknown zone must not take the page down with it.
    return date.toISOString().slice(0, 10);
  }
}

/** The day before a `YYYY-MM-DD` string, as another one. */
function previousDay(day) {
  const [y, m, d] = day.split('-').map(Number);
  // UTC arithmetic on a date-only value: no zone is involved, because the
  // string has already been resolved to a calendar day.
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Consecutive days read, counting back from today.
 *
 * **Today not having a read yet does not break the streak.** Someone who read
 * yesterday and has not opened anything at 9am today is on a streak, not off
 * one — ending it at midnight would mean the number is wrong for most of every
 * morning. So the count starts at today if today is present and at yesterday
 * otherwise, and only a gap before that stops it.
 *
 * @param {Array<string|Date>} instants When posts were read, in any order.
 * @param {object} [options]
 * @param {string} [options.timeZone] The reader's zone; days are counted in it.
 * @param {string|Date} [options.now] The current instant, for tests.
 * @returns {number} Days in the current streak, 0 if there is none.
 */
export function readStreak(instants, { timeZone = 'UTC', now = new Date() } = {}) {
  const days = new Set();
  for (const instant of Array.isArray(instants) ? instants : []) {
    const day = readingDay(instant, timeZone);
    if (day) days.add(day);
  }
  if (days.size === 0) return 0;

  const today = readingDay(now, timeZone);
  if (!today) return 0;

  let cursor = days.has(today) ? today : previousDay(today);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = previousDay(cursor);
  }
  return streak;
}

/**
 * Group history rows into day buckets for rendering, newest day first and
 * newest read first within a day.
 *
 * The grouping happens here rather than in the page so the website and the
 * extension cannot disagree about where a day starts — the same reason
 * `readStreak` takes a zone.
 *
 * @param {Array<{readAt: string|Date}>} rows
 * @returns {Array<{day: string, items: object[]}>}
 */
export function groupHistoryByDay(rows, { timeZone = 'UTC' } = {}) {
  const buckets = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const day = readingDay(row?.readAt, timeZone);
    if (!day) continue;
    if (!buckets.has(day)) buckets.set(day, []);
    buckets.get(day).push(row);
  }

  return [...buckets.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, items]) => ({
      day,
      items: items.sort(
        (a, b) => Date.parse(b.readAt ?? 0) - Date.parse(a.readAt ?? 0),
      ),
    }));
}
