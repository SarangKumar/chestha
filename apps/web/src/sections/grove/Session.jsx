import { useEffect, useMemo, useState } from 'react';
import {
  eligibleMinutes, isComplete, isPaused, pickForDay, remainingMs, selectToday,
  sessionProgress, sortTasks, stageForProgress, todayISO,
} from '@vistaar/core';
import { useWorkspace } from '../../app/StoreProvider.jsx';
import { Button, Panel, Select, cx } from '../../components/ui.jsx';
import { Icon } from '../../components/icons.jsx';
import { Plant, STAGE_LABELS } from '../../grove/plants.jsx';
import { environmentOf } from '../../grove/decor.jsx';
import {
  pauseSessionSound, resumeSessionSound, startSessionSound, stopSessionSound,
} from '../../grove/sessionSound.js';

const QUOTES = [
  'Small steps create big changes.',
  'Grow your focus, one session at a time.',
  'Patience is a kind of courage.',
  'The forest was planted one seed at a time.',
  'Stay with the work a little longer.',
];

function clock(ms) {
  const total = Math.ceil(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function Session() {
  const { state, actions, notify, today } = useWorkspace();
  const garden = state['grove.garden'];
  const settings = state['grove.settings'];
  const session = state['grove.focus'].active;
  const environment = environmentOf(garden.environmentId);
  const quote = pickForDay(QUOTES, todayISO());

  const settle = (result, message, tone = 'neutral') => {
    if (!result) return;
    stopSessionSound({ chime: settings.chimeOnComplete });
    notify(message(result), { tone });
  };

  const [now, setNow] = useState(() => Date.now());
  const [minutes, setMinutes] = useState(settings.focus.defaultMinutes);
  const [taskId, setTaskId] = useState('');

  const running = Boolean(session) && !isPaused(session ?? {});
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!session || !isComplete(session, now)) return;
    settle(
      actions.endFocusSession(),
      (r) => `Session complete · +${r.earned.xp} XP · ${r.earned.seeds} seeds`,
      'ok',
    );
  }, [session, now, actions]);

  const openTasks = useMemo(
    () => sortTasks(selectToday(state.tasks, today), 'due').slice(0, 20),
    [state.tasks, today],
  );

  const progress = session ? sessionProgress(session, now) : 0;
  const stage = stageForProgress(progress);
  const linkedTask = session?.taskId ? state.tasks.find((t) => t.id === session.taskId) : null;
  const displayMs = session ? remainingMs(session, now) : minutes * 60 * 1000;

  return (
    <div className="flex flex-col gap-4">
      {/* Immersive focus stage — Forest-inspired: plant hero, soft environment wash. */}
      <div
        className="relative isolate flex min-h-[28rem] flex-col items-center overflow-hidden rounded-panel border border-line bg-inset px-4 pb-5 pt-8 sm:min-h-[32rem] sm:px-8 sm:pb-6 sm:pt-10"
      >
        <div className="pointer-events-none absolute inset-0" style={{ background: environment.sky }} aria-hidden="true" />
        <div className="pointer-events-none absolute inset-0" style={{ background: environment.haze }} aria-hidden="true" />
        {/* Soft ground so the plant has soil to stand in. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[-10%] bottom-0 h-[42%] rounded-[50%] bg-ink/[0.06]"
        />

        <div className="relative z-[1] flex flex-1 flex-col items-center justify-center">
          <Plant
            speciesId={garden.selectedSpeciesId}
            stage={session ? stage : 'sprout'}
            className="size-40 text-ink drop-shadow-sm sm:size-52"
          />
          <p className="tabular mt-3 text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
            {clock(displayMs)}
          </p>
          <p className="mt-1.5 text-sm font-medium text-ink">
            {session
              ? (isPaused(session) ? 'Paused' : 'Focus session')
              : 'Focus Garden'}
          </p>
          <p className="text-meta text-ink-muted">
            {session
              ? `${STAGE_LABELS[stage]} · ${session.plannedMinutes} min`
              : `Ready · ${minutes} min`}
          </p>
          {linkedTask && (
            <p className="mt-2 max-w-sm truncate text-center text-meta text-ink-faint">
              Working on “{linkedTask.title}”
            </p>
          )}
        </div>

        {session ? (
          <div className="relative z-[1] mt-4 flex w-full max-w-lg flex-col items-center gap-4">
            <div className="flex items-center gap-1 rounded-full border border-line bg-overlay/90 p-1 shadow-overlay backdrop-blur">
              {isPaused(session) ? (
                <Button
                  size="sm"
                  className="rounded-full"
                  onClick={() => { actions.resumeFocusSession(); resumeSessionSound(); }}
                >
                  <Icon name="play" className="size-4" /> Resume
                </Button>
              ) : (
                <Button
                  size="sm"
                  tone="quiet"
                  className="rounded-full"
                  onClick={() => { actions.pauseFocusSession(); pauseSessionSound(); }}
                >
                  <Icon name="pause" className="size-4" /> Pause
                </Button>
              )}
              <Button
                size="sm"
                tone="quiet"
                className="rounded-full"
                onClick={() => settle(
                  actions.endFocusSession(),
                  (r) => `Ended early · +${r.earned.xp} XP · your plant stays ${STAGE_LABELS[r.stage].toLowerCase()}`,
                )}
              >
                <Icon name="stop" className="size-4" /> End
              </Button>
            </div>

            <div className="flex w-full items-end justify-between gap-4 px-1">
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-ink-faint">
                  {isPaused(session) ? 'Paused' : 'Growing…'}
                </p>
                <div
                  className="h-1.5 w-full max-w-[12rem] overflow-hidden rounded-full bg-overlay/80"
                  role="progressbar"
                  aria-valuenow={Math.round(progress * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Session progress"
                >
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-1000 ease-linear"
                    style={{ width: `${Math.min(100, progress * 100)}%` }}
                  />
                </div>
              </div>
              <p className="flex max-w-[14rem] items-start gap-1.5 text-right text-[10px] leading-snug text-ink-faint">
                <Icon name="leaf" className="mt-0.5 size-3.5 shrink-0 opacity-70" />
                <span>{quote}</span>
              </p>
            </div>
          </div>
        ) : (
          <div className="relative z-[1] mt-4 flex w-full max-w-sm flex-col items-center gap-3">
            <div
              role="group"
              aria-label="Session length"
              className="flex flex-wrap justify-center gap-1 rounded-full border border-line bg-overlay/90 p-1 shadow-card backdrop-blur"
            >
              {settings.focus.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={minutes === option}
                  onClick={() => setMinutes(option)}
                  className={cx(
                    'rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-150',
                    minutes === option ? 'bg-accent text-on-accent' : 'text-ink-muted hover:bg-hover hover:text-ink',
                  )}
                >
                  {option}m
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
                const preset = state.sound.presets.find((p) => p.id === settings.soundMixId);
                if (preset) startSessionSound(preset, state.sound.masterVolume);
              }}
            >
              <Icon name="play" className="size-4" /> Start session
            </Button>
            <p className="max-w-sm text-center text-[10px] leading-relaxed text-ink-faint">
              Counts the time you set aside. Nothing here watches you.
            </p>
          </div>
        )}
      </div>

      <Recent sessions={state['grove.focus'].sessions} />
    </div>
  );
}

function Recent({ sessions }) {
  const recent = [...sessions].slice(-5).reverse();
  if (recent.length === 0) return null;
  return (
    <Panel className="w-full p-4">
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
