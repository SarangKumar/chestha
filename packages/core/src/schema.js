import { newId } from './ids.js';
import { isValidISODate } from './dates.js';
import { PRIORITIES, normalizeTags, normalizeTag, tagKey } from './tasks.js';
import { coerceRecurrence } from './recurrence.js';
import { coerceShortcuts } from './shortcuts.js';
import { DEFAULT_THEME, coerceTheme } from './theme.js';
import { coerceGithubForm } from './github.js';
import { coerceTemperatureUnit, coerceWeatherPlace } from './weather.js';
import { READING_CACHE_LIMIT, coerceFeedPost } from './posts/remote.js';
import {
  BASE_COLUMNS, LEGACY_BASE_COLUMNS, V3_COLUMNS, createPlacement, migrateOrderedLayout,
  needsMigration, normalizeLayout, scaleLayout,
} from './layout.js';
import {
  DSA_AREAS, DSA_LAZY_AREAS, coerceDsaArea, defaultDsaLibrary, defaultDsaLists,
  defaultDsaProgress, defaultDsaSettings,
} from './dsa/schema.js';
import {
  GROVE_AREAS, GROVE_LAZY_AREAS, coerceGroveArea, defaultGroveFocus, defaultGroveGarden,
  defaultGroveSettings, defaultGroveTime,
} from './grove/schema.js';
import { defaultLedger } from './grove/ledger.js';

// 2 adds the four dsa.* areas; 3 adds the five grove.* areas. Version 1 and 2 files
// still import: missing areas fall back to their defaults rather than being treated
// as corrupt.
//
// `reading` was added without a bump on purpose: it is a re-fetchable cache, so an
// older file simply arrives without it and gets the default. A bump is for data
// that would otherwise be misread, not for every new area.
export const STATE_VERSION = 3;

// Each area is loaded, validated and persisted independently, so one corrupt
// area degrades to its default without taking the rest of the app with it.
export const AREAS = [
  'tasks', 'tags', 'notes', 'dashboard', 'sound', 'settings', 'reading',
  ...DSA_AREAS,
  ...GROVE_AREAS,
];

/** Areas skipped by init() and loaded on first use instead. */
export const LAZY_AREAS = ['reading', ...DSA_LAZY_AREAS, ...GROVE_LAZY_AREAS];

export const WIDGET_SIZES = ['1x1', '2x1', '2x2'];

/** How a widget presents itself on the dashboard. */
export const WIDGET_PRESENTATIONS = ['card', 'transparent', 'inset'];

/** Direction the Shortcuts widget lays its tiles out in. */
export const WIDGET_FLOWS = ['ltr', 'rtl', 'ttb', 'btt'];

/**
 * The shipped arrangement, described by horizontal + vertical anchors rather
 * than fixed coordinates.
 *
 * Columns and rows both depend on the window. Anchoring states intent: weather
 * top-right, clock + search centred as a stack (horizontally and vertically),
 * scratchpad bottom-left, shortcuts bottom-right. Every widget is `pinned` so
 * compaction cannot collapse the open mid-board; "Tidy up" releases those.
 *
 * `offset` shifts a widget inward from its horizontal anchor, in columns.
 * `vOffset` shifts inward from its vertical anchor, in rows — down from `top`,
 * up from `bottom`. A `middle` widget has no inward direction, so there it
 * lifts the whole centre stack: the clock and search move together or not at
 * all, and giving them different offsets would split a stack whose point is
 * that it is one thing.
 */
/**
 * Default dashboard — sparse corners + centre stack (glass / transparent).
 * No Focus Garden or intention on the shipped board (add those from the picker).
 */
const DEFAULT_SKETCH = [
  { id: 'w_weather', type: 'weather', anchor: 'right', vAnchor: 'top', offset: 0, vOffset: 0, w: 3, h: 2,
    config: { presentation: 'transparent' } },
  { id: 'w_clock', type: 'clock', anchor: 'center', vAnchor: 'middle', offset: 0, vOffset: 1, w: 9, h: 2,
    config: { showSeconds: false, presentation: 'transparent' } },
  { id: 'w_search', type: 'search', anchor: 'center', vAnchor: 'middle', offset: 0, vOffset: 1, w: 11, h: 2,
    config: { presentation: 'transparent' } },
  { id: 'w_notes', type: 'notes', anchor: 'left', vAnchor: 'bottom', offset: 0, vOffset: 1, w: 5, h: 3,
    config: { presentation: 'transparent' } },
  { id: 'w_shortcuts', type: 'shortcuts', anchor: 'right', vAnchor: 'bottom', offset: 0, vOffset: 1, w: 4, h: 2,
    config: { presentation: 'transparent' } },
];

