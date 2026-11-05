import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  MONTHS,
  WEEKDAYS_SHORT,
  activeSoundIds,
  addDays,
  buildIslandSnapshot,
  clampVolume,
  createPreset,
  formatDuration,
  isOverdue,
  isSectionAllowed,
  islandTitle,
  matchingPreset,
  selectCompletedOn,
  selectToday,
  weekdayIndex,
} from '@chestha/core';
import * as engine from '../audio/host.js';
import * as tracks from '../audio/trackStore.js';
import { useWorkspace } from '../app/StoreProvider.jsx';
import { useSession } from '../app/useSession.js';
import { soundCatalogue, useSoundCatalogue } from '../app/useSoundCatalogue.js';
import {
  ISLAND_SELF, clearIsland, onIslandCommand, publishIsland,
  startIslandHeartbeat, stopIslandHeartbeat, wireIslandCommands,
} from '../app/islandBridge.js';
import { cx } from './ui.jsx';
import './island.css';

/**
 * The island: a notch hanging off the top edge of the workspace.
 *
 * Modelled on NotchNook — a black bar centred on the top edge, collapsed to a
 * pill until pointed at, then widening into three regions: what is playing on
 * the left, the date and what is due in the middle, a progress ring on the
 * right.
 *
 * **It is black in both themes, on purpose, and that is the one place in this
 * app that ignores the palette.** Everything else follows the token ladder;
 * this does not, because the thing being imitated is a piece of hardware. A
 * notch that turned white in the light theme would read as a floating dialog
 * rather than as part of the screen's edge. The deviation is confined to this
 * component and its injected twin, and nothing else may copy it.
 *
 * This component is also the workspace's half of the bridge: it publishes the
 * snapshot that the overlay in other tabs draws, and it executes the commands
 * that overlay sends back. Both are effects here rather than somewhere more
 * central because this is the component that already knows the whole of what
 * the island shows — a second assembler of the same payload would drift.
 *
 * It renders nothing when there is nothing to say, and its two halves are
 * gated independently: sounds and tasks both need an account, and `unknown` is
 * not signed out, so an offline install keeps whatever it last knew.
 */
