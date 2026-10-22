import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHORTCUT_ACTIONS, SOUNDS, WIDGET_PRESENTATIONS, activeSoundIds, applyPreset,
  clampVolume, clearShortcut, coerceArea, coerceShortcuts, comboFromEvent, conflictFor,
  createPreset, createStore, deletePreset, findConflicts, formatCombo, isCustomised,
  mixGain, normalizeCombo, normalizeMix, renamePreset, resetAllShortcuts, resetShortcut,
  resolveShortcuts, setShortcut, validateCombo,
} from '../src/index.js';

// ─── Sound: mixing, clipping, presets ────────────────────────────────────────

test('a mix keeps only known sounds and clamps their volumes', () => {
  const mix = normalizeMix({ rain: 0.5, waves: 2, wind: -1, nonsense: 0.5, brown: 'x' });
  assert.deepEqual(Object.keys(mix).sort(), ['brown', 'rain', 'waves', 'wind']);
  assert.equal(mix.waves, 1, 'clamped down');
  assert.equal(mix.wind, 0, 'clamped up');
  assert.equal(mix.brown, 0.5, 'unparseable falls back');
  assert.equal(clampVolume('0.25'), 0.25);
});

test('adding sounds scales each voice so the mix cannot clip', () => {
  const one = mixGain({ rain: 1 }, 'rain', 1);
  const four = mixGain({ rain: 1, waves: 1, wind: 1, brown: 1 }, 'rain', 1);
  assert.equal(one, 1);
  assert.ok(four < one, 'each voice is attenuated as the mix grows');
  assert.ok(Math.abs(four - 0.5) < 1e-9, 'four equal voices sit at 1/sqrt(4)');

  // The summed amplitude stays bounded rather than multiplying.
  const total = ['rain', 'waves', 'wind', 'brown']
    .reduce((sum, id) => sum + mixGain({ rain: 1, waves: 1, wind: 1, brown: 1 }, id, 1), 0);
  assert.ok(total <= 2.0, `summed gain ${total} stays bounded`);
});

test('master volume scales the mix without changing its balance', () => {
  const mix = { rain: 1, waves: 0.5 };
  const full = { rain: mixGain(mix, 'rain', 1), waves: mixGain(mix, 'waves', 1) };
  const half = { rain: mixGain(mix, 'rain', 0.5), waves: mixGain(mix, 'waves', 0.5) };
  assert.ok(Math.abs(half.rain / half.waves - full.rain / full.waves) < 1e-9, 'ratio preserved');
  assert.ok(Math.abs(half.rain - full.rain / 2) < 1e-9);
});

test('turning one sound off leaves the others playing', () => {
  const mix = { rain: 0.8, waves: 0.4, wind: 0.6 };
  const next = { ...mix };
  delete next.waves;
  assert.deepEqual(activeSoundIds(next).sort(), ['rain', 'wind']);
  assert.ok(mixGain(next, 'rain', 1) > 0 && mixGain(next, 'wind', 1) > 0);
  assert.equal(mixGain(next, 'waves', 1), 0);
});

test('a preset needs a name and a non-empty mix', () => {
  assert.equal(createPreset('', { rain: 0.5 }).ok, false);
  assert.equal(createPreset('Focus', {}).ok, false, 'refuses to save silence');
  assert.match(createPreset('Focus', {}).error, /nothing is playing/i);
  const made = createPreset('  Deep focus  ', { rain: 0.6, brown: 0.4 });
  assert.equal(made.ok, true);
  assert.equal(made.preset.name, 'Deep focus');
  assert.deepEqual(made.preset.mix, { rain: 0.6, brown: 0.4 });
});

test('presets can be renamed and deleted without touching the others', () => {
  const a = createPreset('A', { rain: 0.5 }).preset;
  const b = createPreset('B', { wind: 0.5 }).preset;
  const renamed = renamePreset([a, b], a.id, 'Rain only');
  assert.equal(renamed.ok, true);
  assert.equal(renamed.presets[0].name, 'Rain only');
  assert.equal(renamed.presets[1].name, 'B', 'other preset untouched');
  assert.equal(renamePreset([a, b], a.id, '  ').ok, false);
  assert.equal(renamePreset([a, b], 'gone', 'x').ok, false);
  assert.deepEqual(deletePreset([a, b], a.id).map((p) => p.name), ['B']);
});

