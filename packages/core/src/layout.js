import { newId } from './ids.js';

/**
 * A small deterministic grid-layout engine.
 *
 * Widgets are placed on an integer grid of {x, y, w, h}. Nothing is positioned in
 * pixels, so a layout is resolution-independent and reproducible: the same inputs
 * always give the same arrangement. Rendering maps a cell to a CSS grid track, so
 * snapping is a property of the model rather than something drag code has to
 * approximate.
 *
 * Vertical compaction is the rule that keeps the dashboard gap-free: every widget
 * floats up until something blocks it, preserving its column.
 */

/**
 * The stored coordinate space. Widened from 4 so that a fixed-size square cell
 * can tile a wide screen: with four columns a 176px cell could only ever cover
 * 752px, leaving the right of the page unreachable.
 *
 * No migration is needed. Every existing layout has x < 4, which is still valid
 * here, so old arrangements simply keep the left of the grid and the columns to
 * their right become available.
 */
export const BASE_COLUMNS = 12;

/**
 * The grid spans the page from edge to edge, so the cell is derived from the
 * available width rather than fixed. A column narrower than this is unusable, and
 * that is what reduces the column count on small screens.
 */
export const MIN_CELL_PX = 64;

/** Bounds on the square cell, so it neither vanishes nor balloons. */
export const MIN_ROW_PX = 96;
export const MAX_ROW_PX = 168;

/**
 * The column count for a given page width. The full grid is used wherever the
 * columns stay usable, so the rightmost column really is the right edge of the
 * page; narrow screens drop columns rather than shrink them to nothing.
 */
export function columnsForWidth(width, minCell = MIN_CELL_PX) {
  if (!width || width <= 0) return 4;
  return Math.min(BASE_COLUMNS, Math.max(4, Math.floor(width / minCell)));
}

/** A square cell, derived from the page so the grid fills it exactly. */
export function cellForWidth(width, columns, gap = 16) {
  if (!width || !columns) return MIN_ROW_PX;
  const square = (width - gap * (columns - 1)) / columns;
  return Math.round(Math.min(MAX_ROW_PX, Math.max(MIN_ROW_PX, square)));
}

export const MIN_W = 1;
export const MIN_H = 1;

/**
 * A shared vocabulary of named sizes. Widgets pick the ones that suit their
 * content rather than all being offered the same five: a search box wants to be
 * wide and short, a task list wants height, and a clock is happiest square.
 *
 * Keeping the vocabulary shared means two widgets never label the same shape
 * differently.
 */
export const SIZE_PRESETS = [
  { key: 'small', label: 'S', title: 'Small', w: 1, h: 1 },
  { key: 'wide', label: 'W', title: 'Wide', w: 2, h: 1 },
  { key: 'tall', label: 'T', title: 'Tall', w: 1, h: 2 },
  { key: 'large', label: 'L', title: 'Large', w: 2, h: 2 },
  { key: 'bar', label: 'B3', title: 'Bar', w: 3, h: 1 },
  { key: 'banner', label: 'B4', title: 'Banner', w: 4, h: 1 },
  { key: 'panel', label: 'P', title: 'Panel', w: 3, h: 2 },
  { key: 'block', label: 'BL', title: 'Block', w: 4, h: 2 },
  { key: 'column', label: 'C', title: 'Column', w: 2, h: 3 },
  { key: 'row', label: 'R', title: 'Full row', w: BASE_COLUMNS, h: 1 },
];

export function presetByKey(key) {
  return SIZE_PRESETS.find((p) => p.key === key) ?? null;
}

/**
 * The sizes a widget offers: the ones it names, still filtered by its limits so a
 * declared size can never contradict a declared bound. A widget that names none
 * falls back to the whole vocabulary.
 *
 * @param keys optional list of preset keys, in the order the widget wants them
 */
export function allowedPresets(limits = {}, keys = null) {
  const minW = limits.minW ?? MIN_W;
  const minH = limits.minH ?? MIN_H;
  const maxW = limits.maxW ?? BASE_COLUMNS;
  const maxH = limits.maxH ?? 8;

  const pool = Array.isArray(keys) && keys.length > 0
    ? keys.map(presetByKey).filter(Boolean)
    : SIZE_PRESETS;

  return pool.filter((p) => p.w >= minW && p.w <= maxW && p.h >= minH && p.h <= maxH);
}

