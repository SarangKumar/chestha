import { newId } from './ids.js';
import { isValidISODate } from './dates.js';
import { PRIORITIES, normalizeTags, normalizeTag, tagKey } from './tasks.js';
import { coerceRecurrence } from './recurrence.js';
import { coerceShortcuts } from './shortcuts.js';
import {
  BASE_COLUMNS, createPlacement, migrateOrderedLayout, needsMigration, normalizeLayout,
} from './layout.js';
import {
  DSA_AREAS, DSA_LAZY_AREAS, coerceDsaArea, defaultDsaLibrary, defaultDsaLists,
  defaultDsaProgress, defaultDsaSettings,
} from './dsa/schema.js';

// 2 adds the four dsa.* areas. Version 1 files still import: missing areas
// fall back to their defaults rather than being treated as corrupt.
export const STATE_VERSION = 2;

// Each area is loaded, validated and persisted independently, so one corrupt
// area degrades to its default without taking the rest of the app with it.
export const AREAS = [
  'tasks', 'tags', 'notes', 'dashboard', 'sound', 'settings',
  ...DSA_AREAS,
];

/** Areas skipped by init() and loaded on first use instead. */
export const LAZY_AREAS = [...DSA_LAZY_AREAS];

export const WIDGET_SIZES = ['1x1', '2x1', '2x2'];

/** How a widget presents itself on the dashboard. */
export const WIDGET_PRESENTATIONS = ['card', 'transparent', 'inset'];

/** Direction the Shortcuts widget lays its tiles out in. */
export const WIDGET_FLOWS = ['ltr', 'rtl', 'ttb', 'btt'];

/**
 * The shipped layout, laid out to a sketch rather than packed to the top-left:
 * DSA in the top-right corner, the clock centred with the search bar directly
 * beneath it, the scratchpad bottom-left and shortcuts bottom-right.
 *
 * Every widget is `pinned`, which is load-bearing. Compaction floats unpinned
 * widgets upward, so without anchors the deliberate spacing here would collapse
 * into a block in the first column the moment the dashboard rendered. "Tidy up"
 * releases the anchors for anyone who does want it packed.
 */
export const DEFAULT_DASHBOARD = {
  version: 2,
  widgets: [
    { id: 'w_dsa', type: 'dsaToday', x: 11, y: 0, w: 1, h: 1, pinned: true, config: {} },
    { id: 'w_clock', type: 'clock', x: 5, y: 1, w: 2, h: 1, pinned: true, config: {} },
    { id: 'w_search', type: 'search', x: 4, y: 2, w: 4, h: 1, pinned: true, config: {} },
    { id: 'w_notes', type: 'notes', x: 0, y: 4, w: 2, h: 2, pinned: true, config: {} },
    { id: 'w_shortcuts', type: 'shortcuts', x: 10, y: 4, w: 2, h: 1, pinned: true, config: {} },
  ],
};

export const DEFAULT_SETTINGS = {
  theme: 'system',
  upcomingHorizonDays: 7,
  weekStartsOn: 0,
  hideCompleted: false,
  sidebarOpen: false,
  firstRunNoticeDismissed: false,
  exportReminderDismissed: false,
  lastExportAt: null,
  shortcuts: {},
  background: { kind: 'none', image: '', dim: 0.45 },
};

/**
 * How the app paints behind the interface.
 *
 * Everything except `image` is generated from the theme's own tokens, so it needs
 * no file, costs nothing to load, works offline and follows light/dark
 * automatically.
 */
export const BACKGROUND_PATTERNS = ['glow', 'mesh', 'grid', 'dots', 'rays', 'vignette'];

export const BACKGROUND_KINDS = ['none', ...BACKGROUND_PATTERNS, 'image'];

export const BACKGROUND_LABELS = {
  none: 'None',
  glow: 'Soft glow',
  mesh: 'Mesh',
  grid: 'Fine grid',
  dots: 'Dot matrix',
  rays: 'Rays',
  vignette: 'Vignette',
  image: 'Your own image',
};

export const DEFAULT_SOUND = {
  presets: [],
  lastMix: null,
  masterVolume: 0.6,
  restoreLastMix: true,
};

