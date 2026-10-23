import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_COLUMNS, addItem, coerceArea, collisionsFor, compact, createPlacement, createStore,
  DEFAULT_DASHBOARD, allowedPresets, findFreeSpot, isValidLayout, layoutHeight,
  migrateOrderedLayout, moveItem, needsMigration, normalizeLayout, overlaps, presetKeyFor,
  projectToColumns, removeItem, resizeItem, tidy, columnsForWidth, cellForWidth,
  CELL_PX, SIZE_PRESETS, presetByKey, scaleLayout, LEGACY_BASE_COLUMNS, V3_COLUMNS,
  defaultWidgetsFor,
} from '../src/index.js';

const at = (id, x, y, w = 1, h = 1) => createPlacement({ id, type: 't', x, y, w, h });
const show = (items) => [...items]
  .sort((a, b) => (a.y - b.y) || (a.x - b.x))
  .map((i) => `${i.id}(${i.x},${i.y},${i.w}x${i.h})`)
  .join(' ');

// ─── Overlap is the invariant every operation preserves ──────────────────────

test('overlap detection is exact on edges', () => {
  assert.equal(overlaps(at('a', 0, 0, 2, 1), at('b', 2, 0, 1, 1)), false, 'touching is not overlapping');
  assert.equal(overlaps(at('a', 0, 0, 2, 1), at('b', 1, 0, 1, 1)), true);
  assert.equal(overlaps(at('a', 0, 0, 1, 2), at('b', 0, 1, 1, 1)), true, 'vertical spans count');
  assert.equal(overlaps(at('a', 0, 0, 1, 1), at('a', 0, 0, 1, 1)), false, 'an item never collides with itself');
});

// ─── Compaction: the gap-free rule ───────────────────────────────────────────

test('widgets float up into free space, keeping their column', () => {
  const items = [at('a', 0, 0), at('b', 1, 5), at('c', 2, 9)];
  const packed = compact(items);
  assert.equal(show(packed), 'a(0,0,1x1) b(1,0,1x1) c(2,0,1x1)');
  assert.equal(layoutHeight(packed), 1);
});

test('a widget stops below whatever blocks it rather than passing through', () => {
  const packed = compact([at('a', 0, 0, 1, 2), at('b', 0, 6)]);
  assert.equal(show(packed), 'a(0,0,1x2) b(0,2,1x1)', 'b lands directly under a');
  assert.ok(isValidLayout(packed, BASE_COLUMNS));
});

test('the hole left by a moved widget is filled', () => {
  // a occupies the top-left; c sits below it.
  let items = [at('a', 0, 0, 2, 2), at('b', 2, 0, 2, 1), at('c', 0, 2, 2, 1)];
  assert.equal(layoutHeight(items), 3);

  // Move the tall widget away; the space it vacated must close behind it.
  items = moveItem(items, 'a', 2, 4, BASE_COLUMNS);
  assert.ok(isValidLayout(items, BASE_COLUMNS));
  assert.equal(items.find((i) => i.id === 'c').y, 0, 'c floated up into the vacated space');

  // The destination row is honoured rather than compacted away — that is the
  // anchoring rule, and it is why dropping into a short column now works.
  assert.equal(items.find((i) => i.id === 'a').y, 4);

  // Tidy is the way back to a fully packed layout.
  assert.equal(layoutHeight(tidy(items)), 3, 'tidy removes the deliberate gap');
});

test('compaction is deterministic and idempotent', () => {
  const items = [at('a', 0, 3, 2, 1), at('b', 2, 1), at('c', 0, 7, 1, 2)];
  const once = compact(items);
  const twice = compact(once);
  assert.equal(show(once), show(twice), 'running it again changes nothing');
  assert.equal(show(compact([...items].reverse())), show(once), 'input order does not matter');
});

// ─── Moving: snapping and rearrangement ──────────────────────────────────────