/**
 * The width / height the stored default is resolved at.
 *
 * Only as many fixed-size columns as fit are on screen — enough for the default
 * at a 1024px window. Restoring the default re-resolves against the live grid
 * so corners and the centre stack reach whatever screen you are on.
 */
const DEFAULT_COLUMNS = 16;

/** Row count used when the viewport has not been measured yet. Tall enough that
 *  the centred clock+search stack does not collide with bottom-corner widgets. */
const DEFAULT_ROWS = 14;

/** Floor for vertical resolution — below this the centre stack and bottom
 *  corners cannot coexist without overlap on the search/notes columns. */
const MIN_DEFAULT_ROWS = 10;

function clampDefaultColumns(columns) {
  return Math.max(11, Math.min(BASE_COLUMNS, Math.round(columns) || DEFAULT_COLUMNS));
}

function clampDefaultRows(rows) {
  return Math.max(MIN_DEFAULT_ROWS, Math.round(rows) || DEFAULT_ROWS);
}

/**
 * The default arrangement resolved against a given grid size.
 *
 * Everything is anchored (`pinned`), because the positions are deliberate and
 * compaction would otherwise collapse the whole thing into the first column on
 * the very first render.
 */
export function defaultWidgetsFor(columns = DEFAULT_COLUMNS, rows = DEFAULT_ROWS) {
  // The widest widget is 11 columns (search), so below that nothing can be placed as
  // drawn; above BASE_COLUMNS is off the canonical grid.
  const cols = clampDefaultColumns(columns);
  const rowCount = clampDefaultRows(rows);

  // Clock + search form one vertically centred stack (order in DEFAULT_SKETCH).
  const middle = DEFAULT_SKETCH.filter((s) => s.vAnchor === 'middle');
  const stackH = middle.reduce((sum, s) => sum + s.h, 0);
  // One lift for the whole stack, not one per widget — see the note above.
  const stackLift = middle.reduce((max, s) => Math.max(max, s.vOffset ?? 0), 0);
  let stackY = Math.max(0, Math.round((rowCount - stackH) / 2) - stackLift);
  const middleY = new Map();
  for (const s of middle) {
    middleY.set(s.id, stackY);
    stackY += s.h;
  }
  const stackEnd = middle.reduce((max, s) => Math.max(max, (middleY.get(s.id) ?? 0) + s.h), 0);

  return DEFAULT_SKETCH.map(({ anchor, vAnchor, offset = 0, vOffset = 0, config, ...widget }) => {
    const x = anchor === 'right'
      ? Math.max(0, cols - widget.w - offset)
      : anchor === 'center'
        ? Math.max(0, Math.round((cols - widget.w) / 2) + offset)
        : Math.min(offset, Math.max(0, cols - widget.w));

    let y;
    if (vAnchor === 'top') {
      y = Math.max(0, vOffset);
    } else if (vAnchor === 'bottom') {
      // Hug the bottom of the live grid, but never climb into the centre stack
      // (search overlaps notes/shortcuts in x on typical widths).
      y = Math.max(stackEnd, rowCount - widget.h - vOffset);
    } else {
      y = middleY.get(widget.id) ?? Math.max(0, Math.round((rowCount - widget.h) / 2));
    }

    return { ...widget, x, y, pinned: true, config: { ...(config ?? {}) } };
  });
}

/**
 * Recover the grid height a resolved default was drawn for.
 *
 * Bottom-anchored widgets sit `vOffset` rows above the last row, so the offset
 * has to be added back. Two callers need this — the "is this still the shipped
 * sketch" check and the "does it need re-anchoring" check — and when they each
 * did the arithmetic inline, lifting the sketch by one row broke one of them
 * silently while the other kept working.
 */
function rowsBehind(notes) {
  const sketch = DEFAULT_SKETCH.find((entry) => entry.id === 'w_notes');
  return notes.y + notes.h + (sketch?.vOffset ?? 0);
}

/**
 * True when `widgets` is still the shipped corner sketch (same ids, types,
 * sizes, and pinned anchors) resolved for some column/row count — not a
 * user-custom arrangement. Config (location, links, …) may differ.
 */
export function isShippedDefaultLayout(widgets) {
  if (!Array.isArray(widgets) || widgets.length !== DEFAULT_SKETCH.length) return false;
  const byId = Object.fromEntries(widgets.map((w) => [w.id, w]));
  for (const sketch of DEFAULT_SKETCH) {
    const w = byId[sketch.id];
    if (!w || w.type !== sketch.type || w.w !== sketch.w || w.h !== sketch.h) {
      return false;
    }
    if (!w.pinned) return false;
  }
  const weather = byId.w_weather;
  const notes = byId.w_notes;
  if (!weather || !notes) return false;
  const resolvedCols = weather.x + weather.w;
  const resolvedRows = rowsBehind(notes);
  const expected = defaultWidgetsFor(resolvedCols, resolvedRows);
  return expected.every((e) => {
    const w = byId[e.id];
    return w && w.x === e.x && w.y === e.y && w.w === e.w && w.h === e.h;
  });
}

