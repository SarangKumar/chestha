import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore,
} from 'react';
import {
  createStore, createTask, newId, normalizeTag, normalizeTags, requestPersistence, tagKey,
} from '@vistaar/core';
import { useToday } from './useToday.js';

const StoreContext = createContext(null);
const THEME_MIRROR_KEY = 'vistaar.theme';

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

  return {
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
    setCompleted(id, completed) {
      let subject = null;
      store.update('tasks', (tasks) => tasks.map((t) => {
        if (t.id !== id) return t;
        subject = t;
        return touch(t, { completedAt: completed ? new Date().toISOString() : null });
      }));
      if (!subject) return;
      const previous = subject.completedAt;
      notify(completed ? `Completed “${trim(subject.title)}”` : `Reopened “${trim(subject.title)}”`, {
        actionLabel: 'Undo',
        onAction: () => store.update('tasks', (tasks) => tasks.map((t) => (
          t.id === id ? touch(t, { completedAt: previous }) : t
        ))),
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
  };
}

function trim(title, max = 36) {
  return title.length > max ? `${title.slice(0, max - 1)}…` : title;
}