test('a move snaps to integer cells and stays inside the grid', () => {
  const items = [at('a', 0, 0), at('b', 3, 0)];
  const moved = moveItem(items, 'a', 1.6, 0.4, BASE_COLUMNS);
  const a = moved.find((i) => i.id === 'a');
  assert.equal(a.x, 2, 'rounded to the nearest column');
  assert.equal(a.y, 0);

  const clamped = moveItem(items, 'a', 99, 0, 4);
  assert.equal(clamped.find((i) => i.id === 'a').x, 3, 'clamped to the last column that fits');

  const wide = moveItem([at('a', 0, 0, 2, 1)], 'a', 99, 0, 4);
  assert.equal(wide.find((i) => i.id === 'a').x, 2, 'a 2-wide widget stops where it still fits');

  // And with the full stored width, the right-hand columns are reachable.
  const far = moveItem(items, 'a', 99, 0, BASE_COLUMNS);
  assert.equal(far.find((i) => i.id === 'a').x, BASE_COLUMNS - 1, 'reaches the last column of the grid');
});

test('dropping onto an occupied cell pushes only what is in the way', () => {
  const items = [at('a', 0, 0), at('b', 1, 0), at('c', 2, 0), at('d', 3, 0)];
  const moved = moveItem(items, 'd', 1, 0, BASE_COLUMNS);
  assert.ok(isValidLayout(moved, BASE_COLUMNS));
  assert.equal(moved.find((i) => i.id === 'd').x, 1);
  assert.equal(moved.find((i) => i.id === 'b').y, 1, 'the displaced widget moved down');
  assert.equal(moved.find((i) => i.id === 'a').y, 0, 'untouched neighbours stayed put');
  assert.equal(moved.find((i) => i.id === 'c').y, 0);
});

test('a widget can be moved anywhere, not just reordered in a sequence', () => {
  const items = [at('a', 0, 0), at('b', 1, 0), at('c', 2, 0)];
  const moved = moveItem(items, 'a', 3, 0, BASE_COLUMNS);
  assert.equal(moved.find((i) => i.id === 'a').x, 3, 'moved to a specific column');
  assert.ok(isValidLayout(moved, BASE_COLUMNS));
});

test('a chain of pushes never produces an overlap', () => {
  let items = [at('a', 0, 0), at('b', 0, 1), at('c', 0, 2), at('d', 2, 0)];
  items = moveItem(items, 'd', 0, 0, BASE_COLUMNS);
  assert.ok(isValidLayout(items, BASE_COLUMNS), 'layout still valid after a cascade');
  assert.equal(new Set(items.map((i) => i.id)).size, 4, 'nothing was lost');
});

// ─── Resizing ────────────────────────────────────────────────────────────────

test('resizing snaps to grid increments and respects limits', () => {
  const items = [at('a', 0, 0), at('b', 2, 0)];
  const grown = resizeItem(items, 'a', 2.4, 1.6, BASE_COLUMNS, { minW: 1, maxW: 4, minH: 1, maxH: 4 });
  const a = grown.find((i) => i.id === 'a');
  assert.equal(a.w, 2);
  assert.equal(a.h, 2);
  assert.ok(isValidLayout(grown, BASE_COLUMNS));

  const tooSmall = resizeItem(items, 'a', 0, 0, BASE_COLUMNS, { minW: 2, minH: 2 });
  assert.equal(tooSmall.find((i) => i.id === 'a').w, 2, 'minimum width enforced');
  assert.equal(tooSmall.find((i) => i.id === 'a').h, 2, 'minimum height enforced');

  const tooBig = resizeItem(items, 'a', 9, 9, BASE_COLUMNS, { maxW: 2, maxH: 3 });
  assert.equal(tooBig.find((i) => i.id === 'a').w, 2, 'maximum width enforced');
  assert.equal(tooBig.find((i) => i.id === 'a').h, 3, 'maximum height enforced');
});

test('growing at the right edge pulls the widget back into bounds', () => {
  const resized = resizeItem([at('a', 3, 0)], 'a', 2, 1, 4);
  const a = resized.find((i) => i.id === 'a');
  assert.equal(a.w, 2);
  assert.equal(a.x, 2, 'shifted left so it still fits');
  assert.ok(isValidLayout(resized, 4));
});

test('shrinking a widget lets neighbours compact upward', () => {
  let items = [at('a', 0, 0, 2, 3), at('b', 0, 3, 2, 1)];
  assert.equal(layoutHeight(items), 4);
  items = resizeItem(items, 'a', 2, 1, BASE_COLUMNS);
  assert.equal(items.find((i) => i.id === 'b').y, 1, 'b moved up as a shrank');
  assert.equal(layoutHeight(items), 2);
});

