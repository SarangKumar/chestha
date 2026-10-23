import { todayISO } from '../dates.js';
import { xpOnDay } from './ledger.js';

/**
 * What finishing a task is worth.
 *
 * The daily cap is soft on purpose. A hard zero after the twentieth task teaches
 * people to stop ticking boxes, which would damage the task list to protect the game;
 * a small award keeps the ledger honest and the feedback alive.
 *
 * Returns a reward *input*, not an event — the ledger decides whether it is new. The
 * key is the task id alone, so a task earns exactly once in its lifetime however many
 * times it is reopened and completed again. A recurring task spawns a new task with a
 * new id when it is completed, so a daily habit still earns daily without any special
 * case here.
 */
export function taskReward(settings, ledger, task, localDay = todayISO()) {
  const bonus = settings.taskPriorityBonus[task.priority] ?? 0;
  const earnedToday = xpOnDay(ledger, localDay, 'task');
  const atCap = earnedToday >= settings.dailyTaskCapXp;
  return {
    key: `task:${task.id}`,
    source: 'task',
    xp: atCap ? settings.cappedTaskXp : settings.taskBaseXp + bonus,
    localDay,
    ref: { taskId: task.id },
    note: `Completed “${String(task.title ?? '').slice(0, 60)}”`,
  };
}