/**
 * The stored default is written at DEFAULT_COLUMNS × DEFAULT_ROWS. When the
 * layout is still that untouched sketch and the live grid differs, re-resolve
 * so corners hug the edges and the clock/search stack stays centred.
 */
export function shouldReanchorDefault(widgets, columns, rows = DEFAULT_ROWS) {
  if (!isShippedDefaultLayout(widgets)) return false;
  const cols = clampDefaultColumns(columns);
  const rowCount = clampDefaultRows(rows);
  const weather = widgets.find((w) => w.id === 'w_weather');
  const notes = widgets.find((w) => w.id === 'w_notes');
  if (!weather || !notes) return false;
  return weather.x + weather.w !== cols || rowsBehind(notes) !== rowCount;
}

/**
 * Resolve the shipped sketch for `columns` × `rows`, copying each widget's
 * existing `config` so a re-anchor does not wipe weather location, shortcuts, etc.
 */
export function reanchorDefaultWidgets(widgets, columns, rows = DEFAULT_ROWS) {
  const byId = Object.fromEntries((widgets ?? []).map((w) => [w.id, w]));
  return defaultWidgetsFor(columns, rows).map((next) => {
    const prev = byId[next.id];
    return prev?.config ? { ...next, config: { ...next.config, ...prev.config } } : next;
  });
}

export const DEFAULT_DASHBOARD = {
  version: 3,
  widgets: defaultWidgetsFor(DEFAULT_COLUMNS, DEFAULT_ROWS),
};

/**
 * What the start screen opens to. The board is the workspace's own data; `read`
 * is the community feed. This is a persisted preference rather than a route,
 * so a deep link to `#/dashboard` honours whichever the user last chose.
 */
export const START_MODES = ['board', 'read'];

export const DEFAULT_SETTINGS = {
  theme: DEFAULT_THEME,
  upcomingHorizonDays: 7,
  weekStartsOn: 0,
  hideCompleted: false,
  firstRunNoticeDismissed: false,
  exportReminderDismissed: false,
  lastExportAt: null,
  shortcuts: {},
  background: { kind: 'none', image: '', dim: 0.45 },
  // DSA is hidden by default: the section is paused and incomplete (no search,
  // no filters, no solving UI), so a new user meeting it first would judge the
  // product by its least finished part. It is a default, not a removal — the
  // switch is in Settings → Navigation, and `#/dsa` and the command palette
  // still reach it, as they do for any hidden section.
  //
  // This only affects profiles with no stored settings. Anyone who already has
  // `hiddenSections` keeps what they have, because an empty list is
  // indistinguishable from a deliberate choice to show everything.
  hiddenSections: ['dsa'],
  glass: 0.55,
  startMode: 'board',
};

/**
 * Sections that may be hidden from the navigation rail.
 *
 * Settings is deliberately absent. Hiding it would leave the command palette as
 * the only way back to the switch that unhides it — fine with a keyboard,
 * a dead end on a phone. A setting that can lock you out of settings is not a
 * preference, it is a trap.
 *
 * Hiding only affects the rail. A hidden section still renders from a deep link
 * or the palette, so nothing becomes unreachable and no data is touched.
 */
// The start screen is absent on purpose: it is not a rail item (see
// `NavRail`), so there is nothing about it to hide. Writing is absent for the
// same reason — it was removed from the rail and reaches the palette instead.
export const HIDEABLE_SECTIONS = ['tasks', 'calendar', 'dsa', 'grove', 'websites', 'sounds'];

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
  /**
   * Whether one of the user's own tracks repeats when it reaches the end.
   *
   * It only governs streamed tracks. A built-in is a couple of minutes of
   * ambience and always loops — ambience that stopped after one pass would be
   * a bug, not a preference — so the engine never applies this to one.
   *
   * True by default, because that is what the engine did before the flag
   * existed and a stored state written by an older version must keep behaving
   * the way its owner left it.
   */
  loop: true,
};