// ─── Adding and removing ─────────────────────────────────────────────────────

test('a new widget takes the first free cell that fits', () => {
  const items = [at('a', 0, 0, 2, 1), at('b', 2, 0)];
  assert.deepEqual(findFreeSpot(items, 1, 1, 4), { x: 3, y: 0 }, 'the gap in row 0');
  assert.deepEqual(findFreeSpot(items, 2, 1, 4), { x: 0, y: 1 }, 'too wide for the gap, so next row');

  const added = addItem(items, { id: 'c', type: 't', w: 1, h: 1 }, 4);
  assert.equal(added.find((i) => i.id === 'c').x, 3);
  assert.ok(isValidLayout(added, 4));
});

test('removing a widget compacts the rest', () => {
  const items = [at('a', 0, 0, 4, 1), at('b', 0, 1, 2, 1)];
  const removed = removeItem(items, 'a');
  assert.equal(removed.find((i) => i.id === 'b').y, 0);
  assert.equal(layoutHeight(removed), 1);
});

// ─── Normalising arbitrary input ─────────────────────────────────────────────

test('an overlapping or out-of-bounds layout is repaired, not rejected', () => {
  const messy = [
    createPlacement({ id: 'a', type: 't', x: 0, y: 0, w: 2, h: 2 }),
    createPlacement({ id: 'b', type: 't', x: 1, y: 1, w: 2, h: 1 }), // overlaps a
    createPlacement({ id: 'c', type: 't', x: 9, y: 0, w: 9, h: 1 }), // out of bounds
  ];
  const fixed = normalizeLayout(messy, BASE_COLUMNS);
  assert.ok(isValidLayout(fixed, BASE_COLUMNS));
  assert.equal(fixed.length, 3, 'nothing is dropped');
  assert.ok(fixed.every((i) => i.x >= 0 && i.x + i.w <= BASE_COLUMNS));
});

test('repeated operations do not progressively corrupt a layout', () => {
  let items = normalizeLayout([at('a', 0, 0, 2, 2), at('b', 2, 0), at('c', 3, 0), at('d', 2, 1, 2, 1)], BASE_COLUMNS);
  const ids = items.map((i) => i.id).sort();
  for (let i = 0; i < 40; i += 1) {
    items = moveItem(items, ids[i % ids.length], i % BASE_COLUMNS, (i * 3) % 5, BASE_COLUMNS);
    items = resizeItem(items, ids[(i + 1) % ids.length], 1 + (i % 2), 1 + ((i + 1) % 2), BASE_COLUMNS);
    assert.ok(isValidLayout(items, BASE_COLUMNS), `still valid at iteration ${i}`);
  }
  assert.deepEqual(items.map((i) => i.id).sort(), ids, 'no widget was lost or duplicated');
  assert.ok(layoutHeight(items) <= 8, 'the layout did not drift downward forever');
});

// ─── Responsive projection ───────────────────────────────────────────────────

test('a desktop layout projects onto narrower grids without overlap', () => {
  const desktop = normalizeLayout([at('a', 0, 0, 2, 2), at('b', 2, 0, 2, 1), at('c', 2, 1), at('d', 3, 1)], BASE_COLUMNS);

  for (const columns of [1, 2]) {
    const projected = projectToColumns(desktop, columns);
    assert.ok(isValidLayout(projected, columns), `valid at ${columns} columns`);
    assert.ok(projected.every((i) => i.x + i.w <= columns), `no overflow at ${columns} columns`);
    assert.equal(projected.length, desktop.length, 'every widget survives');
  }

  const single = projectToColumns(desktop, 1);
  assert.ok(single.every((i) => i.w === 1 && i.x === 0), 'one column means one per row');
});

test('projecting does not mutate the stored desktop layout', () => {
  const desktop = normalizeLayout([at('a', 0, 0, 2, 2), at('b', 2, 0, 2, 1)], BASE_COLUMNS);
  const before = show(desktop);
  projectToColumns(desktop, 1);
  assert.equal(show(desktop), before, 'the source layout is untouched');
  assert.equal(show(projectToColumns(desktop, BASE_COLUMNS)), before, 'projecting at full width is identity');
});

