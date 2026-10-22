import { AREAS, LAZY_AREAS, STATE_VERSION, coerceArea, defaultState } from './schema.js';
import { describeStorageError, openStorage } from './storage.js';

const SNAPSHOT_KEY = '__snapshot';
const WRITE_DEBOUNCE_MS = 250;

/**
 * The single source of truth for user data. Every change is persisted
 * automatically; there is no save action anywhere in the product.
 */
export function createStore() {
  let state = defaultState();
  let storage = null;
  let status = {
    ready: false,
    mode: 'memory',
    storageReason: null,
    issues: [],
    writeError: null,
    loadedAreas: AREAS.filter((area) => !LAZY_AREAS.includes(area)),
  };

  const listeners = new Set();
  const pending = new Map(); // area -> timeout id

  function emit() {
    for (const listener of listeners) listener();
  }

  function setStatus(patch) {
    status = { ...status, ...patch };
  }

  async function init() {
    storage = await openStorage();
    const issues = [];
    // Lazy areas are skipped so an unopened DSA library never slows the first paint.
    for (const area of AREAS.filter((a) => !LAZY_AREAS.includes(a))) {
      let raw;
      try {
        raw = await storage.get(area);
      } catch (error) {
        issues.push(`Could not read ${area}: ${describeStorageError(error)}`);
        raw = undefined;
      }
      const { value, issues: areaIssues } = coerceArea(area, raw);
      state = { ...state, [area]: value };
      issues.push(...areaIssues);
    }
    setStatus({
      ready: true,
      mode: storage.mode,
      storageReason: storage.reason,
      issues,
    });
    emit();
  }

  const loading = new Map();

  /** Loads a lazy area on first use. Safe to call repeatedly. */
  function ensureArea(area) {
    if (!AREAS.includes(area)) return Promise.reject(new Error(`Unknown area "${area}"`));
    if (status.loadedAreas.includes(area)) return Promise.resolve();
    if (loading.has(area)) return loading.get(area);

    const work = (async () => {
      let raw;
      const issues = [];
      try {
        raw = await storage?.get(area);
      } catch (error) {
        issues.push(`Could not read ${area}: ${describeStorageError(error)}`);
      }
      const { value, issues: areaIssues } = coerceArea(area, raw);
      state = { ...state, [area]: value };
      setStatus({
        loadedAreas: [...status.loadedAreas, area],
        issues: [...status.issues, ...issues, ...areaIssues],
      });
      emit();
    })().finally(() => loading.delete(area));

    loading.set(area, work);
    return work;
  }

  /**
   * Export must never write a default over a lazy area that was never read, so
   * every area is loaded before a snapshot of the whole state is taken.
   */
  function ensureAllAreas() {
    return Promise.all(AREAS.map(ensureArea));
  }

  function persist(area) {
    if (!storage) return;
    const existing = pending.get(area);
    if (existing) clearTimeout(existing);
    pending.set(area, setTimeout(() => {
      pending.delete(area);
      writeArea(area);
    }, WRITE_DEBOUNCE_MS));
  }

  async function writeArea(area) {
    if (!storage) return;
    try {
      await storage.set(area, state[area]);
      if (status.writeError) {
        setStatus({ writeError: null });
        emit();
      }
    } catch (error) {
      // A silent write failure is the worst outcome in the product, so it is
      // promoted to visible status rather than only logged.
      setStatus({ writeError: describeStorageError(error) });
      emit();
    }
  }

  /** Nothing depends on a clean unload; this only shortens the at-risk window. */
  async function flush() {
    const areas = [...pending.keys()];
    for (const area of areas) {
      clearTimeout(pending.get(area));
      pending.delete(area);
    }
    await Promise.all(areas.map(writeArea));
  }

  function update(area, updater) {
    if (!AREAS.includes(area)) throw new Error(`Unknown area "${area}"`);
    const next = typeof updater === 'function' ? updater(state[area]) : updater;
    if (next === state[area]) return;
    const { value } = coerceArea(area, next);
    state = { ...state, [area]: value };
    persist(area);
    emit();
  }

  async function writeAllAreas() {
    await Promise.all(AREAS.map(writeArea));
  }

  /** Used by import: validate first, then apply every area at once. */
  async function replaceAll(incoming) {
    const base = defaultState();
    const next = { ...base, version: STATE_VERSION };
    const issues = [];
    for (const area of AREAS) {
      const { value, issues: areaIssues } = coerceArea(area, incoming?.[area]);
      next[area] = value;
      issues.push(...areaIssues);
    }
    state = next;
    await writeAllAreas();
    setStatus({ issues });
    emit();
    return { issues };
  }

  async function saveSnapshot() {
    if (!storage) return false;
    try {
      await storage.set(SNAPSHOT_KEY, { takenAt: new Date().toISOString(), state: structuredClone(state) });
      return true;
    } catch {
      return false;
    }
  }

  async function readSnapshot() {
    if (!storage) return null;
    try {
      return (await storage.get(SNAPSHOT_KEY)) ?? null;
    } catch {
      return null;
    }
  }

  async function reset() {
    state = defaultState();
    if (storage) {
      try {
        await storage.clear();
      } catch (error) {
        setStatus({ writeError: describeStorageError(error) });
      }
    }
    setStatus({ issues: [] });
    emit();
  }

  function dismissIssues() {
    if (status.issues.length === 0) return;
    setStatus({ issues: [] });
    emit();
  }

  return {
    init,
    flush,
    update,
    ensureArea,
    ensureAllAreas,
    replaceAll,
    reset,
    saveSnapshot,
    readSnapshot,
    dismissIssues,
    getState: () => state,
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
