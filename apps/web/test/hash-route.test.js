import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_SECTIONS, SECTIONS } from '../src/app/useHashRoute.js';

test('home is a website landing section and not part of the app shell list', () => {
  assert.ok(SECTIONS.includes('home'));
  assert.ok(SECTIONS.includes('about'));
  assert.ok(SECTIONS.includes('changelog'));
  assert.ok(SECTIONS.includes('dashboard'));
  assert.equal(APP_SECTIONS.includes('home'), false);
  assert.ok(APP_SECTIONS.includes('dashboard'));
});
