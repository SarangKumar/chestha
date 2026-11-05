import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SOUND, coerceArea, createPreset, matchingPreset, sameMix,
} from '../src/index.js';

/**
 * `matchingPreset` is what lets a surface say "Rain + fire" instead of
 * "Unsaved mix". Everything it must get right is about *not lying*: a mix that
 * has been edited since it was saved has to read as unsaved, and a mix that is
 * byte-for-byte a saved one has to read as saved even after a round trip
 * through a slider and JSON.
 */

const RAIN = 'light-rain';
const FIRE = 'campfire-crackle';
const CRICKETS = 'summer-crickets';

test('a mix equal to a saved preset is reported as that preset', () => {
  const saved = createPreset('Rain + fire', { [RAIN]: 0.4, [FIRE]: 0.8 });
  assert.equal(saved.ok, true);

  const found = matchingPreset([saved.preset], { [FIRE]: 0.8, [RAIN]: 0.4 });
  assert.equal(found?.name, 'Rain + fire');
});

test('key order does not decide whether a mix is saved', () => {
  assert.equal(sameMix({ [RAIN]: 0.5, [FIRE]: 0.2 }, { [FIRE]: 0.2, [RAIN]: 0.5 }), true);
});

test('a volume nudged on a slider still matches, but a real change does not', () => {
  const saved = createPreset('Soft rain', { [RAIN]: 0.5 }).preset;

  // The kind of difference a range input and a JSON round trip produce.
  assert.equal(matchingPreset([saved], { [RAIN]: 0.5000000001 })?.id, saved.id);
  // The kind a person produces by moving the slider.
  assert.equal(matchingPreset([saved], { [RAIN]: 0.52 }), null);
});

test('adding or removing a sound makes the mix unsaved', () => {
  const saved = createPreset('Rain + fire', { [RAIN]: 0.4, [FIRE]: 0.8 }).preset;

  assert.equal(matchingPreset([saved], { [RAIN]: 0.4, [FIRE]: 0.8, [CRICKETS]: 0.3 }), null);
  assert.equal(matchingPreset([saved], { [RAIN]: 0.4 }), null);
});

test('silence matches nothing, even when presets exist', () => {
  const saved = createPreset('Rain', { [RAIN]: 0.4 }).preset;

  assert.equal(matchingPreset([saved], {}), null);
  assert.equal(matchingPreset([saved], null), null);
});

test('an unknown sound id is dropped before comparing, as everywhere else', () => {
  const saved = createPreset('Rain', { [RAIN]: 0.4 }).preset;

  // A preset from a build that shipped a sound this one does not still matches
  // on the sounds that remain — the mix the engine can actually play.
  assert.equal(matchingPreset([saved], { [RAIN]: 0.4, 'no-such-sound': 0.9 })?.id, saved.id);
});

test('matchingPreset tolerates junk where a preset list should be', () => {
  assert.equal(matchingPreset(null, { [RAIN]: 0.4 }), null);
  assert.equal(matchingPreset([null, 'nonsense', {}], { [RAIN]: 0.4 }), null);
});

/**
 * The island's repeat toggle writes `sound.loop`. It governs the user's own
 * tracks only, and it has to survive a state written before the flag existed.
 */
test('the sound area keeps repeat on when the stored state predates the flag', () => {
  assert.equal(DEFAULT_SOUND.loop, true);

  const { value } = coerceArea('sound', { presets: [], masterVolume: 0.5 });
  assert.equal(value.loop, true);
});

test('repeat turned off is read back as off, and junk falls back to on', () => {
  assert.equal(coerceArea('sound', { loop: false }).value.loop, false);
  assert.equal(coerceArea('sound', { loop: 'nope' }).value.loop, true);
});
