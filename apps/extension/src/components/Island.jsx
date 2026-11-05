import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  MONTHS,
  WEEKDAYS_SHORT,
  activeSoundIds,
  addDays,
  clampVolume,
  createPreset,
  isCompleted,
  isSectionAllowed,
  matchingPreset,
  selectOverdue,
  selectToday,
  weekdayIndex,
} from '@chestha/core';
import * as engine from '../audio/engine.js';
import { useWorkspace } from '../app/StoreProvider.jsx';
import { useSession } from '../app/useSession.js';
import { useSoundCatalogue } from '../app/useSoundCatalogue.js';
import { Icon } from './icons.jsx';
import { cx } from './ui.jsx';

/**
 * The island: a notch hanging from the top edge of the workspace.
 *
 * Modelled on a macOS notch utility — a black bar centred on the top edge that
 * sits over whatever is behind it, collapsed to a pill until you point at it,
 * then widening into three regions: what is playing on the left, the date and
 * what is due in the middle, and a progress ring on the right.
 *
 * Three things about it are decisions rather than details:
 *
 *  - **It is scoped to the workspace**, not to every tab you browse. An island
 *    over arbitrary pages needs a content script on `<all_urls>`, which would
 *    retract the "no host permission and no content script" promise in
 *    `scripts/extension/background.js` that the Grove's privacy claim rests on,
 *    and playback would have to move to an offscreen document first — audio
 *    lives in this page's AudioContext and stops when the tab closes. Both are
 *    deliberate separate decisions, not consequences of adding an island.
 *  - **It appears only when it has something to say.** No mix playing and
 *    nothing due today means no island, rather than an empty bar permanently
 *    covering the top of the board. The same rule the rail follows for gated
 *    sections applies here: a signed-out visitor sees the parts they can use,
 *    and `unknown` is not signed out, so an offline install is not stripped.
 *  - **It is chrome, so it keeps out of the way.** Collapsed it is a pill;
 *    it expands on hover *and* on focus, so it is reachable from the keyboard,
 *    and Escape closes it. It never traps focus and never steals it.
 *
 * The surface follows the theme rather than being hardcoded black. In dark —
 * the mode this system is designed for — `bg-canvas` is near-black and reads
 * exactly like the reference; in light it is a pale bar, which is the right
 * answer for a light theme and the only one the token rules allow.
 */
