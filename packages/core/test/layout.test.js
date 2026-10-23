import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_COLUMNS, addItem, coerceArea, collisionsFor, compact, createPlacement, createStore,
  DEFAULT_DASHBOARD, allowedPresets, findFreeSpot, isValidLayout, layoutHeight,
  migrateOrderedLayout, moveItem, needsMigration, normalizeLayout, overlaps, presetKeyFor,
  projectToColumns, removeItem, resizeItem, tidy, columnsForWidth, cellForWidth,
  MIN_ROW_PX, MAX_ROW_PX, SIZE_PRESETS, presetByKey,
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

test('the stored dashboard area migrates on read and reports it', () => {
  const { value, issues } = coerceArea('dashboard', {
    widgets: [
      { id: 'a', type: 'today', size: '2x2', config: {} },
      { id: 'b', type: 'clock', size: '1x1', config: { presentation: 'transparent' } },
    ],
  });
  assert.equal(value.version, 2);
  assert.ok(isValidLayout(value.widgets, BASE_COLUMNS));
  assert.equal(value.widgets.length, 2, 'no widget silently lost');
  assert.match(issues[0], /upgraded to the new grid/);
  assert.equal(value.widgets.find((w) => w.type === 'clock').config.presentation, 'transparent');
});

test('a v2 layout round-trips through storage unchanged', async () => {
  const store = createStore();
  await store.init();
  const arrangement = [
    { id: 'w1', type: 'clock', x: 3, y: 0, w: 1, h: 1, config: { presentation: 'transparent' } },
    { id: 'w2', type: 'notes', x: 0, y: 0, w: 3, h: 2, config: {} },
  ];
  store.update('dashboard', () => ({ version: 2, widgets: arrangement }));
  await store.flush();

  const saved = store.getState().dashboard.widgets;
  assert.ok(isValidLayout(saved, BASE_COLUMNS));
  assert.equal(saved.find((w) => w.id === 'w1').x, 3, 'position preserved exactly');
  assert.equal(saved.find((w) => w.id === 'w2').w, 3, 'span preserved exactly');
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
    version: 2,
    widgets: [
      { id: 'a', type: 'clock', x: 3, y: 2, w: 1, h: 1, pinned: true, config: {} },
      { id: 'b', type: 'notes', x: 0, y: 0, w: 2, h: 1, config: {} },
    ],
  }));
  await store.flush();

  const saved = store.getState().dashboard.widgets;
  const anchored = saved.find((w) => w.id === 'a');
  assert.equal(anchored.pinned, true, 'the anchor was stored');
  assert.equal(anchored.y, 2, 'and its row was not compacted away on read');
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

  // It occupies the full width, so the rightmost widget reaches the last column.
  assert.equal(Math.max(...DEFAULT_DASHBOARD.widgets.map((w) => w.x + w.w)), BASE_COLUMNS);
});

// ─── Size presets offered per widget ─────────────────────────────────────────

test('only the presets a widget can actually render are offered', () => {
  // No limits and no named sizes: the whole vocabulary is on the table.
  assert.deepEqual(allowedPresets().map((p) => p.key), SIZE_PRESETS.map((p) => p.key));

  // A widget needing two columns loses every one-column size.
  assert.ok(allowedPresets({ minW: 2 }).every((p) => p.w >= 2));
  assert.ok(!allowedPresets({ minW: 2 }).some((p) => p.key === 'small'));

  // A single-row widget loses everything taller.
  assert.deepEqual(
    allowedPresets({ maxH: 1 }).map((p) => p.key),
    ['small', 'wide', 'bar', 'banner'],
  );

  // A widget capped at two columns loses the wider shapes.
  assert.ok(allowedPresets({ maxW: 2 }).every((p) => p.w <= 2));
  assert.ok(!allowedPresets({ maxW: 2 }).some((p) => p.key === 'block'));
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
  assert.equal(presetKeyFor({ w: 1, h: 1 }), 'small');
  assert.equal(presetKeyFor({ w: 2, h: 2 }), 'large');
  assert.equal(presetKeyFor({ w: 3, h: 1 }), 'bar');
  assert.equal(presetKeyFor({ w: 4, h: 1 }), 'banner');
  assert.equal(presetKeyFor({ w: 4, h: 2 }), 'block');
  assert.equal(presetKeyFor({ w: 5, h: 4 }), null, 'a hand-dragged size matches no preset');
});

