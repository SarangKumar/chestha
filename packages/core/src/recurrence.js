import { addDays, compareISO, isValidISODate, todayISO, weekdayIndex, WEEKDAYS_SHORT } from './dates.js';

/**
 * Recurrence, modelled the way an alarm is: you choose the days, and the label
 * is derived from the choice. "Daily" is simply all seven selected, which is why
 * there is no separate kind for it — one representation, no way for a label and
 * a schedule to disagree.
 *
 * Instances are spawned on completion rather than generated in advance. One task
 * record exists at a time, so a recurring task cannot flood the calendar with
 * rows the user never asked for, and skipping a week cannot leave a trail of
 * phantom overdue entries.
 */
export const RECURRENCE_KINDS = ['weekly', 'monthly'];

export const WEEKDAY_LABELS = WEEKDAYS_SHORT;

/** Single letters for the day picker, in week order. */
export const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
export const WEEKDAYS_ONLY = [1, 2, 3, 4, 5];
export const WEEKEND_ONLY = [0, 6];

export function createRecurrence(input = {}) {
  const kind = RECURRENCE_KINDS.includes(input.kind) ? input.kind : 'weekly';
  if (kind === 'monthly') {
    const day = Math.round(Number(input.monthDay));
    return { kind: 'monthly', weekdays: [], monthDay: Number.isFinite(day) ? Math.min(31, Math.max(1, day)) : 1 };
  }
  return { kind: 'weekly', weekdays: normalizeWeekdays(input.weekdays), monthDay: null };
}

export function normalizeWeekdays(days) {
  if (!Array.isArray(days)) return [];
  const seen = new Set();
  for (const value of days) {
    // Number(null) and Number('') are both 0, which would silently turn junk in
    // a stored pattern into Sunday. Only real numbers are considered.
    if (typeof value !== 'number' && typeof value !== 'string') continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    const day = Math.round(Number(value));
    if (Number.isInteger(day) && day >= 0 && day <= 6) seen.add(day);
  }
  return [...seen].sort((a, b) => a - b);
}

/** Null when the task does not repeat; an unusable pattern never repeats. */
export function coerceRecurrence(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const recurrence = createRecurrence(raw);
  if (recurrence.kind === 'weekly' && recurrence.weekdays.length === 0) return null;
  return recurrence;
}

export function isRecurring(task) {
  return Boolean(task?.recurrence);
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * The next date strictly after `fromISO` that the pattern lands on.
 *
 * A monthly task set to the 31st falls on the last day of a shorter month rather
 * than being skipped — losing an occurrence silently would be worse than moving
 * it by a day.
 */
export function nextOccurrence(fromISO, recurrence, limit = 400) {
  if (!recurrence || !isValidISODate(fromISO)) return null;

  if (recurrence.kind === 'monthly') {
    const [year, month] = fromISO.split('-').map(Number);
    const fromDay = Number(fromISO.slice(8, 10));
    let y = year;
    let m = month - 1; // zero-based
    if (fromDay >= Math.min(recurrence.monthDay, daysInMonth(y, m))) {
      m += 1;
      if (m > 11) { m = 0; y += 1; }
    }
    const day = Math.min(recurrence.monthDay, daysInMonth(y, m));
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  if (recurrence.weekdays.length === 0) return null;
  for (let i = 1; i <= limit; i += 1) {
    const candidate = addDays(fromISO, i);
    if (recurrence.weekdays.includes(weekdayIndex(candidate))) return candidate;
  }
  return null;
}

/** The first date on or after `fromISO` that the pattern lands on. */
export function firstOccurrence(fromISO, recurrence) {
  if (!recurrence || !isValidISODate(fromISO)) return null;
  if (recurrence.kind === 'weekly' && recurrence.weekdays.includes(weekdayIndex(fromISO))) return fromISO;
  if (recurrence.kind === 'monthly' && Number(fromISO.slice(8, 10)) === recurrence.monthDay) return fromISO;
  return nextOccurrence(fromISO, recurrence);
}

function ordinal(n) {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

const sameDays = (a, b) => a.length === b.length && a.every((d, i) => d === b[i]);

/** Plain language, derived from the pattern so the two cannot disagree. */
export function describeRecurrence(recurrence) {
  if (!recurrence) return 'Does not repeat';
  if (recurrence.kind === 'monthly') return `Monthly on the ${ordinal(recurrence.monthDay)}`;

  const days = recurrence.weekdays;
  if (days.length === 0) return 'Does not repeat';
  if (sameDays(days, EVERY_DAY)) return 'Every day';
  if (sameDays(days, WEEKDAYS_ONLY)) return 'Every weekday';
  if (sameDays(days, WEEKEND_ONLY)) return 'Every weekend';
  if (days.length === 1) return `Every ${WEEKDAY_LABELS[days[0]]}`;
  return `Every ${days.map((d) => WEEKDAY_LABELS[d]).join(', ')}`;
}

/**
 * Every date a pattern lands on inside a range, excluding the task's own due date
 * — that one already exists as a real record.
 *
 * These are *projections*, not stored tasks. The model keeps one record per
 * recurring task and spawns the next on completion, which avoids filling storage
 * and the calendar with rows nobody asked for; but it also means a daily task
 * would otherwise appear on exactly one day. Projecting closes that gap without
 * giving up the single-record model: the calendar can show every occurrence while
 * only one of them is a thing you can complete.
 */
export function occurrencesInRange(task, fromISO, toISO, limit = 400) {
  if (!isRecurring(task) || !isValidISODate(fromISO) || !isValidISODate(toISO)) return [];
  if (compareISO(fromISO, toISO) > 0) return [];

  // Never project before the task itself starts.
  const anchor = task.due && compareISO(task.due, fromISO) > 0 ? task.due : fromISO;

  const dates = [];
  let cursor = firstOccurrence(anchor, task.recurrence);
  for (let i = 0; cursor && i < limit; i += 1) {
    if (compareISO(cursor, toISO) > 0) break;
    if (compareISO(cursor, fromISO) >= 0 && cursor !== task.due) dates.push(cursor);
    cursor = nextOccurrence(cursor, task.recurrence);
  }
  return dates;
}

/**
 * The follow-up task created when a recurring one is completed. It carries the
 * pattern forward and starts fresh — no completion, no history — because it is a
 * new occurrence rather than a reopened one.
 */
export function nextInstance(task, from = todayISO()) {
  if (!isRecurring(task)) return null;
  const anchor = task.due && task.due > from ? task.due : from;
  const due = nextOccurrence(anchor, task.recurrence);
  if (!due) return null;
  return {
    title: task.title,
    notes: task.notes,
    due,
    priority: task.priority,
    tags: task.tags,
    recurrence: task.recurrence,
  };
}
