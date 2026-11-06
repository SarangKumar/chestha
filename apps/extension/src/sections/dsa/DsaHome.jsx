import { useMemo, useState } from 'react';
import {
  DIFFICULTIES, buildRows, difficultyProgress, goalState, isCompanyList, listProgress,
  revisionState,
} from '@chestha/core';
import { useWorkspace } from '../../app/StoreProvider.jsx';
import { Badge, Button, CardTitle, EmptyState, Meter, Panel, Stat, cx } from '../../components/ui.jsx';
import { Icon } from '../../components/icons.jsx';
import { ROW_PX, VirtualQuestionList } from './QuestionList.jsx';

/**
 * A daily action dashboard, not an analytics page: two targets, then what is due,
 * then what to do next. Charts and history live elsewhere.
 */
/** Tall enough to read, short enough that the page below stays reachable. */
const SHEET_VIEW_PX = 15 * ROW_PX;

export function DsaHome({ onChangeTab }) {
  const { state, today, actions } = useWorkspace();
  const [openSheet, setOpenSheet] = useState(null);
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
  /**
   * Sheets only. Company lists are curated lists too, so this panel listed all
   * 422 of them under "Sheet completion" once the company pack was imported —
   * burying the ten sheets it exists for. Who asks a question has its own tab.
   */
  const sheets = useMemo(
    () => listProgress(
      rows,
      state['dsa.library'].curatedLists.filter((list) => !isCompanyList(list.id)),
    ).sort((a, b) => b.total - a.total),
    [rows, state],
  );

  const sheetNames = useMemo(
    () => new Map(state['dsa.library'].curatedLists.map((l) => [l.id, l.name])),
    [state],
  );

  /**
   * The open sheet's questions, in the sheet's own order.
   *
   * Upstream order is the sheet's argument — Blind 75 is a sequence, not a set
   * — so it is kept rather than re-sorted, with anything unordered falling to
   * the end by title. Only the open sheet is built: doing all of them would be
   * one pass over the library per sheet on every render.
   */
  const openRows = useMemo(() => {
    if (!openSheet) return [];
    const order = new Map();
    for (const m of state['dsa.library'].curatedMemberships) {
      if (m.listId === openSheet) order.set(m.slug, m.order ?? Number.MAX_SAFE_INTEGER);
    }
    return rows
      .filter((r) => r.frequency.listIds.includes(openSheet))
      .sort((a, b) => (order.get(a.question.slug) ?? Number.MAX_SAFE_INTEGER)
        - (order.get(b.question.slug) ?? Number.MAX_SAFE_INTEGER)
        || a.question.title.localeCompare(b.question.title));
  }, [openSheet, rows, state]);
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
              {/* A sheet opens where it stands, rather than sending you to the
                  Library and leaving you to filter back to it. The rows are
                  the Library's own — same badges, same actions, same window —
                  because two renderings of a question would eventually
                  disagree about what it says. */}
              <ul className="divide-y divide-line">
                {sheets.map(({ list, total, solved }) => {
                  const open = openSheet === list.id;
                  return (
                    <li key={list.id}>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setOpenSheet(open ? null : list.id)}
                          aria-expanded={open}
                          title={open ? `Hide ${list.name}` : `Show the questions in ${list.name}`}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm text-ink"
                        >
                          <Icon
                            name="chevronDown"
                            className={cx(
                              'size-4 shrink-0 text-ink-faint transition-transform duration-150',
                              !open && '-rotate-90',
                            )}
                          />
                          <span className="min-w-0 truncate underline-offset-2 hover:underline">{list.name}</span>
                        </button>
                        <span className="tabular shrink-0 text-meta text-ink-faint">
                          {solved}/{total}
                        </span>
                        <div className="w-full sm:w-40">
                          <Meter value={solved} max={Math.max(1, total)} label={`${list.name}: ${solved} of ${total}`} />
                        </div>
                        {total > 0 && solved === total && <Badge tone="ok">Complete</Badge>}
                      </div>

                      {open && (
                        openRows.length === 0 ? (
                          <p className="border-t border-line px-4 py-3 text-meta text-ink-muted">
                            This sheet names questions your library does not have yet.
                          </p>
                        ) : (
                          <VirtualQuestionList
                            as="div"
                            rows={openRows}
                            sheetNames={sheetNames}
                            activeSheet={list.id}
                            height={Math.min(openRows.length * ROW_PX, SHEET_VIEW_PX)}
                            // No filter to drive from here, so the chips are
                            // labels: `QuestionList` renders them inert when no
                            // handler is given.
                          />
                        )
                      )}
                    </li>
                  );
                })}
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