test('resizing to a preset respects the widget limits regardless', () => {
  // Even if a caller asks for a size outside the limits, the engine clamps.
  const items = [at('a', 0, 0)];
  const resized = resizeItem(items, 'a', 1, 1, BASE_COLUMNS, { minW: 2, minH: 1 });
  assert.equal(resized.find((i) => i.id === 'a').w, 2, 'clamped up to the minimum width');
  assert.ok(isValidLayout(resized, BASE_COLUMNS));
});

test('the grid spans the page, so the last column is the right edge', () => {
  assert.equal(BASE_COLUMNS, 12);

  // Anything with room for usable columns gets the whole grid, which is what
  // makes the rightmost column reachable.
  assert.equal(columnsForWidth(1888), BASE_COLUMNS, 'a ~2000px window');
  assert.equal(columnsForWidth(1328), BASE_COLUMNS, 'a 1440px laptop');
  assert.equal(columnsForWidth(912), BASE_COLUMNS, 'a 1024px window');
  assert.equal(columnsForWidth(9999), BASE_COLUMNS, 'never more than the stored space');

  // Narrow screens drop columns rather than shrink them into uselessness.
  assert.ok(columnsForWidth(656) < BASE_COLUMNS, 'a tablet sheds columns');
  assert.ok(columnsForWidth(358) < columnsForWidth(656), 'a phone sheds more');
  assert.ok(columnsForWidth(358) >= 4, 'but never fewer than four');
  assert.equal(columnsForWidth(0), 4, 'a degenerate width still yields a usable grid');

  // The cell stays within bounds at every width, so it neither vanishes nor balloons.
  for (const width of [358, 656, 912, 1328, 1888, 2448]) {
    const cell = cellForWidth(width, columnsForWidth(width));
    assert.ok(cell >= MIN_ROW_PX && cell <= MAX_ROW_PX, `cell is bounded at ${width}px`);
  }

  // A layout saved in the old four-column space is still valid in the new one.
  const legacy = [at('a', 0, 0, 2, 2), at('b', 2, 0), at('c', 3, 0)];
  assert.ok(isValidLayout(normalizeLayout(legacy, BASE_COLUMNS), BASE_COLUMNS));
});

// ─── Size options are per widget, from a shared vocabulary ───────────────────

test('a widget is offered only the sizes it names', () => {
  // A search box wants to be wide and short, never square or tall.
  const search = allowedPresets({ minW: 2, minH: 1, maxW: 4, maxH: 1 }, ['wide', 'bar', 'banner']);
  assert.deepEqual(search.map((p) => `${p.w}x${p.h}`), ['2x1', '3x1', '4x1']);
  assert.ok(!search.some((p) => p.h > 1), 'nothing tall is offered');

  // A task list wants height.
  const list = allowedPresets({ minW: 2, minH: 1, maxW: 4, maxH: 4 }, ['large', 'panel', 'block', 'column']);
  assert.deepEqual(list.map((p) => `${p.w}x${p.h}`), ['2x2', '3x2', '4x2', '2x3']);
  assert.ok(list.every((p) => p.h >= 2), 'every option has room for rows');
});

test('the order a widget names its sizes in is preserved', () => {
  const keys = ['banner', 'small', 'panel'];
  assert.deepEqual(allowedPresets({}, keys).map((p) => p.key), keys);
});

test('limits still win over a named size, so the two cannot contradict', () => {
  // 'block' is 4x2, but a widget capped at one row cannot have it.
  assert.deepEqual(
    allowedPresets({ maxH: 1 }, ['wide', 'block', 'bar']).map((p) => p.key),
    ['wide', 'bar'],
  );
  assert.deepEqual(allowedPresets({ minW: 3 }, ['small', 'wide', 'panel']).map((p) => p.key), ['panel']);
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