// ─── Migration from the ordered-list layout ──────────────────────────────────

test('an ordered v1 layout migrates to coordinates in its stored order', () => {
  const legacy = [
    { id: 'a', type: 'today', size: '2x2', config: {} },
    { id: 'b', type: 'clock', size: '1x1', config: { presentation: 'transparent' } },
    { id: 'c', type: 'overdue', size: '1x1', config: {} },
    { id: 'd', type: 'upcoming', size: '2x1', config: { horizonDays: 14 } },
  ];
  assert.equal(needsMigration(legacy), true);
  const migrated = migrateOrderedLayout(legacy);
  assert.ok(isValidLayout(migrated, BASE_COLUMNS));
  assert.deepEqual(migrated.map((i) => i.id).sort(), ['a', 'b', 'c', 'd']);
  assert.equal(migrated.find((i) => i.id === 'a').w, 2, 'the 2x2 kept its span');
  assert.equal(migrated.find((i) => i.id === 'a').h, 2);
  assert.deepEqual(migrated.find((i) => i.id === 'b').config, { presentation: 'transparent' }, 'config survives');
  assert.equal(migrated.find((i) => i.id === 'd').config.horizonDays, 14);
  assert.equal(needsMigration(migrated), false, 'migrating twice is not needed');
});

test('a layout stored against the coarser grid is doubled, not reset', () => {
  const { value } = coerceArea('dashboard', {
    version: 2,
    widgets: [
      { id: 'a', type: 'clock', x: 5, y: 1, w: 2, h: 1, pinned: true, config: {} },
      { id: 'b', type: 'notes', x: 0, y: 4, w: 2, h: 2, config: {} },
    ],
  });

  assert.equal(value.version, 3);
  const clock = value.widgets.find((w) => w.id === 'a');
  // Doubling keeps it exactly the size and place it occupied on screen.
  assert.deepEqual([clock.x, clock.y, clock.w, clock.h], [10, 2, 4, 2]);
  assert.equal(clock.pinned, true, 'anchors survive the rescale');
  assert.ok(isValidLayout(value.widgets, BASE_COLUMNS));

  // Scaling is exact, so nothing is lost or rounded away.
  const scaled = scaleLayout([at('x', 3, 2, 2, 2)], V3_COLUMNS / LEGACY_BASE_COLUMNS);
  assert.deepEqual([scaled[0].x, scaled[0].y, scaled[0].w, scaled[0].h], [6, 4, 4, 4]);
});

test('the stored dashboard area migrates on read and reports it', () => {
  const { value, issues } = coerceArea('dashboard', {
    widgets: [
      { id: 'a', type: 'today', size: '2x2', config: {} },
      { id: 'b', type: 'clock', size: '1x1', config: { presentation: 'transparent' } },
    ],
  });
  assert.equal(value.version, 3);
  assert.ok(isValidLayout(value.widgets, BASE_COLUMNS));
  assert.equal(value.widgets.length, 2, 'no widget silently lost');
  assert.match(issues[0], /upgraded to the new grid/);
  assert.equal(value.widgets.find((w) => w.type === 'clock').config.presentation, 'transparent');
});

test('a current layout round-trips through storage unchanged', async () => {
  const store = createStore();
  await store.init();
  const arrangement = [
    { id: 'w1', type: 'clock', x: 6, y: 0, w: 2, h: 2, config: { presentation: 'transparent' } },
    { id: 'w2', type: 'notes', x: 0, y: 0, w: 6, h: 4, config: {} },
  ];
  store.update('dashboard', () => ({ version: 3, widgets: arrangement }));
  await store.flush();

  const saved = store.getState().dashboard.widgets;
  assert.ok(isValidLayout(saved, BASE_COLUMNS));
  assert.equal(saved.find((w) => w.id === 'w1').x, 6, 'position preserved exactly');
  assert.equal(saved.find((w) => w.id === 'w2').w, 6, 'span preserved exactly');
  assert.equal(saved.find((w) => w.id === 'w1').config.presentation, 'transparent');
});

// ─── Presentation must not affect layout ─────────────────────────────────────

