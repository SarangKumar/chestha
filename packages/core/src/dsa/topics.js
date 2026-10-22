import { todayISO } from '../dates.js';
import { eventsFor } from './events.js';
import { topicKey } from './questions.js';

/**
 * A topic needs real evidence before it is called weak. Below this many touched
 * questions there is nothing to conclude, and saying so is more useful than a
 * confident-sounding guess from a sample of two.
 */
export const MIN_TOUCHED_FOR_VERDICT = 5;
export const LOW_CONFIDENCE_MEAN = 2.5;
export const RECENT_TOUCHES = 6;

export function topicStats(questions, events, schedules, today = todayISO()) {
  const byTopic = new Map();

  const ensure = (topic) => {
    const key = topicKey(topic);
    if (!byTopic.has(key)) {
      byTopic.set(key, {
        key, topic, total: 0, solved: 0, unsolved: 0, touched: 0,
        easy: 0, medium: 0, hard: 0,
        confidences: [], assisted: 0, rated: 0,
        revisionsCompleted: 0, lapses: 0, dueOrOverdue: 0,
      });
    }
    return byTopic.get(key);
  };

  for (const question of questions) {
    const own = eventsFor(events, question.slug);
    const solved = own.some((e) => e.kind === 'solve');
    const touched = own.length > 0;
    const schedule = schedules?.[question.slug];

    for (const topic of question.topics) {
      const row = ensure(topic);
      row.total += 1;
      if (solved) row.solved += 1; else row.unsolved += 1;
      if (touched) row.touched += 1;
      if (question.difficulty === 'Easy') row.easy += 1;
      if (question.difficulty === 'Medium') row.medium += 1;
      if (question.difficulty === 'Hard') row.hard += 1;
      for (const e of own) {
        if (e.confidence !== null) { row.confidences.push(e.confidence); row.rated += 1; }
        if (e.assisted) row.assisted += 1;
      }
      if (schedule) {
        row.revisionsCompleted += schedule.completed ?? 0;
        row.lapses += schedule.lapses ?? 0;
        if (schedule.nextDue && schedule.nextDue <= today) row.dueOrOverdue += 1;
      }
    }
  }

  return [...byTopic.values()].map((row) => {
    const recent = row.confidences.slice(-RECENT_TOUCHES);
    const meanConfidence = recent.length
      ? recent.reduce((a, b) => a + b, 0) / recent.length
      : null;
    return { ...row, meanConfidence, recentRated: recent.length };
  }).sort((a, b) => a.topic.localeCompare(b.topic));
}

/**
 * Returns a verdict plus the sentence that justifies it. An unsolved question
 * never contributes: otherwise every untouched topic reads as a diagnosis when it
 * is really just a to-do list.
 */
export function assessTopic(row) {
  if (row.touched < MIN_TOUCHED_FOR_VERDICT) {
    return {
      weak: false,
      verdict: 'insufficient-data',
      reason: `Only ${row.touched} question${row.touched === 1 ? '' : 's'} touched in ${row.topic}; at least ${MIN_TOUCHED_FOR_VERDICT} are needed before judging.`,
    };
  }

  const reasons = [];
  if (row.meanConfidence !== null && row.meanConfidence <= LOW_CONFIDENCE_MEAN) {
    reasons.push(`your last ${row.recentRated} rated touches averaged ${row.meanConfidence.toFixed(1)} confidence`);
  }
  if (row.rated > 0 && row.assisted * 2 >= row.rated) {
    reasons.push(`${row.assisted} of ${row.rated} touches needed help`);
  }
  if (row.lapses >= 2) {
    reasons.push(`${row.lapses} revisions dropped back a step`);
  }

  if (reasons.length === 0) {
    return { weak: false, verdict: 'ok', reason: `No weakness signal in ${row.topic} from ${row.touched} touched questions.` };
  }
  return {
    weak: true,
    verdict: 'weak',
    reason: `Flagged because ${reasons.join(', and ')}.`,
  };
}

/** Manual marks and dismissals always win over the automatic assessment. */
export function resolveTopicWeakness(row, topicState = {}) {
  const auto = assessTopic(row);
  const key = topicKey(row.topic);
  const manual = topicState[key];

  if (manual?.weak === true) {
    return { ...auto, weak: true, source: 'manual', reason: manual.note || `You marked ${row.topic} as weak.` };
  }
  if (manual?.dismissed === true) {
    return { ...auto, weak: false, source: 'dismissed', reason: `${auto.reason} You dismissed this assessment.` };
  }
  return { ...auto, source: auto.weak ? 'automatic' : 'none' };
}

export function weakTopics(questions, events, schedules, topicState, today = todayISO()) {
  return topicStats(questions, events, schedules, today)
    .map((row) => ({ ...row, ...resolveTopicWeakness(row, topicState) }))
    .filter((row) => row.weak);
}