export function defaultState() {
  return {
    version: STATE_VERSION,
    tasks: [],
    tags: [],
    notes: { text: '' },
    dashboard: structuredClone(DEFAULT_DASHBOARD),
    sound: structuredClone(DEFAULT_SOUND),
    reading: defaultReading(),
    settings: {
      ...DEFAULT_SETTINGS,
      shortcuts: {},
      background: { kind: 'none', image: '', dim: 0.45 },
    },
    'dsa.library': defaultDsaLibrary(),
    'dsa.progress': defaultDsaProgress(),
    'dsa.lists': defaultDsaLists(),
    'dsa.settings': defaultDsaSettings(),
    'grove.settings': defaultGroveSettings(),
    'grove.time': defaultGroveTime(),
    'grove.ledger': defaultLedger(),
    'grove.focus': defaultGroveFocus(),
    'grove.garden': defaultGroveGarden(),
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
    case 'reading': return coerceReading(raw);
    default:
      if (DSA_AREAS.includes(area)) return coerceDsaArea(area, raw);
      if (GROVE_AREAS.includes(area)) return coerceGroveArea(area, raw);
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
    let placed = cleaned.map(createPlacement);
    // Version 2 was stored against a grid half as fine. Doubling keeps every
    // widget exactly the size and position it had on screen.
    if (Number(raw.version) < 3) {
      placed = scaleLayout(placed, V3_COLUMNS / LEGACY_BASE_COLUMNS);
    }
    widgets = normalizeLayout(placed, BASE_COLUMNS);
  }

  return { value: { version: 3, widgets }, issues };
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
  // A weather place arrives from a geocoder response and ends up in a request
  // URL, so it is re-validated on read rather than trusted from storage.
  if ('place' in config) {
    const place = coerceWeatherPlace(config.place);
    if (place) config.place = place;
    else delete config.place;
  }
  if ('unit' in config) config.unit = coerceTemperatureUnit(config.unit);
  // A widget shape from a newer build falls back rather than rendering nothing.
  if ('form' in config) config.form = coerceGithubForm(config.form);
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
      loop: bool(raw.loop, true),
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

/**
 * Only known, hideable ids survive, and never all of them: an empty rail reads
 * as a broken app rather than a configured one, so the last visible section
 * cannot be hidden. Order follows HIDEABLE_SECTIONS so the stored value does not
 * depend on the order the boxes were ticked.
 */
function coerceHiddenSections(raw) {
  if (!Array.isArray(raw)) return [];
  const hidden = HIDEABLE_SECTIONS.filter((id) => raw.includes(id));
  return hidden.length >= HIDEABLE_SECTIONS.length ? hidden.slice(0, -1) : hidden;
}

function coerceSettings(raw) {
  if (!raw || typeof raw !== 'object') return { value: { ...DEFAULT_SETTINGS }, issues: [] };
  return {
    value: {
      theme: coerceTheme(raw.theme),
      upcomingHorizonDays: Math.round(num(raw.upcomingHorizonDays, 7, 1, 60)),
      weekStartsOn: raw.weekStartsOn === 1 ? 1 : 0,
      hideCompleted: bool(raw.hideCompleted, false),
      firstRunNoticeDismissed: bool(raw.firstRunNoticeDismissed, false),
      exportReminderDismissed: bool(raw.exportReminderDismissed, false),
      lastExportAt: isoInstant(raw.lastExportAt),
      shortcuts: coerceShortcuts(raw.shortcuts),
      background: coerceBackground(raw.background),
      hiddenSections: coerceHiddenSections(raw.hiddenSections),
      glass: num(raw.glass, 0.55, 0, 1),
      startMode: START_MODES.includes(raw.startMode) ? raw.startMode : 'board',
    },
    issues: [],
  };
}

/**
 * The reading cache: the last list of published posts fetched from the website,
 * so Read mode paints immediately and still works offline.
 *
 * This is a cache of someone else's data, not the user's own work, so losing it
 * costs nothing — it is re-fetched. That is why it is lazy (a user who never
 * opens Read mode never loads it) and why it merges last-write-wins.
 */
export function defaultReading() {
  return { version: 1, posts: [], fetchedAt: null, category: null };
}

export function coerceReading(raw) {
  if (!raw || typeof raw !== 'object') return { value: defaultReading(), issues: [] };

  const issues = [];
  let posts = [];
  if (raw.posts != null) {
    if (!Array.isArray(raw.posts)) {
      issues.push('Cached posts were not a list and were cleared.');
    } else {
      // A slug is the identity, so a duplicate is a cache fault, not two posts.
      const seen = new Set();
      for (const item of raw.posts) {
        const post = coerceFeedPost(item);
        if (!post || seen.has(post.slug)) continue;
        seen.add(post.slug);
        posts.push(post);
      }
      posts = posts.slice(0, READING_CACHE_LIMIT);
    }
  }

  return {
    value: {
      version: 1,
      posts,
      fetchedAt: isoInstant(raw.fetchedAt),
      category: str(raw.category).trim() || null,
    },
    issues,
  };
}