test('a transparent widget participates in layout exactly like any other', () => {
  const transparent = createPlacement({ id: 'clear', type: 'clock', x: 0, y: 0, w: 1, h: 1, config: { presentation: 'transparent' } });
  const card = createPlacement({ id: 'card', type: 'notes', x: 0, y: 0, w: 1, h: 1, config: { presentation: 'card' } });

  // It collides, it gets pushed, and it compacts — presentation is not consulted.
  assert.equal(collisionsFor([card], transparent).length, 1, 'transparent widgets still collide');

  const items = normalizeLayout([transparent, card], BASE_COLUMNS);
  assert.ok(isValidLayout(items, BASE_COLUMNS));

  const moved = moveItem(items, 'card', 0, 0, BASE_COLUMNS);
  assert.ok(isValidLayout(moved, BASE_COLUMNS), 'a transparent widget is displaced like any other');

  const stripped = items.map((i) => ({ ...i, config: {} }));
  assert.equal(show(normalizeLayout(stripped, BASE_COLUMNS)), show(items), 'identical geometry regardless of presentation');
});

// ─── Anchoring: deliberate placement survives compaction ─────────────────────


test('a widget dropped into the bottom of a short column stays there', () => {
  // Reproduces the reported bug: the right-hand column is one row tall, so
  // unconditional compaction used to snap a drop at row 2 back up to row 0.
  let items = [
    at('today', 0, 0, 2, 2), at('clock', 2, 0), at('over', 3, 0), at('notes', 0, 2, 2, 1),
  ];
  items = moveItem(items, 'clock', 3, 2, BASE_COLUMNS);

  const clock = items.find((i) => i.id === 'clock');
  assert.equal(clock.x, 3);
  assert.equal(clock.y, 2, 'the row the user chose is kept');
  assert.equal(clock.pinned, true, 'an explicit move anchors the widget');
  assert.ok(isValidLayout(items, BASE_COLUMNS));
});

test('anchoring one widget still compacts the others around it', () => {
  let items = [at('a', 0, 0), at('b', 1, 4), at('c', 2, 6)];
  items = moveItem(items, 'a', 0, 3, BASE_COLUMNS);

  assert.equal(items.find((i) => i.id === 'a').y, 3, 'the anchored one holds its row');
  assert.equal(items.find((i) => i.id === 'b').y, 0, 'the rest still float up');
  assert.equal(items.find((i) => i.id === 'c').y, 0);
});

test('an anchored widget is still pushed down out of a collision', () => {
  let items = [at('a', 0, 0, 1, 1), at('b', 1, 0, 1, 1)];
  items = moveItem(items, 'a', 0, 3, BASE_COLUMNS);          // anchor a at row 3
  items = moveItem(items, 'b', 0, 3, BASE_COLUMNS);          // drop b on top of it

  assert.ok(isValidLayout(items, BASE_COLUMNS), 'anchoring never permits an overlap');
  assert.equal(new Set(items.map((i) => i.id)).size, 2);
});

test('tidy releases every anchor and packs the layout tight', () => {
  let items = [at('a', 0, 0, 2, 2), at('b', 2, 0), at('c', 3, 0)];
  items = moveItem(items, 'b', 3, 3, BASE_COLUMNS);
  assert.ok(layoutHeight(items) > 2, 'the anchor left a deliberate gap');

  const tidied = tidy(items);
  assert.ok(tidied.every((i) => i.pinned === false), 'anchors cleared');
  assert.equal(layoutHeight(tidied), 2, 'packed as tightly as possible');
  assert.ok(isValidLayout(tidied, BASE_COLUMNS));
});

test('anchors persist, so a deliberate layout survives a reload', async () => {
  const store = createStore();
  await store.init();
  store.update('dashboard', () => ({
    version: 3,
    widgets: [
      { id: 'a', type: 'clock', x: 6, y: 4, w: 2, h: 2, pinned: true, config: {} },
      { id: 'b', type: 'notes', x: 0, y: 0, w: 4, h: 2, config: {} },
    ],
  }));
  await store.flush();

  const saved = store.getState().dashboard.widgets;
  const anchored = saved.find((w) => w.id === 'a');
  assert.equal(anchored.pinned, true, 'the anchor was stored');
  assert.equal(anchored.y, 4, 'and its row was not compacted away on read');
  assert.equal(saved.find((w) => w.id === 'b').pinned, false);
});

