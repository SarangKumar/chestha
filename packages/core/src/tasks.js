import { newId } from './ids.js';
import { compareISO, isValidISODate, todayISO } from './dates.js';

export const PRIORITIES = ['none', 'low', 'medium', 'high'];
const PRIORITY_RANK = { high: 0, medium: 1, low: 2, none: 3 };

export function createTask(input = {}) {
  const now = new Date().toISOString();
  return {
    id: newId('task'),
    title: String(input.title ?? '').trim(),
    notes: String(input.notes ?? ''),
    due: isValidISODate(input.due) ? input.due : null,
    priority: PRIORITIES.includes(input.priority) ? input.priority : 'none',
    tags: normalizeTags(input.tags),
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeTag(tag) {
  return String(tag ?? '').trim().replace(/\s+/g, ' ');
}

export function tagKey(tag) {
  return normalizeTag(tag).toLowerCase();
}

// Tags match case-insensitively but keep the casing they were first typed with.
export function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of tags) {
    const tag = normalizeTag(raw);
    if (!tag) continue;
    const key = tagKey(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

export function isCompleted(task) {
  return Boolean(task.completedAt);
}

// A completed task is never overdue, whenever it was finished.
export function isOverdue(task, today = todayISO()) {
  return !isCompleted(task) && Boolean(task.due) && compareISO(task.due, today) < 0;
}

export function isDueToday(task, today = todayISO()) {
  return !isCompleted(task) && task.due === today;
}

/**
 * Exactly one bucket per task. The open buckets partition every open task,
 * so nothing can be invisible in all views.
 */
export function classify(task, today = todayISO(), horizonDays = 7) {
  if (isCompleted(task)) return 'completed';
  if (!task.due) return 'nodate';
  const cmp = compareISO(task.due, today);
  if (cmp < 0) return 'overdue';
  if (cmp === 0) return 'today';
  const limit = addHorizon(today, horizonDays);
  return compareISO(task.due, limit) <= 0 ? 'upcoming' : 'later';
}

function addHorizon(today, horizonDays) {
  const [y, m, d] = today.split('-').map(Number);
  const date = new Date(y, m - 1, d + Math.max(1, horizonDays), 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Today deliberately includes everything overdue: an overdue task is today's problem.
export function selectToday(tasks, today = todayISO()) {
  return tasks.filter((t) => isDueToday(t, today) || isOverdue(t, today));
}

export function selectOverdue(tasks, today = todayISO()) {
  return tasks.filter((t) => isOverdue(t, today));
}

export function selectUpcoming(tasks, today = todayISO(), horizonDays = 7) {
  return tasks.filter((t) => classify(t, today, horizonDays) === 'upcoming');
}

export function selectNoDate(tasks) {
  return tasks.filter((t) => !isCompleted(t) && !t.due);
}

export function selectCompleted(tasks) {
  return tasks.filter(isCompleted);
}

// completedAt is an instant; views group it by the local calendar day it fell in.
export function completedLocalDay(task) {
  if (!task.completedAt) return null;
  const d = new Date(task.completedAt);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function selectCompletedOn(tasks, iso) {
  return tasks.filter((t) => completedLocalDay(t) === iso);
}

export function selectDueOn(tasks, iso) {
  return tasks.filter((t) => t.due === iso);
}

export const SORTS = {
  due: 'Due date',
  priority: 'Priority',
  created: 'Recently added',
  title: 'Title',
};

export function sortTasks(tasks, sort = 'due') {
  const list = [...tasks];
  const byTitle = (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  const byDue = (a, b) => {
    if (a.due === b.due) return 0;
    if (!a.due) return 1; // undated sinks to the bottom rather than disappearing
    if (!b.due) return -1;
    return compareISO(a.due, b.due);
  };
  const byPriority = (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  const byCreated = (a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);

  const comparators = {
    due: [byDue, byPriority, byTitle],
    priority: [byPriority, byDue, byTitle],
    created: [byCreated, byTitle],
    title: [byTitle, byDue],
  }[sort] ?? [byDue, byPriority, byTitle];

  return list.sort((a, b) => {
    for (const cmp of comparators) {
      const result = cmp(a, b);
      if (result !== 0) return result;
    }
    return 0;
  });
}

// Completed items sink but stay in place within a list, so undo stays obvious.
export function sortWithCompletedLast(tasks, sort = 'due') {
  const open = sortTasks(tasks.filter((t) => !isCompleted(t)), sort);
  const done = tasks
    .filter(isCompleted)
    .sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1));
  return [...open, ...done];
}

export function matchesQuery(task, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    task.title.toLowerCase().includes(q) ||
    task.notes.toLowerCase().includes(q) ||
    task.tags.some((tag) => tag.toLowerCase().includes(q))
  );
}
