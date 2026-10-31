import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Properties of the source itself, rather than of what it computes.
 *
 * Two of the Grove's promises cannot be expressed as a unit test of a function —
 * "it never contacts the network" and "it never asks to read a page" are claims about
 * what the code does *not* contain. They are checked here, where a future change that
 * quietly breaks one fails the suite instead of shipping.
 */
const root = fileURLToPath(new URL('../../../', import.meta.url));

function sourcesUnder(dir) {
  const out = [];
  const walk = (path) => {
    for (const entry of readdirSync(path)) {
      const full = `${path}/${entry}`;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.jsx?$/.test(entry)) out.push(full);
    }
  };
  walk(`${root}${dir}`);
  return out;
}

const GROVE_SOURCES = [
  ...sourcesUnder('packages/core/src/grove'),
  ...sourcesUnder('apps/extension/src/grove'),
  ...sourcesUnder('scripts/extension'),
];

test('the Grove and the tracker never contact the network', () => {
  assert.ok(GROVE_SOURCES.length >= 12, 'the file sweep found the sources');
  for (const file of GROVE_SOURCES) {
    const source = readFileSync(file, 'utf8');
    for (const pattern of [/\bfetch\s*\(/, /XMLHttpRequest/, /navigator\.sendBeacon/, /new\s+WebSocket/, /EventSource/]) {
      assert.ok(!pattern.test(source), `${file.replace(root, '')} must make no request: ${pattern}`);
    }
  }
});

test('the extension asks for no access to any website', () => {
  const manifest = JSON.parse(readFileSync(`${root}scripts/extension/manifest.json`, 'utf8'));

  assert.deepEqual(manifest.permissions.sort(), ['alarms', 'idle', 'storage', 'tabs']);
  assert.equal(manifest.host_permissions, undefined, 'no host permissions, ever');
  assert.equal(manifest.content_scripts, undefined, 'no content scripts, ever');
  assert.equal(manifest.optional_host_permissions, undefined);
  // scripting would allow injecting into a page, which is the same access by another name.
  assert.ok(!manifest.permissions.includes('scripting'));
  assert.ok(!manifest.permissions.includes('webNavigation'));
  assert.ok(!manifest.permissions.includes('history'));
});

test('the tracker reads a tab’s host and nothing else about it', () => {
  const tracker = readFileSync(`${root}scripts/extension/tracker.js`, 'utf8');

  // It may read tab.url, because a host has to come from somewhere; everything else a
  // Tab offers about the page is off limits.
  for (const forbidden of ['tab.title', 'favIconUrl', 'executeScript', 'chrome.history', 'chrome.cookies']) {
    assert.ok(!tracker.includes(forbidden), `the tracker must not touch ${forbidden}`);
  }
  // Whatever it reads, what it stores is a host — never a full address.
  assert.ok(/host:\s*active\.host/.test(tracker) || /host,/.test(tracker), 'segments carry a host');
  assert.ok(!/url:\s/.test(tracker.split('appendSegments')[1] ?? ''), 'no URL is ever written into a segment');
});
