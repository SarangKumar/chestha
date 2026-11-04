import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WIDGET_CATALOGUE } from '@chestha/core';

/**
 * The website's Guide page lists every dashboard widget, but it cannot import
 * the registry: `registry.jsx` is JSX bound to the workspace store, and the
 * Guide is a server-rendered Next page. So `WIDGET_CATALOGUE` holds the prose
 * and this test holds the line that used to be held by the import.
 *
 * It reads the registry as *text* rather than importing it, for the same
 * reason — there is no JSX loader here. That is a little crude, and it is
 * deliberate: a parse that stops matching is a failure, not a silent pass, so
 * the extraction below asserts it found something before it compares.
 */
function widgetsFromRegistry() {
  const src = readFileSync(
    new URL('../src/widgets/registry.jsx', import.meta.url),
    'utf8',
  );
  const body = src.slice(src.indexOf('export const WIDGETS = {'));
  assert.ok(body, 'WIDGETS was not found in registry.jsx — has it been renamed?');

  const starts = [];
  const typeRe = /^  ([a-zA-Z][\w]*): \{$/gm;
  let match;
  while ((match = typeRe.exec(body))) starts.push({ type: match[1], at: match.index });
  assert.ok(starts.length > 0, 'no widget entries parsed out of registry.jsx');

  return starts.map((start, i) => {
    const chunk = body.slice(start.at, starts[i + 1]?.at ?? body.length);
    const name = chunk.match(/^ {4}name: (.+),$/m)?.[1];
    const description = chunk.match(/^ {4}description:\s*\n?\s*(.+?),$/ms)?.[1];
    assert.ok(name, `widget "${start.type}" has no name in the registry`);
    assert.ok(description, `widget "${start.type}" has no description in the registry`);
    // The registry writes these as JS literals; `eval` of a single string
    // literal is the cheapest correct way to unquote one that may contain
    // either quote style or a typographic apostrophe.
    return {
      type: start.type,
      name: JSON.parse(JSON.stringify(eval(name.trim()))),
      description: JSON.parse(JSON.stringify(eval(description.trim()))),
    };
  });
}

test('the shared widget catalogue matches the registry exactly', () => {
  assert.deepEqual(WIDGET_CATALOGUE, widgetsFromRegistry());
});

test('every catalogued widget has prose worth showing', () => {
  for (const widget of WIDGET_CATALOGUE) {
    assert.ok(widget.name.length > 0, `${widget.type} has an empty name`);
    // Short enough to read in a grid cell, long enough to say something.
    assert.ok(widget.description.length > 15, `${widget.type} has a stub description`);
  }
});