test('loading a preset reports sounds this build no longer ships', () => {
  const { mix, missing } = applyPreset({ name: 'Old', mix: { rain: 0.5, cafe: 0.7 } });
  assert.deepEqual(Object.keys(mix), ['rain']);
  assert.deepEqual(missing, ['cafe'], 'the omission is reported, not hidden');
});

test('every sound has a synthesis recipe, so nothing needs downloading', () => {
  assert.ok(SOUNDS.length >= 4);
  for (const sound of SOUNDS) {
    assert.ok(sound.recipe?.noise, `${sound.id} has a noise source`);
    assert.ok(sound.name && sound.description);
  }
});

test('sound settings survive a store round trip', async () => {
  const store = createStore();
  await store.init();
  const preset = createPreset('Night', { waves: 0.7, brown: 0.3 }).preset;
  store.update('sound', (s) => ({ ...s, presets: [preset], lastMix: { waves: 0.7 }, masterVolume: 0.4 }));
  await store.flush();
  const saved = store.getState().sound;
  assert.equal(saved.presets.length, 1);
  assert.deepEqual(saved.lastMix, { waves: 0.7 });
  assert.equal(saved.masterVolume, 0.4);
});

// ─── Keyboard shortcuts ──────────────────────────────────────────────────────

test('combos normalize to one canonical form', () => {
  assert.equal(normalizeCombo('mod+k'), 'Mod+K');
  assert.equal(normalizeCombo('Cmd+K'), 'Mod+K');
  assert.equal(normalizeCombo('shift+alt+t'), 'Alt+Shift+T');
  assert.equal(normalizeCombo('n'), 'N');
  assert.equal(normalizeCombo('Mod'), null, 'a bare modifier is not a combo');
  assert.equal(normalizeCombo(''), null);
});

test('defaults resolve, and an override replaces one', () => {
  const defaults = resolveShortcuts({});
  assert.equal(defaults.palette, 'Mod+K');
  assert.equal(defaults.capture, 'N');
  assert.equal(defaults['go-tasks'], null, 'navigation has no default combo');

  const custom = resolveShortcuts({ capture: 'Mod+Shift+N' });
  assert.equal(custom.capture, 'Mod+Shift+N');
  assert.equal(custom.palette, 'Mod+K', 'others keep their defaults');
});

test('conflicts are detected and explained', () => {
  const result = setShortcut({}, 'capture', 'Mod+K');
  assert.equal(result.ok, false);
  assert.match(result.error, /already used by “Command palette”/);
  assert.equal(result.conflictWith, 'palette');

  const conflicted = resolveShortcuts({ capture: 'Mod+K' });
  // coerceShortcuts prevents this reaching storage, but resolve must still report it.
  const found = findConflicts({ ...conflicted, capture: 'Mod+K' });
  assert.equal(found.length, 1);
  assert.deepEqual(found[0].actionIds.sort(), ['capture', 'palette']);
  assert.equal(conflictFor(resolveShortcuts({}), 'capture', 'Mod+K'), 'palette');
});

test('browser-owned combinations are refused', () => {
  for (const reserved of ['Mod+W', 'Mod+T', 'Mod+R', 'F5', 'Mod+Q']) {
    const check = validateCombo(reserved);
    assert.equal(check.ok, false, `${reserved} should be refused`);
    assert.match(check.error, /reserved/i);
  }
  for (const fixed of ['Escape', 'Tab', 'Enter']) {
    assert.equal(validateCombo(fixed).ok, false, `${fixed} should be refused`);
  }
  assert.equal(validateCombo('Mod+Shift+K').ok, true);
});

test('a shortcut can be set, cleared, and reset to its default', () => {
  let overrides = {};
  overrides = setShortcut(overrides, 'capture', 'Mod+Shift+A').overrides;
  assert.equal(resolveShortcuts(overrides).capture, 'Mod+Shift+A');
  assert.equal(isCustomised(overrides, 'capture'), true);

  overrides = clearShortcut(overrides, 'capture');
  assert.equal(resolveShortcuts(overrides).capture, null, 'cleared means unassigned');

  overrides = resetShortcut(overrides, 'capture');
  assert.equal(resolveShortcuts(overrides).capture, 'N', 'back to the default');
  assert.equal(isCustomised(overrides, 'capture'), false);

  assert.deepEqual(resetAllShortcuts(), {});
});

