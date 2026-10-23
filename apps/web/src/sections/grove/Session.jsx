import { useEffect, useMemo, useRef, useState } from 'react';
import {
  eligibleMinutes, isComplete, isPaused, remainingMs, selectToday, sessionProgress,
  sortTasks, stageForProgress,
} from '@vistaar/core';
import { useWorkspace } from '../../app/StoreProvider.jsx';
import { Button, Panel, Select, cx } from '../../components/ui.jsx';
import { Icon } from '../../components/icons.jsx';
import { Plant, STAGE_LABELS } from '../../grove/plants.jsx';

function clock(ms) {
  const total = Math.ceil(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** The progress ring. A plain stroke-dasharray sweep — no library, no canvas. */
function Ring({ progress, children }) {
  const radius = 132;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative flex items-center justify-center">
      <svg viewBox="0 0 300 300" className="size-[17rem] max-w-full -rotate-90 sm:size-[20rem]">
        <circle cx="150" cy="150" r={radius} fill="none" stroke="currentColor" strokeWidth="2" className="text-line" />
        <circle
          cx="150" cy="150" r={radius} fill="none" strokeWidth="3" strokeLinecap="round"
          stroke="currentColor" className="text-accent transition-[stroke-dashoffset] duration-1000 ease-linear"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

export function Session() {
  const { state, actions, notify, today } = useWorkspace();
  const garden = state['grove.garden'];
  const session = state['grove.focus'].active;
  const settings = state['grove.settings'];

  const [now, setNow] = useState(() => Date.now());
  const [minutes, setMinutes] = useState(settings.focus.defaultMinutes);
  const [taskId, setTaskId] = useState('');
  const recovered = useRef(false);

  // A session left running by a closed tab or a restart is settled before anything
  // is drawn, so the screen never shows a timer that has already finished.
  useEffect(() => {
    if (recovered.current) return;
    recovered.current = true;
    const result = actions.recoverFocusSession();
    if (result) {
      notify(`Session ${result.session.outcome === 'abandoned' ? 'written off' : 'completed while you were away'} · +${result.earned.xp} XP`);
    }
  }, [actions, notify]);

  // The tick only re-renders. Elapsed time is always derived from the stored
  // timestamps, so a throttled or suspended tab cannot lose or invent a second.
  const running = Boolean(session) && !isPaused(session ?? {});
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  // Reaching zero ends the session through the same path as the End button.
  useEffect(() => {
    if (!session || !isComplete(session, now)) return;
    const result = actions.endFocusSession();
    if (result) notify(`Session complete · +${result.earned.xp} XP · ${result.earned.seeds} seeds`, { tone: 'ok' });
  }, [session, now, actions, notify]);

  const openTasks = useMemo(
    () => sortTasks(selectToday(state.tasks, today), 'due').slice(0, 20),
    [state.tasks, today],
  );

  const progress = session ? sessionProgress(session, now) : 0;
  const stage = stageForProgress(progress);
  const linkedTask = session?.taskId ? state.tasks.find((t) => t.id === session.taskId) : null;

  return (
    <div className="flex flex-col items-center">
      <Ring progress={progress}>
        <Plant speciesId={garden.selectedSpeciesId} stage={session ? stage : 'seed'} className="size-28 text-ink sm:size-32" />
        <p className="tabular mt-1 text-display font-semibold text-ink">
          {clock(session ? remainingMs(session, now) : minutes * 60 * 1000)}
        </p>
        <p className="text-meta text-ink-muted">
          {session
            ? (isPaused(session) ? 'Paused' : `${STAGE_LABELS[stage]} · ${session.plannedMinutes} min`)
            : 'Ready when you are'}
        </p>
      </Ring>

      {session ? (
        <div className="mt-6 flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            {isPaused(session) ? (
              <Button onClick={actions.resumeFocusSession}><Icon name="play" className="size-4" /> Resume</Button>
            ) : (
              <Button tone="quiet" onClick={actions.pauseFocusSession}><Icon name="pause" className="size-4" /> Pause</Button>
            )}
            <Button
              tone="quiet"
              onClick={() => {
                const result = actions.endFocusSession();
                if (result) {
                  notify(`Ended early · +${result.earned.xp} XP · your plant stays ${STAGE_LABELS[result.stage].toLowerCase()}`, {
                    tone: 'neutral',
                  });
                }
              }}
            >
              <Icon name="stop" className="size-4" /> End
            </Button>
          </div>
          {linkedTask && (
            <p className="text-meta text-ink-faint">Working on “{linkedTask.title}”</p>
          )}
          <p className="max-w-sm text-center text-[10px] leading-relaxed text-ink-faint">
            This counts the time you said was focus. It is elapsed time, not a measure of
            attention — nothing here is watching you.
          </p>
        </div>
      ) : (
        <div className="mt-6 flex w-full max-w-sm flex-col items-center gap-3">
          <div role="group" aria-label="Session length" className="flex flex-wrap justify-center gap-1 rounded-card border border-line bg-surface p-1 shadow-card">
            {settings.focus.options.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={minutes === option}
                onClick={() => setMinutes(option)}
                className={cx(
                  'rounded-chip px-3 py-1.5 text-sm font-medium transition-colors duration-150',
                  minutes === option ? 'bg-accent-soft text-ink' : 'text-ink-muted hover:bg-hover hover:text-ink',
                )}
              >
                {option} min
              </button>
            ))}
          </div>

          {openTasks.length > 0 && (
            <Select
              size="sm"
              aria-label="Link this session to a task"
              value={taskId}
              onChange={(event) => setTaskId(event.target.value)}
            >
              <option value="">No particular task</option>
              {openTasks.map((task) => (
                <option key={task.id} value={task.id}>{task.title}</option>
              ))}
            </Select>
          )}

          <Button
            onClick={() => {
              setNow(Date.now());
              actions.startFocusSession({ plannedMinutes: minutes, taskId: taskId || null });
            }}
          >
            <Icon name="play" className="size-4" /> Start {minutes} minutes
          </Button>
        </div>
      )}

      <Recent sessions={state['grove.focus'].sessions} />
    </div>
  );
}

function Recent({ sessions }) {
  const recent = [...sessions].slice(-5).reverse();
  if (recent.length === 0) return null;
  return (
    <Panel className="mt-8 w-full p-4">
      <h2 className="mb-2 text-card font-medium text-ink">Recent sessions</h2>
      <ul className="divide-y divide-line">
        {recent.map((session) => (
          <li key={session.id} className="flex items-center justify-between py-2 text-sm">
            <span className="text-ink-muted">
              {new Date(session.startedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
              {' · '}
              {eligibleMinutes(session, Date.parse(session.endedAt ?? session.startedAt))} of {session.plannedMinutes} min
            </span>
            <span className="text-meta text-ink-faint">
              {session.outcome === 'ended-early' ? 'ended early'
                : session.outcome === 'abandoned' ? 'written off'
                  : 'completed'}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
