import { useMemo } from 'react';
import {
  DIFFICULTIES, buildRows, difficultyProgress, goalState, listProgress, revisionState,
} from '@kalpvan/core';
import { useWorkspace } from '../../app/StoreProvider.jsx';
import { Badge, Button, CardTitle, EmptyState, Meter, Panel, Stat } from '../../components/ui.jsx';

/**
 * A daily action dashboard, not an analytics page: two targets, then what is due,
 * then what to do next. Charts and history live elsewhere.
 */
export function DsaHome({ onChangeTab }) {
  const { state, today, actions } = useWorkspace();
  const progress = state['dsa.progress'];
  const settings = state['dsa.settings'];
  const questions = state['dsa.library'].questions;

  const goals = useMemo(
    () => goalState(progress.events, settings, today),
    [progress.events, settings, today],
  );

  const { due, overdue } = useMemo(() => {
    const result = { due: [], overdue: [] };
    for (const [slug, schedule] of Object.entries(progress.schedules)) {
      const state = revisionState(schedule, today);
      if (state === 'due') result.due.push(slug);
      if (state === 'overdue') result.overdue.push(slug);
    }
    return result;
  }, [progress.schedules, today]);

  const libraryEmpty = questions.length === 0;

  // The progress panel below reads the same derived rows the library does, so
  // the two can never disagree about what is solved.
  const rows = useMemo(() => buildRows({
    questions,
    events: progress.events,
    schedules: progress.schedules,
    questionState: progress.questionState,
    curatedMemberships: state['dsa.library'].curatedMemberships,
  }, today), [questions, progress, state, today]);

  const byDifficulty = useMemo(() => difficultyProgress(rows), [rows]);
  const sheets = useMemo(
    () => listProgress(rows, state['dsa.library'].curatedLists).sort((a, b) => b.total - a.total),
    [rows, state],
  );
  const solvedTotal = rows.filter((r) => r.state.progress === 'solved').length;
  const totalEvents = progress.events.filter((e) => e.kind === 'solve').length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        <Panel className="p-4">
          <CardTitle className="mb-2.5">New questions today</CardTitle>
          <Stat
            value={`${goals.newSolved}/${goals.newTarget}`}
            label={goals.newMet ? 'target met' : 'to go'}
            tone={goals.newMet ? 'ok' : 'default'}
            meter={{ value: goals.newSolved, max: Math.max(1, goals.newTarget), label: 'New-question target', tone: goals.newMet ? 'ok' : 'default' }}
          />
          <p className="mt-2 text-meta text-ink-faint">
            Counted on the day a question is first solved — repeat solves never count again.
          </p>
        </Panel>

        <Panel className="p-4">
          <CardTitle className="mb-2.5">Revisions today</CardTitle>
          <Stat
            value={`${goals.revisionsDone}/${goals.revisionTarget}`}
            label={goals.revisionMet ? 'target met' : 'to go'}
            tone={goals.revisionMet ? 'ok' : 'default'}
            meter={{ value: goals.revisionsDone, max: Math.max(1, goals.revisionTarget), label: 'Revision target', tone: goals.revisionMet ? 'ok' : 'default' }}
          />
          <p className="mt-2 text-meta text-ink-faint">
            Independent of the new-question target. Completing a revision never counts as a new solve.
          </p>
        </Panel>
      </div>

      <Panel className="p-4">
        <CardTitle className="mb-2.5">Revision queue</CardTitle>
        {overdue.length === 0 && due.length === 0 ? (
          <p className="text-sm text-ink-muted">
            {libraryEmpty
              ? 'Nothing scheduled yet — revisions appear here once you record a solve.'
              : 'Nothing due today.'}
          </p>
        ) : (
          <div className="flex gap-6">
            <Stat value={overdue.length} label="overdue" tone={overdue.length ? 'danger' : 'muted'} />
            <Stat value={due.length} label="due today" />
          </div>
        )}
      </Panel>

      {libraryEmpty && (
        <EmptyState
          title="Your question library is empty"
          description="No questions ship with the app. Add them by pasting LeetCode URLs, or import a data pack."
          action={<Button size="sm" tone="primary" onClick={() => onChangeTab('library')}>Open the library</Button>}
        />
      )}

      {!libraryEmpty && (
        <>
          <Panel className="p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <CardTitle>Progress</CardTitle>
              <p className="text-meta text-ink-faint">
                {solvedTotal} unique solved · {totalEvents} solving event{totalEvents === 1 ? '' : 's'}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {DIFFICULTIES.map((level) => {
                const { solved, total } = byDifficulty[level];
                return (
                  <div key={level}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-2">
                      <span className="text-meta font-medium text-ink">{level}</span>
                      <span className="tabular text-meta text-ink-faint">{solved}/{total}</span>
                    </div>
                    <Meter
                      value={solved}
                      max={Math.max(1, total)}
                      label={`${level}: ${solved} of ${total} solved`}
                      tone={level === 'Hard' ? 'danger' : 'default'}
                    />
                  </div>
                );
              })}
            </div>
          </Panel>

          {sheets.length > 0 && (
            <Panel className="overflow-hidden">
              <div className="border-b border-line px-4 py-3">
                <CardTitle>Sheet completion</CardTitle>
              </div>
              <ul className="divide-y divide-line">
                {sheets.map(({ list, total, solved }) => (
                  <li key={list.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onChangeTab('library')}
                      className="min-w-0 flex-1 truncate text-left text-sm text-ink underline-offset-2 hover:underline"
                    >
                      {list.name}
                    </button>
                    <span className="tabular shrink-0 text-meta text-ink-faint">
                      {solved}/{total}
                    </span>
                    <div className="w-full sm:w-40">
                      <Meter value={solved} max={Math.max(1, total)} label={`${list.name}: ${solved} of ${total}`} />
                    </div>
                    {total > 0 && solved === total && <Badge tone="ok">Complete</Badge>}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}

      <Panel className="p-4">
        <CardTitle className="mb-2.5">Daily targets</CardTitle>
        <div className="flex flex-wrap items-center gap-4">
          <TargetControl
            label="New questions"
            value={settings.dailyNewTarget}
            onChange={(value) => actions.setDsaSetting('dailyNewTarget', value)}
          />
          <TargetControl
            label="Revisions"
            value={settings.dailyRevisionTarget}
            onChange={(value) => actions.setDsaSetting('dailyRevisionTarget', value)}
          />
        </div>
      </Panel>
    </div>
  );
}

function TargetControl({ label, value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-meta text-ink-muted">{label}</span>
      <div className="flex items-center gap-1">
        <Button size="sm" aria-label={`Decrease ${label} target`} onClick={() => onChange(Math.max(0, value - 1))}>
          −
        </Button>
        <span className="tabular w-7 text-center text-sm font-semibold text-ink">{value}</span>
        <Button size="sm" aria-label={`Increase ${label} target`} onClick={() => onChange(value + 1)}>
          +
        </Button>
      </div>
    </div>
  );
}