test('the default layout is anchored, so its spacing survives compaction', () => {
  // The shipped layout is positioned deliberately — DSA top-right, clock centred
  // with search beneath it, scratchpad and shortcuts along the bottom. Without
  // anchors, compaction would collapse all of it into the first column on the
  // very first render.
  assert.ok(DEFAULT_DASHBOARD.widgets.every((w) => w.pinned), 'every widget is anchored');
  assert.ok(isValidLayout(DEFAULT_DASHBOARD.widgets, BASE_COLUMNS));

  const before = layoutHeight(DEFAULT_DASHBOARD.widgets);
  assert.equal(layoutHeight(compact(DEFAULT_DASHBOARD.widgets)), before, 'compaction leaves it alone');
  assert.ok(layoutHeight(tidy(DEFAULT_DASHBOARD.widgets)) < before, 'tidy still packs it on request');

  // It fits a 1024px window unchanged. The canonical grid is far wider, but a
  // default that needed every column would not fit a laptop — and a layout that
  // does not fit has its editing paused, so the app would open guarded.
  const widest = Math.max(...DEFAULT_DASHBOARD.widgets.map((w) => w.x + w.w));
  assert.ok(widest <= columnsForWidth(912), `the default spans ${widest}, a 1024px window fits ${columnsForWidth(912)}`);
  assert.ok(widest <= columnsForWidth(1328), 'and a 1440px laptop too');
  assert.ok(widest > 8, 'while still using the width it has');
});

test('the default layout reaches the corners of whatever width it is resolved at', () => {
  // Written as fixed coordinates it only looked right at one width, bunching
  // into the left third of a large monitor. Anchors state the intent instead.
  for (const columns of [16, 21, 28, 43, BASE_COLUMNS]) {
    const widgets = defaultWidgetsFor(columns);
    assert.ok(isValidLayout(widgets, columns), `valid at ${columns} columns`);
    assert.ok(widgets.every((w) => w.pinned), 'and still anchored');

    const byId = Object.fromEntries(widgets.map((w) => [w.id, w]));
    // The weather tile is the top-right corner, and shortcuts the bottom-right.
    assert.equal(byId.w_weather.x + byId.w_weather.w, columns, `weather hugs the right edge at ${columns}`);
    assert.equal(byId.w_weather.y, 0, 'at the top');
    assert.equal(byId.w_shortcuts.x + byId.w_shortcuts.w, columns, 'shortcuts hug the right edge');
    assert.equal(byId.w_notes.x, 0, 'the scratchpad stays on the left');

    // The clock and the search box are centred, and centred on each other.
    const clockMid = byId.w_clock.x + byId.w_clock.w / 2;
    const searchMid = byId.w_search.x + byId.w_search.w / 2;
    assert.equal(clockMid, searchMid, 'the clock sits over the search box');
    assert.ok(Math.abs(clockMid - columns / 2) <= 0.5, `centred at ${columns} columns`);
  }

  // Nothing is placed off the grid, however absurd the column count.
  for (const columns of [0, 1, 4, 999, NaN]) {
    const widgets = defaultWidgetsFor(columns);
    assert.ok(widgets.every((w) => w.x >= 0), `no negative x at ${columns}`);
    assert.ok(widgets.every((w) => w.x + w.w <= BASE_COLUMNS), `inside the canvas at ${columns}`);
  }

  // The DSA tile is deliberately absent; the section is paused.
  assert.ok(!defaultWidgetsFor(24).some((w) => w.type === 'dsaToday'));
});

// ─── Size presets offered per widget ─────────────────────────────────────────

test('only the presets a widget can actually render are offered', () => {
  // No limits and no named sizes: the whole vocabulary is on the table.
  assert.deepEqual(allowedPresets().map((p) => p.key), SIZE_PRESETS.map((p) => p.key));

  // A widget needing two columns loses every one-column size.
  assert.ok(allowedPresets({ minW: 2 }).every((p) => p.w >= 2));
  assert.ok(!allowedPresets({ minW: 2 }).some((p) => p.key === 'tiny'));

  // A widget limited to two rows loses everything taller.
  assert.ok(allowedPresets({ maxH: 2 }).every((p) => p.h <= 2));
  assert.ok(!allowedPresets({ maxH: 2 }).some((p) => p.key === 'large'));

  // A widget capped at four columns loses the wider shapes.
  assert.ok(allowedPresets({ maxW: 4 }).every((p) => p.w <= 4));
  assert.ok(!allowedPresets({ maxW: 4 }).some((p) => p.key === 'block'));
});