export function Island({ onNavigate }) {
  const { state, today, actions } = useWorkspace();
  const { session } = useSession();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);

  const soundsAllowed = isSectionAllowed('sounds', session.state);
  const tasksAllowed = isSectionAllowed('tasks', session.state);

  const mix = state.sound.lastMix ?? {};
  const mixSize = Object.keys(mix).length;

  const pending = useMemo(() => {
    if (!tasksAllowed) return [];
    const due = [...selectOverdue(state.tasks, today), ...selectToday(state.tasks, today)];
    return due.filter((task) => !isCompleted(task));
  }, [tasksAllowed, state.tasks, today]);

  const doneToday = useMemo(() => {
    if (!tasksAllowed) return 0;
    return selectToday(state.tasks, today).filter(isCompleted).length;
  }, [tasksAllowed, state.tasks, today]);

  const hasSound = soundsAllowed && mixSize > 0;
  const hasTasks = tasksAllowed && (pending.length > 0 || doneToday > 0);
  if (!hasSound && !hasTasks) return null;

  const expanded = open || pinned;

  return (
    <div
      // The wrapper spans the width so the notch is centred on the viewport
      // rather than on the content column, which the nav rail offsets.
      //
      // Hidden below `sm`: there is no room for it. The phone header already
      // carries the title, the command button, Add task and the theme picker
      // across the same strip, and a notch over them would cover a control
      // rather than add one.
      className="pointer-events-none fixed inset-x-0 top-0 z-30 hidden justify-center print:hidden sm:flex"
    >
      <div
        className="pointer-events-auto"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocusCapture={() => setOpen(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          setPinned(false);
          setOpen(false);
          event.currentTarget.querySelector('button')?.focus();
        }}
      >
        <div
          className={cx(
            // Square at the top, deeply rounded at the bottom: the shape of a
            // notch hanging off the edge of the screen.
            'overflow-hidden rounded-b-[1.75rem] border border-t-0 border-line bg-canvas/95 shadow-overlay backdrop-blur-xl',
            'transition-[width,height] duration-200 ease-out',
          )}
        >
          {expanded ? (
            <ExpandedIsland
              mix={mix}
              hasSound={hasSound}
              hasTasks={hasTasks}
              pending={pending}
              doneToday={doneToday}
              today={today}
              pinned={pinned}
              onPin={() => setPinned((value) => !value)}
              onNavigate={onNavigate}
              onComplete={(id) => actions.setCompleted(id, true)}
            />
          ) : (
            <CollapsedIsland
              hasSound={hasSound}
              pendingCount={pending.length}
              onOpen={() => setPinned(true)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** The resting state: a pill wide enough to say what is playing and what is due. */
function CollapsedIsland({ hasSound, pendingCount, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-expanded="false"
      className="flex h-8 items-center gap-2.5 px-4 text-ink"
    >
      {hasSound ? <Equalizer /> : <Icon name="tasks" className="size-3.5 text-ink-muted" />}
      <span className="text-meta font-medium">
        {hasSound ? 'Playing' : 'Today'}
      </span>
      {pendingCount > 0 && (
        <span className="tabular rounded-full bg-accent-soft px-1.5 text-[10px] font-semibold text-accent-ink">
          {pendingCount}
        </span>
      )}
    </button>
  );
}

/**
 * The open state. Three regions on one row, each hidden when its half of the
 * island has nothing in it — the layout survives a mix with no tasks and tasks
 * with no mix, which are both ordinary.
 */
function ExpandedIsland({
  mix, hasSound, hasTasks, pending, doneToday, today, pinned, onPin, onNavigate, onComplete,
}) {
  return (
    <div className="w-[min(94vw,46rem)] px-4 pb-4 pt-2">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] font-semibold tracking-wide text-ink">
          Chestha
        </span>
        <button
          type="button"
          onClick={onPin}
          aria-pressed={pinned}
          className={cx(
            'rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors duration-150',
            pinned ? 'bg-accent-soft text-accent-ink' : 'text-ink-faint hover:text-ink',
          )}
        >
          {pinned ? 'Pinned' : 'Pin'}
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => onNavigate(hasSound ? 'sounds' : 'tasks')}
          className="rounded-control p-1 text-ink-faint transition-colors duration-150 hover:text-ink"
          aria-label={hasSound ? 'Open Sounds' : 'Open Tasks'}
        >
          <Icon name="settings" className="size-4" />
        </button>
      </div>

      <div className="flex items-stretch gap-4">
        {hasSound && <NowPlaying mix={mix} />}
        {hasSound && hasTasks && <span aria-hidden className="w-px shrink-0 bg-line" />}
        {hasTasks && (
          <>
            <DayStrip today={today} pending={pending} onComplete={onComplete} onNavigate={onNavigate} />
            <DayRing done={doneToday} pending={pending.length} />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * What is playing, and the controls for it.
 *
 * The catalogue hook lives here rather than in `Island` on purpose: it reads
 * the uploaded-track store, which opens IndexedDB, and nothing should pay that
 * on every page when no mix is playing. This subtree only mounts when one is.
 *
 * There are no previous/next controls, unlike the reference: the engine plays a
 * *mix*, not a queue, so there is nothing to skip to. Inventing buttons that
 * could only do nothing would be worse than leaving the row short.
 */
function NowPlaying({ mix }) {
  const { state, actions, notify } = useWorkspace();
  const sound = state.sound;
  const catalogue = useSoundCatalogue();
  const audio = useSyncExternalStore(engine.subscribe, engine.getEngineState);
  const [naming, setNaming] = useState(null);

  const knownIds = useMemo(() => catalogue.map((item) => item.id), [catalogue]);
  const active = activeSoundIds(mix, knownIds);
  const sounds = active.map((id) => catalogue.find((item) => item.id === id)).filter(Boolean);
  const saved = matchingPreset(sound.presets, mix, knownIds);
  const single = sounds.length === 1 ? sounds[0] : null;
  const streaming = sounds.some((item) => item.stream);
  const playing = audio.running && active.length > 0;
  const loop = sound.loop !== false;

  const title = single ? single.name : saved?.name ?? 'Unsaved mix';
  const subtitle = single
    ? single.group
    : `${sounds.length} sound${sounds.length === 1 ? '' : 's'}`;
  const credit = single ? single.credit : sounds.map((item) => item.name).join(' · ');

  // The engine's repeat flag is module state and resets on reload, so the
  // stored preference is pushed into it whenever this mounts or it changes.
  // Sounds.jsx does the same, because playback can start from either place.
  useEffect(() => { engine.setLoopTracks(loop); }, [loop]);

  const toggle = async () => {
    if (playing) { await engine.pause(); return; }
    engine.setCatalogue(catalogue);
    const ok = await engine.ensureContext();
    if (!ok) { notify('The browser blocked audio. Press play again.', { tone: 'danger' }); return; }
    engine.applyMix(mix, sound.masterVolume);
  };

  const stop = () => { engine.stopAll(); actions.setSound({ lastMix: {} }); };

  const setVolume = (value) => {
    const next = clampVolume(value);
    actions.setSound({ masterVolume: next });
    engine.setMasterVolume(mix, next);
  };

  const toggleLoop = () => {
    const next = !loop;
    actions.setSound({ loop: next });
    engine.setLoopTracks(next);
  };

  const save = () => {
    const result = createPreset(naming, mix, knownIds);
    if (!result.ok) { notify(result.error, { tone: 'danger' }); return; }
    actions.setSound((s) => ({ ...s, presets: [...s.presets, result.preset] }));
    setNaming(null);
    notify(`Saved “${result.preset.name}”`);
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      {/* Where a music player shows cover art. Nothing in the library has any —
          a built-in is a field recording and an uploaded file's artwork is not
          read — so this is a generated tile rather than a placeholder image
          pretending a cover exists. */}
      <div className="grid size-16 shrink-0 place-items-center rounded-card bg-accent-soft">
        {playing ? <Equalizer large /> : <Icon name="sounds" className="size-6 text-accent-ink" />}
      </div>

      <div className="min-w-0 flex-1">
        {naming === null ? (
          <>
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate text-card font-semibold text-ink">{title}</p>
              {!saved && (
                <button
                  type="button"
                  onClick={() => setNaming('')}
                  className="shrink-0 rounded-full border border-line px-1.5 text-[10px] font-medium text-ink-faint transition-colors duration-150 hover:text-ink"
                >
                  Unsaved · Save
                </button>
              )}
            </div>
            <p className="truncate text-meta text-ink-muted">{subtitle}</p>
            <p className="truncate text-[11px] text-ink-faint">{credit}</p>
          </>
        ) : (
          <div className="flex items-center gap-1.5">
            {/* Focused on appearance: the field exists only because the user
                just pressed Save, so the caret belongs in it. */}
            <input
              autoFocus
              value={naming}
              onChange={(event) => setNaming(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') save();
                if (event.key === 'Escape') { event.stopPropagation(); setNaming(null); }
              }}
              placeholder="Name this mix"
              aria-label="Name this mix"
              className="h-7 min-w-0 flex-1 rounded-control border border-line bg-surface px-2 text-meta text-ink"
            />
            <button
              type="button"
              onClick={save}
              className="h-7 shrink-0 rounded-control bg-accent px-2 text-meta font-medium text-on-accent"
            >
              Save
            </button>
          </div>
        )}

        <div className="mt-1.5 flex items-center gap-1">
          <IconButton
            name={playing ? 'pause' : 'play'}
            label={playing ? 'Pause' : 'Play'}
            onClick={toggle}
          />
          <IconButton name="stop" label="Stop and clear the mix" onClick={stop} />
          <IconButton
            name="repeat"
            label={
              streaming
                ? (loop ? 'Repeat is on for your tracks' : 'Repeat is off for your tracks')
                : 'Ambience always loops'
            }
            onClick={toggleLoop}
            disabled={!streaming}
            pressed={loop}
          />
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={sound.masterVolume}
            onChange={(event) => setVolume(event.target.value)}
            aria-label="Volume"
            className="ml-1 h-1 w-20 cursor-pointer accent-[var(--app-accent)]"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * The date, a week either side of today, and what is still due.
 *
 * The reference puts calendar events here. Chestha's calendar is its tasks, so
 * this lists the ones still open — overdue first, because a task that is late
 * is the one you most need the top of the screen to tell you about.
 */
function DayStrip({ today, pending, onComplete, onNavigate }) {
  const days = useMemo(() => [-3, -2, -1, 0, 1, 2, 3].map((offset) => addDays(today, offset)), [today]);
  const month = MONTHS[Number(today.slice(5, 7)) - 1] ?? '';
  const shown = pending.slice(0, 2);

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-end gap-3">
        <p className="shrink-0 text-xl font-bold tracking-tight text-ink">{month.slice(0, 3)}</p>
        <ul className="flex min-w-0 items-end gap-2.5">
          {days.map((iso) => {
            const isToday = iso === today;
            return (
              <li key={iso} className="flex flex-col items-center">
                {isToday && (
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-ink-faint">
                    {WEEKDAYS_SHORT[weekdayIndex(iso)]}
                  </span>
                )}
                <span
                  className={cx(
                    'tabular text-card',
                    isToday ? 'font-bold text-ink' : 'text-ink-faint',
                  )}
                >
                  {iso.slice(8, 10)}
                </span>
                {isToday && <span aria-hidden className="mt-0.5 size-1 rounded-full bg-accent" />}
              </li>
            );
          })}
        </ul>
      </div>

      <ul className="mt-1.5 space-y-0.5">
        {shown.map((task) => (
          <li key={task.id} className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => onComplete(task.id)}
              aria-label={`Complete “${task.title}”`}
              className="shrink-0 rounded-full p-0.5 text-ink-faint transition-colors duration-150 hover:text-ink"
            >
              <Icon name="circle" className="size-3.5" />
            </button>
            <span className="truncate text-meta text-ink">{task.title}</span>
          </li>
        ))}
        {pending.length === 0 ? (
          <li className="text-meta text-ink-faint">Nothing left due today.</li>
        ) : pending.length > shown.length ? (
          <li>
            <button
              type="button"
              onClick={() => onNavigate('tasks')}
              className="text-meta text-ink-faint underline-offset-2 hover:text-ink hover:underline"
            >
              +{pending.length - shown.length} more
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/** Where the reference puts a camera: today's tasks, done against the total. */
function DayRing({ done, pending }) {
  const total = done + pending;
  const fraction = total === 0 ? 0 : done / total;
  const radius = 20;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative grid size-16 shrink-0 place-items-center">
      <svg viewBox="0 0 48 48" className="absolute inset-0 size-full -rotate-90" aria-hidden>
        <circle cx="24" cy="24" r={radius} fill="none" stroke="var(--app-border)" strokeWidth="3" />
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          stroke="var(--app-accent)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
        />
      </svg>
      <p className="tabular relative text-meta font-semibold text-ink">
        {done}<span className="text-ink-faint">/{total}</span>
      </p>
      <span className="sr-only">{done} of {total} tasks done today</span>
    </div>
  );
}

/** A control that is an icon and a tooltip, since the island has no room for labels. */
function IconButton({ name, label, onClick, disabled = false, pressed = undefined }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      className={cx(
        'rounded-control p-1 transition-colors duration-150',
        disabled
          ? 'cursor-not-allowed text-ink-faint/50'
          : pressed === false
            ? 'text-ink-faint hover:text-ink'
            : 'text-ink-muted hover:bg-hover hover:text-ink',
      )}
    >
      <Icon name={name} className="size-4" />
    </button>
  );
}

/** Three bars that move while audio is running. Stilled by reduced-motion. */
function Equalizer({ large = false }) {
  const bars = large ? ['h-3', 'h-5', 'h-2.5'] : ['h-2', 'h-3', 'h-1.5'];
  return (
    <span className="flex items-end gap-0.5" aria-hidden>
      {bars.map((height, index) => (
        <span
          key={height + String(index)}
          className={cx('w-0.5 animate-pulse rounded-full bg-accent', height)}
          style={{ animationDelay: `${index * 140}ms` }}
        />
      ))}
    </span>
  );
}