export function defaultState() {
  return {
    version: STATE_VERSION,
    tasks: [],
    tags: [],
    notes: { text: '' },
    dashboard: structuredClone(DEFAULT_DASHBOARD),
    sound: structuredClone(DEFAULT_SOUND),
    settings: {
      ...DEFAULT_SETTINGS,
      shortcuts: {},
      background: { kind: 'none', image: '', dim: 0.45 },
    },
    'dsa.library': defaultDsaLibrary(),
    'dsa.progress': defaultDsaProgress(),
    'dsa.lists': defaultDsaLists(),
    'dsa.settings': defaultDsaSettings(),
  };
}

function str(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function num(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function bool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function isoInstant(value) {
  if (typeof value !== 'string') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : value;
}

/** @returns {{ value: unknown, issues: string[] }} */
export function coerceArea(area, raw) {
  switch (area) {
    case 'tasks': return coerceTasks(raw);
    case 'tags': return coerceTags(raw);
    case 'notes': return coerceNotes(raw);
    case 'dashboard': return coerceDashboard(raw);
    case 'sound': return coerceSound(raw);
    case 'settings': return coerceSettings(raw);
    default:
      if (DSA_AREAS.includes(area)) return coerceDsaArea(area, raw);
      return { value: null, issues: [`Unknown area "${area}"`] };
  }
}

function coerceTasks(raw) {
  const issues = [];
  if (raw == null) return { value: [], issues };
  if (!Array.isArray(raw)) return { value: [], issues: ['Stored tasks were not a list and were reset.'] };
  const seen = new Set();
  const value = [];
  let dropped = 0;
  for (const item of raw) {
    if (!item || typeof item !== 'object') { dropped += 1; continue; }
    const title = str(item.title).trim();
    if (!title) { dropped += 1; continue; }
    let id = str(item.id);
    if (!id || seen.has(id)) id = newId('task');
    seen.add(id);
    const createdAt = isoInstant(item.createdAt) ?? new Date().toISOString();
    value.push({
      id,
      title,
      notes: str(item.notes),
      due: isValidISODate(item.due) ? item.due : null,
      priority: PRIORITIES.includes(item.priority) ? item.priority : 'none',
      tags: normalizeTags(item.tags),
      recurrence: coerceRecurrence(item.recurrence),
      completedAt: isoInstant(item.completedAt),
      createdAt,
      updatedAt: isoInstant(item.updatedAt) ?? createdAt,
    });
  }
  if (dropped > 0) issues.push(`${dropped} unreadable task${dropped === 1 ? '' : 's'} were skipped.`);
  return { value, issues };
}

function coerceTags(raw) {
  if (!Array.isArray(raw)) return { value: [], issues: [] };
  const seen = new Set();
  const value = [];
  for (const item of raw) {
    const name = normalizeTag(typeof item === 'string' ? item : item?.name);
    if (!name) continue;
    const key = tagKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    value.push(name);
  }
  return { value, issues: [] };
}

function coerceNotes(raw) {
  if (raw == null) return { value: { text: '' }, issues: [] };
  if (typeof raw === 'string') return { value: { text: raw }, issues: [] };
  if (typeof raw !== 'object') return { value: { text: '' }, issues: ['The scratchpad was unreadable and was reset.'] };
  return { value: { text: str(raw.text) }, issues: [] };
}

function coerceDashboard(raw) {
  const issues = [];
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.widgets)) {
    return {
      value: structuredClone(DEFAULT_DASHBOARD),
      issues: raw == null ? [] : ['The dashboard layout was unreadable and the default was restored.'],
    };
  }

  const seen = new Set();
  const cleaned = [];
  for (const item of raw.widgets) {
    if (!item || typeof item !== 'object') continue;
    const type = str(item.type).trim();
    if (!type) continue;
    let id = str(item.id);
    if (!id || seen.has(id)) id = newId('w');
    seen.add(id);
    cleaned.push({ ...item, id, type, pinned: item.pinned === true, config: coerceWidgetConfig(item.config) });
  }

  // Version 1 stored an ordered list with a size name. Migrating lays the widgets
  // out in their stored order, so the user's arrangement survives instead of
  // being discarded for a layout we can still read.
  let widgets;
  if (needsMigration(cleaned)) {
    widgets = migrateOrderedLayout(cleaned);
    issues.push('Your dashboard layout was upgraded to the new grid. Widget order and sizes were kept.');
  } else {
    widgets = normalizeLayout(cleaned.map(createPlacement), BASE_COLUMNS);
  }

  return { value: { version: 2, widgets }, issues };
}