test('events map to combos with the right platform modifier', () => {
  const ev = (patch) => ({ key: 'k', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...patch });
  assert.equal(comboFromEvent(ev({ metaKey: true }), true), 'Mod+K', 'Command on Apple');
  assert.equal(comboFromEvent(ev({ ctrlKey: true }), false), 'Mod+K', 'Control elsewhere');
  assert.equal(comboFromEvent(ev({ ctrlKey: true }), true), 'Ctrl+K', 'Control stays Ctrl on Apple');
  assert.equal(comboFromEvent(ev({ key: 'Shift', shiftKey: true }), true), null, 'modifier alone is not a combo');
  assert.equal(comboFromEvent(ev({ key: 'ArrowUp' }), false), 'ArrowUp');
});

test('stored shortcuts are validated, and invalid entries discarded', () => {
  const stored = coerceShortcuts({
    palette: 'Mod+Shift+P',
    capture: 'Mod+W',          // reserved
    sidebar: 'nonsense+++',    // unparseable
    'not-an-action': 'Mod+J',  // unknown id
    'go-tasks': null,          // deliberately unassigned
  });
  assert.deepEqual(stored, { palette: 'Mod+Shift+P', 'go-tasks': null });
  assert.deepEqual(coerceShortcuts(null), {});
  assert.deepEqual(coerceShortcuts('nope'), {});
});

test('a stored file with two actions on one combo is de-duplicated', () => {
  const stored = coerceShortcuts({ palette: 'Mod+J', capture: 'Mod+J' });
  assert.equal(Object.values(stored).filter((v) => v === 'Mod+J').length, 1);
  assert.equal(findConflicts(resolveShortcuts(stored)).length, 0);
});

test('shortcut overrides persist, and old settings without them still load', async () => {
  const store = createStore();
  await store.init();
  store.update('settings', (s) => ({ ...s, shortcuts: { capture: 'Mod+Shift+A' } }));
  await store.flush();
  assert.deepEqual(store.getState().settings.shortcuts, { capture: 'Mod+Shift+A' });

  // A settings record written before shortcuts existed must still be readable.
  const { value } = coerceArea('settings', { theme: 'dark', upcomingHorizonDays: 7 });
  assert.deepEqual(value.shortcuts, {}, 'missing field defaults, it does not fail');
  assert.equal(value.theme, 'dark', 'existing preferences are preserved');
});

test('every customizable action is reachable and labelled', () => {
  for (const action of SHORTCUT_ACTIONS) {
    assert.ok(action.name && action.description, `${action.id} is labelled`);
    assert.equal(typeof action.customizable, 'boolean');
  }
  assert.equal(formatCombo('Mod+K', true), '⌘K');
  assert.equal(formatCombo('Mod+K', false), 'Ctrl+K');
  assert.equal(formatCombo(null, true), 'Not set');
});

// ─── Dashboard presentation ──────────────────────────────────────────────────

test('widget presentation is validated at the storage boundary', () => {
  const { value } = coerceArea('dashboard', {
    widgets: [
      { id: 'a', type: 'clock', size: '1x1', config: { presentation: 'transparent' } },
      { id: 'b', type: 'notes', size: '1x1', config: { presentation: 'nonsense' } },
      { id: 'c', type: 'today', size: '2x2', config: { presentation: 'inset', horizonDays: 7 } },
    ],
  });
  assert.equal(value.widgets[0].config.presentation, 'transparent');
  assert.equal('presentation' in value.widgets[1].config, false, 'an invalid value is dropped, not kept');
  assert.equal(value.widgets[2].config.presentation, 'inset');
  assert.equal(value.widgets[2].config.horizonDays, 7, 'unrelated config survives');
  assert.deepEqual(WIDGET_PRESENTATIONS, ['card', 'transparent', 'inset']);
});

test('an existing layout without presentation still loads', () => {
  const { value } = coerceArea('dashboard', {
    widgets: [{ id: 'w_clock', type: 'clock', size: '1x1', config: {} }],
  });
  assert.equal(value.widgets.length, 1);
  assert.deepEqual(value.widgets[0].config, {}, 'no presentation is a valid state — the registry default applies');
});