export function presetKeyFor(widget) {
  return SIZE_PRESETS.find((p) => p.w === widget.w && p.h === widget.h)?.key ?? null;
}

export function createPlacement(input = {}) {
  return {
    id: String(input.id ?? '') || newId('w'),
    type: String(input.type ?? ''),
    x: clampInt(input.x, 0, 0, BASE_COLUMNS - 1),
    y: Math.max(0, clampInt(input.y, 0, 0, 9999)),
    w: clampInt(input.w, 1, MIN_W, BASE_COLUMNS),
    h: clampInt(input.h, 1, MIN_H, 8),
    // A widget the user deliberately placed is anchored: compaction will not
    // lift it above the row they chose, though it is still pushed down to
    // resolve a collision.
    pinned: input.pinned === true,
    config: input.config && typeof input.config === 'object' ? { ...input.config } : {},
  };
}

function clampInt(value, fallback, min, max) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function overlaps(a, b) {
  if (a.id === b.id) return false;
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function collisionsFor(items, item) {
  return items.filter((other) => overlaps(item, other));
}

/** Sorted top-to-bottom, then left-to-right: the order compaction resolves in. */
function inReadingOrder(items) {
  return [...items].sort((a, b) => (a.y - b.y) || (a.x - b.x));
}

/**
 * Floats every widget upward into free space, keeping its column. Running this
 * after any move or resize is what removes avoidable whitespace — including the
 * hole left behind by a widget that moved away.
 *
 * An anchored (`pinned`) widget is the exception: it keeps the row the user put
 * it on. Without this, dropping a widget into the bottom of a short column would
 * immediately snap it back to the top, and deliberate placement would be
 * impossible. Everything unpinned still compacts around it, so the layout stays
 * tight apart from the gaps the user actually asked for.
 */
export function compact(items) {
  const placed = [];
  for (const item of inReadingOrder(items)) {
    let y = item.y;
    if (!item.pinned) {
      while (y > 0 && !collisionsFor(placed, { ...item, y: y - 1 }).length) y -= 1;
    }
    // Pinned or not, it must not overlap: push down until it does not.
    while (collisionsFor(placed, { ...item, y }).length) y += 1;
    placed.push({ ...item, y });
  }
  return inReadingOrder(placed);
}

/** Releases every anchor and packs the layout as tightly as possible. */
export function tidy(items) {
  return compact(items.map((i) => ({ ...i, pinned: false })));
}

/**
 * Places `item` at its requested position and pushes whatever it lands on
 * downward, recursively, then compacts. Only widgets actually in the way move.
 */
function resolveCollisions(items, moved) {
  const result = items.map((i) => (i.id === moved.id ? moved : i));
  const settle = (current, subject, guard = 0) => {
    if (guard > 64) return current; // pathological input; stop rather than spin
    const blocked = collisionsFor(current.filter((i) => i.id !== subject.id), subject);
    let next = current;
    for (const other of blocked) {
      const pushed = { ...other, y: subject.y + subject.h };
      next = settle(next.map((i) => (i.id === other.id ? pushed : i)), pushed, guard + 1);
    }
    return next;
  };
  return settle(result, moved);
}

export function moveItem(items, id, x, y, columns = BASE_COLUMNS) {
  const subject = items.find((i) => i.id === id);
  if (!subject) return items;
  const next = {
    ...subject,
    x: Math.min(Math.max(0, Math.round(x)), Math.max(0, columns - subject.w)),
    y: Math.max(0, Math.round(y)),
  };
  if (next.x === subject.x && next.y === subject.y) return items;
  // An explicit move anchors the widget, so compaction respects the drop.
  next.pinned = true;
  return compact(resolveCollisions(items, next));
}

export function resizeItem(items, id, w, h, columns = BASE_COLUMNS, limits = {}) {
  const subject = items.find((i) => i.id === id);
  if (!subject) return items;
  const maxW = Math.min(columns, limits.maxW ?? columns);
  const minW = Math.max(MIN_W, limits.minW ?? MIN_W);
  const minH = Math.max(MIN_H, limits.minH ?? MIN_H);
  const maxH = Math.max(minH, limits.maxH ?? 8);

  const nextW = Math.min(maxW, Math.max(minW, Math.round(w)));
  const next = {
    ...subject,
    w: nextW,
    h: Math.min(maxH, Math.max(minH, Math.round(h))),
    // Pull back in when growing would overflow the right edge.
    x: Math.min(subject.x, Math.max(0, columns - nextW)),
  };
  return compact(resolveCollisions(items, next));
}

/**
 * Makes an arbitrary set of placements valid: in bounds, non-overlapping and
 * compacted. Used on load, so a hand-edited or older layout cannot render broken.
 */
export function normalizeLayout(items, columns = BASE_COLUMNS) {
  const bounded = inReadingOrder(items.map((item) => {
    const w = Math.min(columns, Math.max(MIN_W, item.w));
    return { ...item, w, h: Math.max(MIN_H, item.h), x: Math.min(Math.max(0, item.x), columns - w), y: Math.max(0, item.y) };
  }));

  const placed = [];
  for (const item of bounded) {
    let candidate = { ...item };
    while (collisionsFor(placed, candidate).length) candidate = { ...candidate, y: candidate.y + 1 };
    placed.push(candidate);
  }
  return compact(placed);
}

/** First free cell that fits, scanning top-to-bottom then left-to-right. */
export function findFreeSpot(items, w, h, columns = BASE_COLUMNS) {
  const width = Math.min(columns, Math.max(MIN_W, w));
  for (let y = 0; y < 200; y += 1) {
    for (let x = 0; x <= columns - width; x += 1) {
      const candidate = { id: '__probe__', x, y, w: width, h: Math.max(MIN_H, h) };
      if (!collisionsFor(items, candidate).length) return { x, y };
    }
  }
  return { x: 0, y: items.reduce((max, i) => Math.max(max, i.y + i.h), 0) };
}

export function addItem(items, item, columns = BASE_COLUMNS) {
  const placement = createPlacement(item);
  const spot = findFreeSpot(items, placement.w, placement.h, columns);
  return compact([...items, { ...placement, ...spot }]);
}

export function removeItem(items, id) {
  return compact(items.filter((i) => i.id !== id));
}

/**
 * Projects the stored 4-column layout onto a narrower grid. Reading order is
 * preserved, which is what keeps a desktop arrangement meaningful on a phone
 * instead of letting desktop coordinates produce overlap or overflow.
 */
export function projectToColumns(items, columns) {
  if (columns >= BASE_COLUMNS) return normalizeLayout(items, BASE_COLUMNS);
  const ordered = inReadingOrder(items);
  const projected = [];
  for (const item of ordered) {
    const w = Math.min(columns, item.w);
    const spot = findFreeSpot(projected, w, item.h, columns);
    projected.push({ ...item, w, x: spot.x, y: spot.y });
  }
  return compact(projected);
}

export function layoutHeight(items) {
  return items.reduce((max, i) => Math.max(max, i.y + i.h), 0);
}

/** True when no widget overlaps another — the invariant every operation keeps. */
export function isValidLayout(items, columns = BASE_COLUMNS) {
  for (const item of items) {
    if (item.x < 0 || item.y < 0 || item.x + item.w > columns) return false;
    if (collisionsFor(items, item).length) return false;
  }
  return true;
}

/** Legacy sizes, for migrating an ordered list into coordinates. */
export const LEGACY_SIZE_SPANS = {
  '1x1': { w: 1, h: 1 },
  '2x1': { w: 2, h: 1 },
  '2x2': { w: 2, h: 2 },
};

/**
 * Migrates the previous ordered-list layout (`{id, type, size}`) into
 * coordinates, laying widgets out in their stored order so a user's arrangement
 * survives rather than being reset.
 */
export function migrateOrderedLayout(widgets) {
  let items = [];
  for (const widget of widgets) {
    const span = LEGACY_SIZE_SPANS[widget.size] ?? LEGACY_SIZE_SPANS['1x1'];
    items = addItem(items, {
      id: widget.id,
      type: widget.type,
      w: span.w,
      h: span.h,
      config: widget.config,
    });
  }
  return items;
}

export function needsMigration(widgets) {
  return widgets.some((w) => w && w.size !== undefined && w.x === undefined);
}
