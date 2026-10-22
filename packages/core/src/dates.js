// Dates in Vistaar are plain local calendar dates: 'YYYY-MM-DD'.
// There is no time component and no timezone. A task due Thursday is due
// Thursday wherever the user is, so no conversion ever happens.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidISODate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const probe = new Date(y, m - 1, d, 12);
  return probe.getFullYear() === y && probe.getMonth() === m - 1 && probe.getDate() === d;
}

// Local noon keeps arithmetic clear of DST transitions at midnight.
function localNoon(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

export function toISODate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayISO(now = new Date()) {
  return toISODate(now);
}

export function addDays(iso, days) {
  const date = localNoon(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

export function addMonths(iso, months) {
  const [y, m] = iso.split('-').map(Number);
  const date = new Date(y, m - 1 + months, 1, 12);
  return toISODate(date);
}

export function compareISO(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function daysBetween(fromISO, toISO) {
  const ms = localNoon(toISO) - localNoon(fromISO);
  return Math.round(ms / 86400000);
}

export function weekdayIndex(iso) {
  return localNoon(iso).getDay();
}

export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function monthLabel(iso) {
  const [y, m] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function startOfMonth(iso) {
  return `${iso.slice(0, 7)}-01`;
}

export function isSameMonth(a, b) {
  return a.slice(0, 7) === b.slice(0, 7);
}

// Six rows of seven days, always, so the grid never changes height between months.
export function monthGrid(iso, weekStartsOn = 0) {
  const first = startOfMonth(iso);
  const lead = (weekdayIndex(first) - weekStartsOn + 7) % 7;
  const start = addDays(first, -lead);
  const weeks = [];
  for (let w = 0; w < 6; w += 1) {
    const week = [];
    for (let d = 0; d < 7; d += 1) {
      week.push(addDays(start, w * 7 + d));
    }
    weeks.push(week);
  }
  return weeks;
}

export function orderedWeekdays(weekStartsOn = 0) {
  return Array.from({ length: 7 }, (_, i) => WEEKDAYS_SHORT[(i + weekStartsOn) % 7]);
}

export function formatDate(iso) {
  const date = localNoon(iso);
  return `${WEEKDAYS_SHORT[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()].slice(0, 3)}`;
}

export function formatLongDate(iso) {
  const date = localNoon(iso);
  return `${WEEKDAYS_SHORT[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

// Relative where it reads better than a date, absolute otherwise.
export function formatDueDate(iso, today = todayISO()) {
  const delta = daysBetween(today, iso);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  if (delta === -1) return 'Yesterday';
  if (delta < -1 && delta >= -6) return `${-delta} days ago`;
  if (delta > 1 && delta <= 6) return formatDate(iso);
  return formatDate(iso);
}

// Milliseconds until the next local midnight, used to re-classify an open session.
export function msUntilNextLocalMidnight(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 500);
  return Math.max(1000, next - now);
}
