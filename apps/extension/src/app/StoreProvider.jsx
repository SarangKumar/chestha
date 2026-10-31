import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore,
} from 'react';
import {
  appendReward, appendRewards, createEvent, createSession, createStore, createTask,
  endSession, focusRewards, isRecurring, newId, nextInstance, normalizeTag,
  normalizeTags, pauseSession, recoverSession, requestPersistence, resumeSession,
  reverseReward, scheduleAfterEvent, sessionProgress, stageForProgress, tagKey,
  taskReward, todayISO,
  clearWebsiteTime, defaultGroveFocus, defaultGroveGarden, defaultLedger,
  describeDomain, unlockItem,
  ROLLUP_AFTER_DAYS, addDays, reconcileLifetime, rollupLedger,
} from '@chestha/core';
import { clearTrackerState } from '../grove/trackerBridge.js';
import { useToday } from './useToday.js';

const StoreContext = createContext(null);
const THEME_MIRROR_KEY = 'chestha.theme';

// The store lives outside React so it is created exactly once.
const store = createStore();
let initStarted = false;

export function StoreProvider({ children }) {
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const status = useSyncExternalStore(store.subscribe, store.getStatus);
  const today = useToday();
  const [toasts, setToasts] = useState([]);
  const toastTimers = useRef(new Map());

  useEffect(() => {
    if (initStarted) return;
    initStarted = true;
    store.init().then(() => {
      // A refusal is the expected answer and is not treated as an error.
      requestPersistence();
    });
  }, []);

  // Persist whatever is still debounced before the tab can be discarded.
  useEffect(() => {
    const flush = () => { store.flush(); };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = toastTimers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimers.current.delete(id);
    }
  }, []);

  /** Undo windows replace confirmation dialogs for reversible actions. */
  const notify = useCallback((message, options = {}) => {
    const id = newId('toast');
    const duration = options.duration ?? (options.actionLabel ? 7000 : 4000);
    setToasts((list) => [...list.slice(-2), { id, message, tone: options.tone ?? 'neutral', actionLabel: options.actionLabel, onAction: options.onAction }]);
    toastTimers.current.set(id, setTimeout(() => dismissToast(id), duration));
    return id;
  }, [dismissToast]);

  useEffect(() => () => {
    for (const timer of toastTimers.current.values()) clearTimeout(timer);
  }, []);

  const actions = useMemo(() => buildActions(store, notify), [notify]);

  // Keep the pre-paint theme mirror in sync with the stored setting.
  const theme = state.settings.theme;
  useEffect(() => {
    try { localStorage.setItem(THEME_MIRROR_KEY, theme); } catch { /* private window */ }
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  const value = useMemo(
    () => ({ state, status, today, actions, store, toasts, notify, dismissToast }),
    [state, status, today, actions, toasts, notify, dismissToast],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useWorkspace must be used inside StoreProvider');
  return value;
}

function buildActions(store, notify) {
  const touch = (task, patch) => ({ ...task, ...patch, updatedAt: new Date().toISOString() });

  /** Tags are remembered for autocomplete even after the last task using them goes. */
  const rememberTags = (tags) => {
    const incoming = normalizeTags(tags);
    if (incoming.length === 0) return;
    store.update('tags', (known) => {
      const keys = new Set(known.map(tagKey));
      const additions = incoming.filter((tag) => !keys.has(tagKey(tag)));
      return additions.length ? [...known, ...additions] : known;
    });
  };

  // Named, because one action (session recovery) settles through another and should
  // not depend on how the caller reached it.
  const actions = {
    addTask(input) {
      const task = createTask(input);
      if (!task.title) return null;
      store.update('tasks', (tasks) => [task, ...tasks]);
      rememberTags(task.tags);
      return task;
    },

    addTasks(inputs) {
      const created = inputs.map((input) => createTask(input)).filter((t) => t.title);
      if (created.length === 0) return [];
      store.update('tasks', (tasks) => [...created, ...tasks]);
      created.forEach((t) => rememberTags(t.tags));
      return created;
    },

    updateTask(id, patch) {
      if (patch.tags) rememberTags(patch.tags);
      store.update('tasks', (tasks) => tasks.map((t) => (t.id === id ? touch(t, patch) : t)));
    },

    /** Completion records an instant; reopening clears it. The due date is never
     *  rewritten, so a task finished late stays dated when it was due. */
    /**
     * Completing a recurring task spawns the next occurrence rather than
     * reopening this one: the finished instance keeps its own history, and the
     * follow-up starts clean. Undo removes the spawned task as well, so one
     * click never leaves a stray behind.
     */
    setCompleted(id, completed) {
      let subject = null;
      store.update('tasks', (tasks) => tasks.map((t) => {
        if (t.id !== id) return t;
        subject = t;
        return touch(t, { completedAt: completed ? new Date().toISOString() : null });
      }));
      if (!subject) return;

      const previous = subject.completedAt;
      let spawned = null;
      if (completed && isRecurring(subject)) {
        const next = nextInstance(subject, todayISO());
        if (next) {
          spawned = createTask(next);
          store.update('tasks', (tasks) => [spawned, ...tasks]);
        }
      }

      // XP is awarded from the ledger, not computed from the task's status, and keyed
      // on the task id — so toggling the same checkbox earns once, while a recurring
      // task (which spawns a new id) earns every time it comes round.
      let awarded = null;
      if (completed) {
        const current = store.getState();
        const reward = taskReward(current['grove.settings'], current['grove.ledger'], subject, todayISO());
        store.update('grove.ledger', (ledger) => {
          const result = appendReward(ledger, reward);
          awarded = result.event;
          return result.ledger;
        });
      }

      const label = completed ? `Completed “${trim(subject.title)}”` : `Reopened “${trim(subject.title)}”`;
      const detail = [spawned ? `next on ${spawned.due}` : null, awarded ? `+${awarded.xp} XP` : null]
        .filter(Boolean).join(' · ');
      notify(detail ? `${label} · ${detail}` : label, {
        actionLabel: 'Undo',
        duration: spawned ? 8000 : undefined,
        onAction: () => {
          store.update('tasks', (tasks) => tasks
            .filter((t) => !spawned || t.id !== spawned.id)
            .map((t) => (t.id === id ? touch(t, { completedAt: previous }) : t)));
          // Appends the negation rather than deleting the award: the history stays
          // true, and the key is freed so completing it for real later still earns.
          if (awarded) store.update('grove.ledger', (ledger) => reverseReward(ledger, awarded.id).ledger);
        },
      });
    },

    deleteTask(id) {
      let removed = null;
      let index = -1;
      store.update('tasks', (tasks) => {
        index = tasks.findIndex((t) => t.id === id);
        if (index < 0) return tasks;
        removed = tasks[index];
        return tasks.filter((t) => t.id !== id);
      });
      if (!removed) return;
      const restore = removed;
      const at = index;
      notify(`Deleted “${trim(restore.title)}”`, {
        tone: 'danger',
        actionLabel: 'Undo',
        onAction: () => store.update('tasks', (tasks) => {
          const next = [...tasks];
          next.splice(Math.min(at, next.length), 0, restore);
          return next;
        }),
      });
    },

    setNotes(text) {
      store.update('notes', () => ({ text }));
    },

    removeUnusedTags(usedKeys) {
      store.update('tags', (known) => known.filter((tag) => usedKeys.has(tagKey(tag))));
    },

    addTag(name) {
      const tag = normalizeTag(name);
      if (tag) rememberTags([tag]);
    },

    setSetting(key, value) {
      store.update('settings', (settings) => ({ ...settings, [key]: value }));
    },

    setDashboard(updater) {
      store.update('dashboard', (dashboard) => ({
        ...dashboard,
        widgets: typeof updater === 'function' ? updater(dashboard.widgets) : updater,
      }));
    },

    setSound(updater) {
      store.update('sound', (sound) => (typeof updater === 'function' ? updater(sound) : { ...sound, ...updater }));
    },

    setDsaSetting(key, value) {
      store.update('dsa.settings', (settings) => ({ ...settings, [key]: value }));
    },

    setDsaLibrary(updater) {
      store.update('dsa.library', (library) => (typeof updater === 'function' ? updater(library) : library));
    },

    setDsaProgress(updater) {
      store.update('dsa.progress', (progress) => (typeof updater === 'function' ? updater(progress) : progress));
    },

    setDsaLists(updater) {
      store.update('dsa.lists', (lists) => (typeof updater === 'function' ? updater(lists) : lists));
    },

    /**
     * Records one solving event and advances that question's revision schedule.
     * Repeat solves are additional events, never a replacement — a question
     * solved five times is one unique question and five events.
     */
    recordDsaEvent(slug, input = {}) {
      const event = createEvent({ ...input, slug });
      store.update('dsa.progress', (progress) => ({
        ...progress,
        events: [...progress.events, event],
        schedules: {
          ...progress.schedules,
          [slug]: scheduleAfterEvent(progress.schedules[slug], event),
        },
      }));
      return event;
    },

    /** Used by undo: removes one event and recomputes nothing else. */
    removeDsaEvent(id, slug, previousSchedule) {
      store.update('dsa.progress', (progress) => {
        const schedules = { ...progress.schedules };
        if (previousSchedule) schedules[slug] = previousSchedule;
        else delete schedules[slug];
        return { ...progress, events: progress.events.filter((e) => e.id !== id), schedules };
      });
    },

    /**
     * Starts a session and plants its seed in the same breath, so the garden is a
     * record of sessions rather than a second thing to keep in step with them.
     */
    startFocusSession({ plannedMinutes, taskId = null } = {}) {
      const state = store.getState();
      if (state['grove.focus'].active) return null;

      const plantId = newId('pl');
      const session = createSession({
        plannedMinutes: plannedMinutes ?? state['grove.settings'].focus.defaultMinutes,
        taskId,
        plantInstanceId: plantId,
      });
      store.update('grove.garden', (garden) => ({
        ...garden,
        plants: [...garden.plants, {
          id: plantId,
          speciesId: garden.selectedSpeciesId,
          sessionId: session.id,
          stage: 'seed',
          plantedAt: session.startedAt,
          x: garden.plants.length % 8,
          y: Math.floor(garden.plants.length / 8),
        }],
      }));
      store.update('grove.focus', (focus) => ({ ...focus, active: session }));
      return session;
    },

    pauseFocusSession() {
      store.update('grove.focus', (focus) => (focus.active
        ? { ...focus, active: pauseSession(focus.active) }
        : focus));
    },

    resumeFocusSession() {
      store.update('grove.focus', (focus) => (focus.active
        ? { ...focus, active: resumeSession(focus.active) }
        : focus));
    },

    /**
     * Ends a session and settles everything it earned at once. Called for the End
     * button, for a timer reaching zero, and for a session recovered after a restart —
     * one path, so the three cannot drift apart.
     *
     * @param recovered a session already brought back by recoverSession()
     */
    endFocusSession(recovered = null) {
      const state = store.getState();
      const active = recovered ?? state['grove.focus'].active;
      if (!active) return null;

      const ended = active.endedAt ? active : endSession(active);
      const rewards = focusRewards(state['grove.settings'], ended);
      let earned = { xp: 0, seeds: 0 };

      store.update('grove.ledger', (ledger) => {
        const result = appendRewards(ledger, rewards);
        for (const event of result.events) {
          earned = { xp: earned.xp + event.xp, seeds: earned.seeds + event.seeds };
        }
        return result.ledger;
      });

      // The plant keeps the stage its session reached. Nothing is ever uprooted: the
      // worst outcome of an interruption is a smaller plant.
      const stage = stageForProgress(sessionProgress(ended, Date.parse(ended.endedAt)));
      store.update('grove.garden', (garden) => ({
        ...garden,
        plants: garden.plants.map((plant) => (plant.id === ended.plantInstanceId ? { ...plant, stage } : plant)),
      }));
      store.update('grove.focus', (focus) => ({
        active: null,
        sessions: [...focus.sessions, ended],
      }));

      return { session: ended, earned, stage };
    },

    /** Brings a session left running by a closed tab or a restart back to the present. */
    recoverFocusSession() {
      const active = store.getState()['grove.focus'].active;
      if (!active) return null;
      const recovered = recoverSession(active, Date.now());
      if (recovered === active) return null;
      return actions.endFocusSession(recovered);
    },

    /**
     * Keeps the ledger bounded and its cached totals honest.
     *
     * Both halves are no-ops in the ordinary case and return the same object, so a
     * load that needs nothing writes nothing.
     */
    maintainLedger() {
      store.update('grove.ledger', (ledger) => {
        const cutoff = addDays(todayISO(), -ROLLUP_AFTER_DAYS);
        return reconcileLifetime(rollupLedger(ledger, cutoff));
      });
    },

    setGroveSetting(key, value) {
      store.update('grove.settings', (settings) => ({ ...settings, [key]: value }));
    },

    /** Adds a website rule. The domain is validated before it is stored, never after. */
    addWebsiteRule(input) {
      const check = describeDomain(input.domain);
      if (!check.ok) return { ok: false, reason: check.reason };
      let added = null;
      store.update('grove.settings', (settings) => {
        if (settings.rules.some((rule) => rule.domain === check.domain)) return settings;
        added = {
          id: newId('rule'),
          domain: check.domain,
          label: String(input.label ?? '').trim() || check.domain,
          category: String(input.category ?? '').trim(),
          productive: input.productive !== false,
          includeSubdomains: input.includeSubdomains !== false,
          dailyCapXp: null,
          enabled: true,
        };
        return { ...settings, rules: [...settings.rules, added] };
      });
      return added ? { ok: true, rule: added } : { ok: false, reason: 'That site is already on the list.' };
    },

    updateWebsiteRule(id, patch) {
      store.update('grove.settings', (settings) => ({
        ...settings,
        rules: settings.rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
      }));
    },

    /**
     * Removes a rule but keeps the time it recorded: the history is a record of what
     * happened, and the Stats screen names a removed rule rather than hiding its hours.
     * XP already awarded is never revoked — the time was genuinely spent.
     */
    removeWebsiteRule(id) {
      store.update('grove.settings', (settings) => ({
        ...settings,
        rules: settings.rules.filter((rule) => rule.id !== id),
      }));
    },

    clearWebsiteTime() {
      store.update('grove.time', () => clearWebsiteTime());
      clearTrackerState();
    },

    setGardenChoice(item) {
      const key = item.kind === 'environment' ? 'environmentId' : 'selectedSpeciesId';
      store.update('grove.garden', (garden) => ({ ...garden, [key]: item.id }));
    },

    /** Seeds are spent; XP is not. Nothing earned can go backwards. */
    unlockGardenItem(itemId) {
      const state = store.getState();
      const result = unlockItem(state['grove.ledger'], state['grove.garden'], itemId);
      if (!result.ok) return result;
      store.update('grove.ledger', () => result.ledger);
      store.update('grove.garden', () => result.garden);
      return result;
    },

    /** Clears the five grove.* areas and nothing else. */
    resetGrove() {
      store.update('grove.ledger', () => defaultLedger());
      store.update('grove.time', () => clearWebsiteTime());
      store.update('grove.focus', () => defaultGroveFocus());
      store.update('grove.garden', () => defaultGroveGarden());
      clearTrackerState();
    },

    toggleDsaBookmark(slug) {
      let next = false;
      store.update('dsa.progress', (progress) => {
        const current = progress.questionState[slug] ?? { bookmarked: false, priority: 0, notes: '' };
        next = !current.bookmarked;
        return {
          ...progress,
          questionState: { ...progress.questionState, [slug]: { ...current, bookmarked: next } },
        };
      });
      return next;
    },
  };

  return actions;
}

function trim(title, max = 36) {
  return title.length > max ? `${title.slice(0, max - 1)}…` : title;
}