/**
 * A background image is a local filename only. Absolute paths, parent paths and
 * remote URLs are rejected, so a stored setting can never make the app load an
 * image from somewhere else.
 */
function coerceBackground(raw) {
  const fallback = { kind: 'none', image: '', dim: 0.45 };
  if (!raw || typeof raw !== 'object') return fallback;
  const image = str(raw.image).trim();
  const safe = image && !image.includes('..') && !image.startsWith('/') && !/^[a-z]+:/i.test(image)
    ? image
    : '';
  const kind = BACKGROUND_KINDS.includes(raw.kind) ? raw.kind : 'none';
  return {
    // Asking for an image without naming a usable one is not a background.
    kind: kind === 'image' && !safe ? 'none' : kind,
    image: safe,
    dim: num(raw.dim, 0.45, 0, 0.9),
  };
}

function coerceWidgetConfig(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const config = { ...raw };
  if ('presentation' in config && !WIDGET_PRESENTATIONS.includes(config.presentation)) {
    delete config.presentation;
  }
  if ('flow' in config && !WIDGET_FLOWS.includes(config.flow)) {
    delete config.flow;
  }
  // Shortcut links are user input, so they are bounded and scheme-checked here
  // rather than trusted from storage.
  if ('links' in config) {
    config.links = (Array.isArray(config.links) ? config.links : []).reduce((out, link) => {
      if (out.length >= 12 || !link || typeof link !== 'object') return out;
      const url = str(link.url).trim();
      if (!/^https?:\/\//i.test(url)) return out;
      out.push({
        id: str(link.id) || newId('lnk'),
        url,
        label: str(link.label).trim().slice(0, 40) || url,
      });
      return out;
    }, []);
  }
  return config;
}

function coerceSound(raw) {
  if (!raw || typeof raw !== 'object') {
    return { value: structuredClone(DEFAULT_SOUND), issues: [] };
  }
  const presets = [];
  if (Array.isArray(raw.presets)) {
    const seen = new Set();
    for (const item of raw.presets) {
      if (!item || typeof item !== 'object') continue;
      const name = str(item.name).trim();
      if (!name) continue;
      let id = str(item.id);
      if (!id || seen.has(id)) id = newId('preset');
      seen.add(id);
      presets.push({ id, name, mix: coerceMix(item.mix) });
    }
  }
  return {
    value: {
      presets,
      lastMix: raw.lastMix == null ? null : coerceMix(raw.lastMix),
      masterVolume: num(raw.masterVolume, DEFAULT_SOUND.masterVolume, 0, 1),
      restoreLastMix: bool(raw.restoreLastMix, true),
    },
    issues: [],
  };
}

function coerceMix(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const mix = {};
  for (const [key, volume] of Object.entries(raw)) {
    const id = str(key).trim();
    if (!id) continue;
    mix[id] = num(volume, 0.5, 0, 1);
  }
  return mix;
}

function coerceSettings(raw) {
  if (!raw || typeof raw !== 'object') return { value: { ...DEFAULT_SETTINGS }, issues: [] };
  return {
    value: {
      theme: ['system', 'light', 'dark'].includes(raw.theme) ? raw.theme : 'system',
      upcomingHorizonDays: Math.round(num(raw.upcomingHorizonDays, 7, 1, 60)),
      weekStartsOn: raw.weekStartsOn === 1 ? 1 : 0,
      hideCompleted: bool(raw.hideCompleted, false),
      sidebarOpen: bool(raw.sidebarOpen, false),
      firstRunNoticeDismissed: bool(raw.firstRunNoticeDismissed, false),
      exportReminderDismissed: bool(raw.exportReminderDismissed, false),
      lastExportAt: isoInstant(raw.lastExportAt),
      shortcuts: coerceShortcuts(raw.shortcuts),
      background: coerceBackground(raw.background),
    },
    issues: [],
  };
}