test('every offered preset fits inside the limits that produced it', () => {
  const cases = [
    {}, { minW: 2 }, { maxW: 2 }, { maxH: 1 }, { minH: 2 },
    { minW: 2, minH: 1, maxW: 4, maxH: 2 }, { minW: 1, minH: 1, maxW: 4, maxH: 3 },
  ];
  for (const limits of cases) {
    for (const preset of allowedPresets(limits)) {
      assert.ok(preset.w >= (limits.minW ?? 1), `${preset.key} respects minW`);
      assert.ok(preset.h >= (limits.minH ?? 1), `${preset.key} respects minH`);
      assert.ok(preset.w <= (limits.maxW ?? BASE_COLUMNS), `${preset.key} respects maxW`);
      assert.ok(preset.h <= (limits.maxH ?? 8), `${preset.key} respects maxH`);
    }
  }
});

test('a preset is recognised from a widget that already matches it', () => {
  assert.equal(presetKeyFor({ w: 1, h: 1 }), 'tiny');
  assert.equal(presetKeyFor({ w: 2, h: 2 }), 'small');
  assert.equal(presetKeyFor({ w: 4, h: 4 }), 'large');
  assert.equal(presetKeyFor({ w: 6, h: 2 }), 'bar');
  assert.equal(presetKeyFor({ w: 8, h: 4 }), 'block');
  assert.equal(presetKeyFor({ w: 7, h: 5 }), null, 'a hand-dragged size matches no preset');
});

test('resizing to a preset respects the widget limits regardless', () => {
  // Even if a caller asks for a size outside the limits, the engine clamps.
  const items = [at('a', 0, 0)];
  const resized = resizeItem(items, 'a', 1, 1, BASE_COLUMNS, { minW: 2, minH: 1 });
  assert.equal(resized.find((i) => i.id === 'a').w, 2, 'clamped up to the minimum width');
  assert.ok(isValidLayout(resized, BASE_COLUMNS));
});

test('the grid fills the page exactly, and its squares stay square', () => {
  // Wide enough that a fixed 48px cell still reaches the right edge of a large
  // desktop, so the placement grid covers the screen rather than stopping short.
  assert.equal(BASE_COLUMNS, 48);
  assert.equal(V3_COLUMNS, 24, 'the width old coordinates were written against');

  const GAP = 8;

  for (const width of [288, 358, 488, 656, 912, 1168, 1254, 1328, 1488, 1808, 2448]) {
    const columns = columnsForWidth(width);
    const cell = cellForWidth(width, columns);

    // The grid ends at the right edge. Flooring the column count used to leave
    // up to a whole cell of dead space there; the cell absorbs it instead.
    const used = columns * cell + (columns - 1) * GAP;
    assert.ok(Math.abs(used - width) < 0.001, `the grid fills ${width}px exactly, using ${used}`);

    // And the square is still a square of roughly the intended size — the cell
    // flexes to fill, it does not float free. Beyond about half a column of
    // slack, another column is added instead of growing the squares.
    assert.ok(cell > CELL_PX * 0.8 && cell < CELL_PX * 1.2, `${cell}px stays near ${CELL_PX} at ${width}px`);
  }

  // On anything laptop-sized or larger there are enough columns to share the
  // remainder between, so the square barely moves at all.
  for (const width of [912, 1168, 1254, 1328, 1488, 1808, 2448]) {
    const cell = cellForWidth(width, columnsForWidth(width));
    assert.ok(Math.abs(cell - CELL_PX) <= 2, `${cell}px is within 2px of ${CELL_PX} at ${width}px`);
  }

  // More room means more columns, not unbounded squares.
  assert.ok(columnsForWidth(1888) > columnsForWidth(912));
  assert.ok(columnsForWidth(912) > columnsForWidth(358));
  assert.equal(columnsForWidth(9999), BASE_COLUMNS, 'never more than the stored space');
  assert.ok(columnsForWidth(358) >= 4, 'never fewer than four');
  assert.equal(columnsForWidth(0), 4, 'a degenerate width still yields a usable grid');

  // A layout saved in the old four-column space is still valid in the new one.
  const legacy = [at('a', 0, 0, 2, 2), at('b', 2, 0), at('c', 3, 0)];
  assert.ok(isValidLayout(normalizeLayout(legacy, BASE_COLUMNS), BASE_COLUMNS));
});

