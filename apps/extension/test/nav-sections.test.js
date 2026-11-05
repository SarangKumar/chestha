import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HIDEABLE_SECTIONS } from '@chestha/core';

/**
 * Two drift guards over the navigation, both of which have already been earned.
 *
 * `HIDEABLE_SECTIONS` lives in core, but the labels and icons for those
 * sections live in the extension's Settings page — so adding a section to the
 * policy list and forgetting the copy produces a checkbox reading "writing"
 * with a blank icon, which is exactly what happened when the Writing section
 * was added. Nothing failed, because nothing was watching.
 *
 * These read the components as *text* rather than importing them: both are JSX
 * bound to the workspace store, and there is no JSX loader here. Each parse
 * asserts it found something before comparing, so a renamed constant fails
 * loudly instead of passing against an empty set. Same approach, and same
 * reasoning, as `widget-catalogue.test.js`.
 */

function objectKeys(source, constName, file) {
  const start = source.indexOf(`const ${constName} = {`);
  assert.notEqual(start, -1, `${constName} was not found in ${file} — renamed?`);
  const body = source.slice(start, source.indexOf('};', start));
  const keys = [...body.matchAll(/^ {2}([a-zA-Z][\w]*):/gm)].map((m) => m[1]);
  assert.ok(keys.length > 0, `no entries parsed out of ${constName} in ${file}`);
  return keys;
}

const settingsSource = readFileSync(
  new URL('../src/sections/Settings.jsx', import.meta.url),
  'utf8',
);

test('every hideable section has a label and an icon in Settings', () => {
  const labels = objectKeys(settingsSource, 'SECTION_LABELS', 'Settings.jsx');
  const icons = objectKeys(settingsSource, 'SECTION_ICONS', 'Settings.jsx');

  for (const id of HIDEABLE_SECTIONS) {
    assert.ok(labels.includes(id), `"${id}" is hideable but has no label — the row would read "${id}"`);
    assert.ok(icons.includes(id), `"${id}" is hideable but has no icon — the row would render a blank`);
  }
});

test('Settings carries no copy for a section that is not hideable', () => {
  // The other direction, so a removed section does not leave its label behind
  // to be re-rendered by a later refactor.
  for (const id of objectKeys(settingsSource, 'SECTION_LABELS', 'Settings.jsx')) {
    assert.ok(HIDEABLE_SECTIONS.includes(id), `"${id}" has a label but is not hideable`);
  }
});

// ─── The start screen is not a rail item ─────────────────────────────────────

const railSource = readFileSync(
  new URL('../src/components/NavRail.jsx', import.meta.url),
  'utf8',
);

function railIds() {
  const start = railSource.indexOf('const PRIMARY = [');
  assert.notEqual(start, -1, 'PRIMARY was not found in NavRail.jsx — renamed?');
  const body = railSource.slice(start, railSource.indexOf('];', start));
  const ids = [...body.matchAll(/\bid: '([^']+)'/g)].map((m) => m[1]);
  assert.ok(ids.length > 0, 'no items parsed out of PRIMARY in NavRail.jsx');
  return ids;
}

test('the start screen is not a destination icon in the rail', () => {
  // It is still *in* the rail, as the first item — but as the Board/Read mode
  // control, which is a different thing from an icon that navigates. A plain
  // icon for it was a button to go where you started, and this guards against
  // one quietly coming back alongside the control.
  assert.ok(!railIds().includes('dashboard'), 'the start screen is not a rail destination');
});

test('the rail mounts the start-mode control as its first item', () => {
  // The pairing this test exists for: the control is what replaced the icon, so
  // losing it would leave no route back to the start screen from the rail at
  // all. Read as text for the same reason as the rest of this file.
  assert.match(
    railSource,
    /orientation="vertical"/,
    'NavRail no longer renders the vertical StartModeToggle',
  );
  const controlAt = railSource.indexOf('<StartModeToggle');
  const sectionsAt = railSource.indexOf('{primary.map(');
  assert.notEqual(controlAt, -1, 'StartModeToggle is not rendered in the rail');
  assert.ok(controlAt < sectionsAt, 'the start-mode control must come before the section icons');
});

test('every rail item is a section the policy table knows about', () => {
  // Settings is appended separately and is deliberately not hideable, so the
  // rail's own list should be exactly the hideable sections.
  assert.deepEqual([...railIds()].sort(), [...HIDEABLE_SECTIONS].sort());
});
