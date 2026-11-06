import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_SECTIONS, SECTIONS } from '../src/app/useHashRoute.js';

test('every routable section is an app-shell section', () => {
  // `home` was the marketing landing, routed inside this bundle and rendered
  // without the Shell. The site is `apps/website` now, so the landing is gone
  // from here and there is no longer a section that bypasses the workspace
  // chrome. This guards against one being reintroduced by accident.
  assert.equal(SECTIONS.includes('home'), false);
  assert.deepEqual(APP_SECTIONS, SECTIONS);
});

test('the workspace and the palette-only pages are all routable', () => {
  assert.ok(SECTIONS.includes('dashboard'));
  assert.ok(SECTIONS.includes('about'));
  assert.ok(SECTIONS.includes('changelog'));
  assert.ok(SECTIONS.includes('guide'));
});