// ─── Size options are per widget, from a shared vocabulary ───────────────────

test('a widget is offered only the sizes it names', () => {
  // A search box wants to be wide and short, never square or tall.
  const search = allowedPresets({ minW: 4, minH: 2, maxW: BASE_COLUMNS, maxH: 2 }, ['wide', 'bar', 'banner', 'row']);
  assert.deepEqual(search.map((p) => `${p.w}x${p.h}`), ['4x2', '6x2', '8x2', `${BASE_COLUMNS}x2`]);
  assert.ok(search.every((p) => p.h === 2), 'nothing taller is offered');

  // A task list wants height.
  const list = allowedPresets({ minW: 4, minH: 2, maxW: BASE_COLUMNS, maxH: 8 }, ['large', 'panel', 'block', 'column']);
  assert.deepEqual(list.map((p) => `${p.w}x${p.h}`), ['4x4', '6x4', '8x4', '4x6']);
  assert.ok(list.every((p) => p.h >= 4), 'every option has room for rows');
});

test('the order a widget names its sizes in is preserved', () => {
  const keys = ['banner', 'small', 'panel'];
  assert.deepEqual(allowedPresets({}, keys).map((p) => p.key), keys);
});

test('limits still win over a named size, so the two cannot contradict', () => {
  // 'block' is 8x4, but a widget capped at two rows cannot have it.
  assert.deepEqual(
    allowedPresets({ maxH: 2 }, ['wide', 'block', 'bar']).map((p) => p.key),
    ['wide', 'bar'],
  );
  assert.deepEqual(allowedPresets({ minW: 6 }, ['small', 'wide', 'panel']).map((p) => p.key), ['panel']);
});

test('naming no sizes falls back to the whole vocabulary', () => {
  assert.equal(allowedPresets({}, null).length, SIZE_PRESETS.length);
  assert.equal(allowedPresets({}, []).length, SIZE_PRESETS.length);
});

test('an unknown size key is ignored rather than crashing the picker', () => {
  assert.deepEqual(allowedPresets({}, ['wide', 'nonsense', 'bar']).map((p) => p.key), ['wide', 'bar']);
  assert.equal(presetByKey('nonsense'), null);
});

test('every size in the vocabulary fits the stored grid', () => {
  for (const preset of SIZE_PRESETS) {
    assert.ok(preset.w <= BASE_COLUMNS, `${preset.key} fits the grid width`);
    assert.ok(preset.w >= 1 && preset.h >= 1);
    assert.ok(preset.title && preset.label, `${preset.key} is labelled`);
  }
  // Keys are unique, or presetByKey would be ambiguous.
  assert.equal(new Set(SIZE_PRESETS.map((p) => p.key)).size, SIZE_PRESETS.length);
});

test('a widget can span the whole grid, not just four columns', () => {
  const row = presetByKey('row');
  assert.equal(row.w, BASE_COLUMNS, 'the full-row preset spans every column');
  assert.equal(row.h, 2);

  // And arbitrary widths in between are reachable, which presets alone cannot cover.
  for (const width of [5, 7, 13, 19, 24]) {
    const resized = resizeItem([at('a', 0, 0)], 'a', width, 1, BASE_COLUMNS, { minW: 1, maxW: BASE_COLUMNS });
    assert.equal(resized.find((i) => i.id === 'a').w, width, `${width} columns wide`);
    assert.ok(isValidLayout(resized, BASE_COLUMNS));
  }
});

test('a resize is bounded by the grid it is performed in', () => {
  // Resizing in a ten-column view cannot produce something only twelve fit.
  const resized = resizeItem([at('a', 0, 0)], 'a', 24, 1, 10, { minW: 1, maxW: BASE_COLUMNS });
  assert.equal(resized.find((i) => i.id === 'a').w, 10, 'clamped to the visible grid');
  assert.ok(isValidLayout(resized, 10));
});