export function Island({ onNavigate }) {
  const { state, today, actions, notify } = useWorkspace();
  const { session } = useSession();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const expanded = open || pinned;

  const mode = state.settings.island ?? 'everywhere';
  const soundsAllowed = isSectionAllowed('sounds', session.state);
  const tasksAllowed = isSectionAllowed('tasks', session.state);

  const sound = state.sound;
  const mix = sound.lastMix ?? {};
  const mixSize = Object.keys(mix).length;

  // The track store is subscribed to rather than loaded: the catalogue has to
  // re-read when an upload finishes, but opening IndexedDB on every page for a
  // board with no mix playing is a cost nothing here has earned. `NowPlaying`
  // is what triggers the load, and only when a mix exists.
  const trackState = useSyncExternalStore(tracks.subscribe, tracks.getTrackState);
  const catalogue = useMemo(() => soundCatalogue(), [trackState]);
  const audio = useSyncExternalStore(engine.subscribe, engine.getEngineState);

  // `selectToday` is already "open, and due today or overdue": it leaves out
  // completed tasks and takes in overdue ones. Overdue is lifted to the front
  // rather than concatenated, which would list every late task twice.
  const pending = useMemo(() => {
    if (!tasksAllowed) return [];
    const todays = selectToday(state.tasks, today);
    return [
      ...todays.filter((task) => isOverdue(task, today)),
      ...todays.filter((task) => !isOverdue(task, today)),
    ];
  }, [tasksAllowed, state.tasks, today]);

  // Finished today is a completion *instant* landing in today's local day —
  // not a task dated today that is done, which is a different question.
  const doneToday = useMemo(() => {
    if (!tasksAllowed) return 0;
    return selectCompletedOn(state.tasks, today).length;
  }, [tasksAllowed, state.tasks, today]);

  /**
   * Everything about playback comes from the audio host's record — **not from
   * this page's store**.
   *
   * This is the last piece of the two-tabs problem, and the reason the earlier
   * fixes were not enough. There is no cross-tab store sync in this app: a
   * second New Tab holds whatever `sound.lastMix` was when *it* loaded, which
   * for a tab opened before the music started is nothing at all. So even with
   * one shared engine and one shared record, the island still asked the wrong
   * question — "what is in my copy of the store" rather than "what is coming
   * out of the browser" — and a tab that had never seen the mix drew silence.
   *
   * `shared` answers the second question, identically in every tab. The local
   * store is now consulted for exactly one thing: naming a mix this tab knows
   * well enough to save.
   */
  const shared = engine.audioSnapshot();
  const playing = Boolean(shared?.playing);
  const hasSound = soundsAllowed && Boolean(shared);
  const hasTasks = tasksAllowed && (pending.length > 0 || doneToday > 0);

  /**
   * The name of what is playing.
   *
   * The host knows the track, but not the *mix* — presets live in the store,
   * and the host has none. So a tab holding the same mix gets to improve the
   * label from "2 sounds" to "Rain + fire"; a tab that does not know the mix
   * shows the host's own words rather than nothing.
   */
  const localName = useMemo(() => {
    const knownIds = catalogue.map((item) => item.id);
    const items = activeSoundIds(mix, knownIds)
      .map((id) => catalogue.find((item) => item.id === id))
      .filter(Boolean);
    if (items.length === 0) return '';
    if (items.length === 1) return items[0].name;
    return matchingPreset(sound.presets, mix, knownIds)?.name ?? 'Unsaved mix';
  }, [mix, catalogue, sound.presets]);

  // Only when this tab's mix is the one being played: otherwise its name is
  // for some other mix entirely, which would be a confident lie. The rule is
  // in core so it can be tested — it is the one that caused the second tab to
  // disagree with the first.
  const knowsThisMix = Boolean(shared) && mixSize > 0 && mixSize === shared.count;
  const title = islandTitle(shared, localName, mixSize);

  // ── Playback position ────────────────────────────────────────────────────
  // No polling: the host reports a position every second and that report is
  // what every tab draws. A timer here would be a second clock to disagree
  // with, which is the whole class of bug this page is trying to leave behind.
  const media = shared?.media
    ? { currentTime: shared.media.position, duration: shared.media.duration }
    : null;

  /**
   * The position as the snapshot carries it, rounded to five seconds.
   *
   * Rounding the *value* was not enough: the memo below depends on `media`,
   * which is a fresh object every poll, so the snapshot's identity changed
   * every second and the publish effect wrote to storage every second — waking
   * a listener in every tab and every page's overlay, once a second, for the
   * length of a track. Depending on two numbers instead makes it five seconds
   * and no churn in between; the overlay advances the bar locally.
   */
  const mediaDuration = media?.duration ?? 0;
  const mediaStep = media ? Math.floor(media.currentTime / 5) * 5 : 0;

  // ── The bridge ───────────────────────────────────────────────────────────
  const snapshot = useMemo(() => buildIslandSnapshot({
    owner: ISLAND_SELF,
    mode,
    sound: { ...sound, playing },
    catalogue,
    tasks: state.tasks,
    today,
    // Rounded to five seconds on purpose. The snapshot is a dependency of the
    // publish effect, so a position that changed every second would write to
    // chrome.storage — and wake a listener in every open tab — once a second
    // for the whole of a track. The overlay advances the bar locally between
    // updates, so the only thing lost is five seconds of precision on a bar a
    // few hundred pixels wide.
    media: mediaDuration ? { position: mediaStep, duration: mediaDuration } : null,
    allowed: { sounds: soundsAllowed, tasks: tasksAllowed },
  }), [mode, sound, playing, catalogue, state.tasks, today, mediaStep, mediaDuration,
    soundsAllowed, tasksAllowed]);

  useEffect(() => { wireIslandCommands(); }, []);

  useEffect(() => {
    // `off` and `workspace` both mean "nothing for other tabs to draw", so the
    // snapshot is removed rather than left to expire: switching the setting
    // should take the overlay away now, not in a minute and a half.
    // Published whenever the overlay is switched on, not only when there is
    // something in it. The record is also how the overlay learns the *mode*
    // and that a workspace exists at all: gating it on content meant that on
    // a day with nothing due and nothing playing, the island simply never
    // appeared on other sites and looked broken.
    //
    // `clearIsland` refuses to remove a record another live tab wrote, so a
    // second tab cannot take the overlay away from the first.
    if (mode !== 'everywhere') {
      clearIsland();
      stopIslandHeartbeat();
      return undefined;
    }
    publishIsland(snapshot);
    startIslandHeartbeat();
    return undefined;
  }, [mode, hasSound, hasTasks, snapshot]);

  // Leaving the workspace tab must take the overlay with it, because the audio
  // goes too — it lives in this page's AudioContext.
  useEffect(() => stopIslandHeartbeat, []);
  useEffect(() => {
    const goodbye = () => clearIsland();
    window.addEventListener('pagehide', goodbye);
    return () => window.removeEventListener('pagehide', goodbye);
  }, []);

  const start = useCallback(async () => {
    engine.setCatalogue(catalogue);
    const ok = await engine.ensureContext();
    if (!ok) {
      notify('The browser blocked audio. Press play again — it only starts from a click.', { tone: 'danger' });
      return;
    }
    // A tab that does not hold the mix — one opened after the music started —
    // cannot name it, but the host still has it. Asking the host to resume is
    // the difference between a play button that works in every tab and one
    // that works only where the mix happens to be remembered.
    if (mixSize > 0) engine.applyMix(mix, sound.masterVolume);
    else await engine.resume();
  }, [catalogue, mix, mixSize, sound.masterVolume, notify]);

  const stop = useCallback(() => {
    engine.stopAll();
    actions.setSound({ lastMix: {} });
  }, [actions]);

  useEffect(() => onIslandCommand({
    play: () => { start(); },
    pause: () => { engine.pause(); },
    stop,
    loop: () => {
      const next = !(sound.loop !== false);
      actions.setSound({ loop: next });
      engine.setLoopTracks(next);
    },
    complete: (payload) => {
      const id = String(payload?.id ?? '');
      if (id) actions.setCompleted(id, true);
    },
  }), [start, stop, actions, sound.loop]);

  if (mode === 'off' || (!hasSound && !hasTasks)) return null;

  return (
    <div
      // The wrapper spans the width so the notch is centred on the viewport
      // rather than on the content column, which the nav rail offsets.
      //
      // Hidden below `sm`: the phone header already carries the title, the
      // command button, Add task and the theme picker across that same strip,
      // and a notch over them would cover a control rather than add one.
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
            'island-panel overflow-hidden border border-t-0 border-white/10 bg-black text-white',
            'shadow-[0_18px_40px_-12px_rgba(0,0,0,0.65)]',
            expanded ? 'rounded-b-[2rem]' : 'rounded-b-[1.25rem]',
          )}
        >
          {expanded ? (
            <Expanded
              shared={shared}
              mix={mix}
              knowsThisMix={knowsThisMix}
              catalogue={catalogue}
              title={title}
              hasSound={hasSound}
              hasTasks={hasTasks}
              playing={playing}
              media={media}
              pending={pending}
              doneToday={doneToday}
              today={today}
              pinned={pinned}
              onPin={() => setPinned((value) => !value)}
              onNavigate={onNavigate}
              onStart={start}
              onStop={stop}
              onComplete={(id) => actions.setCompleted(id, true)}
            />
          ) : (
            <Collapsed
              hasSound={hasSound}
              title={title}
              playing={playing}
              pendingCount={pending.length}
              onOpen={() => setPinned(true)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** The resting state: a pill saying what is playing and what is left. */
function Collapsed({ hasSound, title, playing, pendingCount, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-expanded="false"
      aria-label="Open the island"
      className="flex h-8 items-center gap-2.5 px-4"
    >
      {hasSound
        ? <Meter playing={playing} />
        : <Glyph name="check" className="size-3.5 text-white/60" />}
      {/* The name of what is playing, not the word "Playing": a pill that says
          only that is a status light, and the thing people actually want from
          a glance at the notch is which track it is. */}
      <span className="max-w-[14rem] truncate text-[11px] font-medium text-white/90">
        {hasSound ? (title || (playing ? 'Playing' : 'Paused')) : 'Today'}
      </span>
      {pendingCount > 0 && (
        <span className="tabular rounded-full bg-white/15 px-1.5 text-[10px] font-semibold text-white">
          {pendingCount}
        </span>
      )}
    </button>
  );
}

/** The open state: three regions, each dropped when its half is empty. */
function Expanded({
  shared, mix, knowsThisMix, catalogue, title, hasSound, hasTasks, playing, media,
  pending, doneToday, today, pinned, onPin, onNavigate, onStart, onStop, onComplete,
}) {
  return (
    <div className="island-reveal w-[min(94vw,46rem)] px-4 pb-4 pt-2">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] font-semibold tracking-wide text-white">Chestha</span>
        <button
          type="button"
          onClick={onPin}
          aria-pressed={pinned}
          className={cx(
            'rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors duration-150',
            pinned ? 'bg-white/15 text-white' : 'text-white/45 hover:text-white',
          )}
        >
          {pinned ? 'Pinned' : 'Pin'}
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => onNavigate(hasSound ? 'sounds' : 'tasks')}
          className="rounded-lg p-1 text-white/45 transition-colors duration-150 hover:text-white"
          aria-label={hasSound ? 'Open Sounds' : 'Open Tasks'}
        >
          <Glyph name="gear" className="size-4" />
        </button>
      </div>

      <div className="flex items-stretch gap-4">
        {hasSound && (
          <NowPlaying
            shared={shared}
            mix={mix}
            knowsThisMix={knowsThisMix}
            catalogue={catalogue}
            title={title}
            playing={playing}
            media={media}
            onStart={onStart}
            onStop={onStop}
          />
        )}
        {hasSound && hasTasks && <span aria-hidden className="w-px shrink-0 bg-white/10" />}
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
 * What is playing, with its controls and its progress.
 *
 * There are no previous/next controls, unlike the player this is modelled on:
 * the engine plays a *mix*, not a queue, so there is nothing to skip to.
 * Buttons that could only do nothing would be worse than a short row.
 *
 * The catalogue hook is mounted here rather than in `Island` so that opening
 * IndexedDB is paid for only when a mix is actually playing.
 */
function NowPlaying({
  shared, mix, knowsThisMix, catalogue: fallback, title, playing, media, onStart, onStop,
}) {
  const { state, actions, notify } = useWorkspace();
  const sound = state.sound;
  const live = useSoundCatalogue();
  const catalogue = live.length >= fallback.length ? live : fallback;
  const [naming, setNaming] = useState(null);
  const inputRef = useRef(null);

  const knownIds = useMemo(() => catalogue.map((item) => item.id), [catalogue]);

  /**
   * Read from the host's record, not from this page's store.
   *
   * There is no cross-tab store sync, so a New Tab opened after the music
   * started holds an empty `lastMix` and knows nothing about what is playing.
   * Deriving any of this locally is what made the second tab disagree.
   */
  const subtitle = shared.subtitle;
  const credit = shared.credit;
  const streaming = shared.streaming;
  const loop = shared.loop;
  const volume = shared.volume;

  // Saving a mix needs the mix itself, which only a tab that holds it has.
  const saved = knowsThisMix ? matchingPreset(sound.presets, mix, knownIds) : null;
  const canSave = knowsThisMix && !saved;

  useEffect(() => { if (naming !== null) inputRef.current?.focus(); }, [naming]);

  const save = () => {
    const result = createPreset(naming, mix, knownIds);
    if (!result.ok) { notify(result.error, { tone: 'danger' }); return; }
    actions.setSound((s) => ({ ...s, presets: [...s.presets, result.preset] }));
    setNaming(null);
    notify(`Saved “${result.preset.name}”`);
  };

  const setVolume = (value) => {
    const next = clampVolume(value);
    actions.setSound({ masterVolume: next });
    engine.setMasterVolume(mix, next);
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      {/* Where a music player shows cover art. Nothing in the library has any —
          a built-in is a field recording, and an uploaded file's embedded
          artwork is not read — so this is a level meter rather than a
          placeholder pretending a cover exists. */}
      <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-white/[0.08] ring-1 ring-inset ring-white/10">
        <Meter playing={playing} large />
      </div>

      <div className="min-w-0 flex-1">
        {naming === null ? (
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-white">{title}</p>
            {canSave && (
              <button
                type="button"
                onClick={() => setNaming('')}
                className="shrink-0 rounded-full border border-white/20 px-1.5 text-[10px] font-medium text-white/60 transition-colors duration-150 hover:border-white/40 hover:text-white"
              >
                Unsaved · Save
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              value={naming}
              onChange={(event) => setNaming(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') save();
                if (event.key === 'Escape') { event.stopPropagation(); setNaming(null); }
              }}
              placeholder="Name this mix"
              aria-label="Name this mix"
              className="h-7 min-w-0 flex-1 rounded-lg border border-white/15 bg-white/10 px-2 text-xs text-white placeholder:text-white/40"
            />
            <button
              type="button"
              onClick={save}
              className="h-7 shrink-0 rounded-lg bg-white px-2 text-xs font-medium text-black"
            >
              Save
            </button>
          </div>
        )}

        <p className="truncate text-[11px] text-white/55">{subtitle}</p>
        <p className="truncate text-[11px] text-white/35">{credit}</p>

        {/* The progress bar only exists for a streamed track: a built-in loop
            is endless ambience, and a bar that crept toward an end that never
            came would be an invention. */}
        {media ? (
          <Progress position={media.currentTime} duration={media.duration} />
        ) : null}

        <div className="mt-1.5 flex items-center gap-0.5">
          <Control
            name={playing ? 'pause' : 'play'}
            label={playing ? 'Pause' : 'Play'}
            onClick={() => (playing ? engine.pause() : onStart())}
          />
          <Control name="stop" label="Stop and clear the mix" onClick={onStop} />
          <Control
            name="repeat"
            label={
              streaming
                ? (loop ? 'Repeat is on for your tracks' : 'Repeat is off for your tracks')
                : 'Ambience always loops'
            }
            onClick={() => {
              const next = !loop;
              actions.setSound({ loop: next });
              engine.setLoopTracks(next);
            }}

            disabled={!streaming}
            active={loop}
          />
          <Glyph name="volume" className="ml-1.5 size-3.5 shrink-0 text-white/45" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(event) => setVolume(event.target.value)}
            aria-label="Volume"
            className="island-range h-1 w-20 cursor-pointer accent-white"
          />
        </div>
      </div>
    </div>
  );
}

/** Elapsed against length, as a bar and as two clocks. */
function Progress({ position, duration }) {
  const fraction = duration > 0 ? Math.min(1, position / duration) : 0;
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <span className="tabular shrink-0 text-[10px] text-white/45">{formatDuration(position)}</span>
      <div
        className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-white/15"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(position)}
        aria-label="Track position"
      >
        <div
          className="h-full rounded-full bg-white transition-[width] duration-1000 ease-linear"
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
      <span className="tabular shrink-0 text-[10px] text-white/45">{formatDuration(duration)}</span>
    </div>
  );
}

/**
 * The date, a week either side of today, and what is still due.
 *
 * The player this imitates puts calendar events here. Chestha's calendar is its
 * tasks, so this lists the open ones — overdue first, because a late task is
 * the one most worth the top of the screen.
 */
function DayStrip({ today, pending, onComplete, onNavigate }) {
  const days = useMemo(
    () => [-3, -2, -1, 0, 1, 2, 3].map((offset) => addDays(today, offset)),
    [today],
  );
  const month = MONTHS[Number(today.slice(5, 7)) - 1] ?? '';
  const shown = pending.slice(0, 2);

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-end gap-3">
        <p className="shrink-0 text-xl font-bold tracking-tight text-white">{month.slice(0, 3)}</p>
        <ul className="flex min-w-0 items-end gap-2.5">
          {days.map((iso) => {
            const isToday = iso === today;
            return (
              <li key={iso} className="flex flex-col items-center">
                {isToday && (
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-white/45">
                    {WEEKDAYS_SHORT[weekdayIndex(iso)]}
                  </span>
                )}
                <span className={cx('tabular text-sm', isToday ? 'font-bold text-white' : 'text-white/35')}>
                  {iso.slice(8, 10)}
                </span>
                {isToday && <span aria-hidden className="mt-0.5 size-1 rounded-full bg-white" />}
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
              className="group shrink-0 rounded-full p-0.5 text-white/40 transition-colors duration-150 hover:text-white"
            >
              <Glyph name="circle" className="size-3.5 group-hover:hidden" />
              <Glyph name="checkCircle" className="hidden size-3.5 group-hover:block" />
            </button>
            <span className="truncate text-[11px] text-white/85">{task.title}</span>
          </li>
        ))}
        {pending.length === 0 ? (
          <li className="text-[11px] text-white/40">Nothing left due today.</li>
        ) : pending.length > shown.length ? (
          <li>
            <button
              type="button"
              onClick={() => onNavigate('tasks')}
              className="text-[11px] text-white/40 underline-offset-2 hover:text-white hover:underline"
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
        <circle cx="24" cy="24" r={radius} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
        <circle
          cx="24" cy="24" r={radius}
          fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          style={{ transition: 'stroke-dashoffset 420ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <p className="tabular relative text-[11px] font-semibold text-white">
        {done}<span className="text-white/40">/{total}</span>
      </p>
      <span className="sr-only">{done} of {total} tasks done today</span>
    </div>
  );
}

/** A transport control: an icon, a tooltip, and a pressed state. */
function Control({ name, label, onClick, disabled = false, active = undefined }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cx(
        'rounded-lg p-1.5 transition-colors duration-150',
        disabled
          ? 'cursor-not-allowed text-white/20'
          : active === false
            ? 'text-white/40 hover:bg-white/10 hover:text-white'
            : 'text-white/80 hover:bg-white/10 hover:text-white',
      )}
    >
      <Glyph name={name} className="size-4" />
    </button>
  );
}

/** Four bars that move while audio runs, and freeze when it does not. */
function Meter({ playing, large = false }) {
  const heights = large ? [10, 20, 14, 7] : [5, 10, 7, 4];
  return (
    <span className={cx('flex items-end', large ? 'gap-1' : 'gap-0.5')} aria-hidden>
      {heights.map((height, index) => (
        <span
          key={height}
          className={cx(
            'rounded-full bg-white',
            large ? 'w-1' : 'w-0.5',
            playing ? `island-bar island-bar-${index + 1}` : 'island-bar-still',
          )}
          style={{ height: `${height}px` }}
        />
      ))}
    </span>
  );
}

/**
 * The island's own glyphs: solid where the control is a transport button, the
 * way a media player draws them, rather than the app's 1.7px line set. The
 * notch is small and dark, and a hairline icon at 16px on black loses its
 * shape. Kept local for the same reason the colours are: nothing else in the
 * app should pick these up.
 */
export function Glyph({ name, className = 'size-4' }) {
  const solid = { viewBox: '0 0 24 24', fill: 'currentColor' };
  const line = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };

  switch (name) {
    case 'play':
      return <svg {...solid} className={className} aria-hidden><path d="M8 5.14v13.72a1 1 0 0 0 1.53.85l10.74-6.86a1 1 0 0 0 0-1.7L9.53 4.29A1 1 0 0 0 8 5.14Z" /></svg>;
    case 'pause':
      return <svg {...solid} className={className} aria-hidden><rect x="6.5" y="5" width="3.6" height="14" rx="1.3" /><rect x="13.9" y="5" width="3.6" height="14" rx="1.3" /></svg>;
    case 'stop':
      return <svg {...solid} className={className} aria-hidden><rect x="6" y="6" width="12" height="12" rx="2.4" /></svg>;
    case 'repeat':
      return <svg {...line} className={className} aria-hidden><path d="M4.5 10.5A4 4 0 0 1 8.5 6.5H18" /><path d="m15.5 4 3 2.5-3 2.5" /><path d="M19.5 13.5a4 4 0 0 1-4 4H6" /><path d="m8.5 20-3-2.5 3-2.5" /></svg>;
    case 'volume':
      return <svg {...solid} className={className} aria-hidden><path d="M4 9.5h3L11.3 6a.8.8 0 0 1 1.3.63v10.74A.8.8 0 0 1 11.3 18L7 14.5H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z" /><path d="M15.8 8.9a.9.9 0 0 1 1.27.05 4.6 4.6 0 0 1 0 6.1.9.9 0 1 1-1.32-1.22 2.8 2.8 0 0 0 0-3.66.9.9 0 0 1 .05-1.27Z" /></svg>;
    case 'gear':
      return <svg {...line} className={className} aria-hidden><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M4.2 7.5l2.2 1.3M17.6 15.2l2.2 1.3M4.2 16.5l2.2-1.3M17.6 8.8l2.2-1.3" /></svg>;
    case 'circle':
      return <svg {...line} className={className} aria-hidden><circle cx="12" cy="12" r="7.5" /></svg>;
    case 'checkCircle':
      return <svg {...line} className={className} aria-hidden><circle cx="12" cy="12" r="7.5" /><path d="m8.5 12 2.5 2.5 4.5-4.5" /></svg>;
    case 'check':
    default:
      return <svg {...line} className={className} aria-hidden><path d="m5 12.5 4.5 4.5L19 7" /></svg>;
  }
}
