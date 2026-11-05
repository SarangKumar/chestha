import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_THEME, THEMES, THEME_CHOICES, THEME_STORAGE_KEY, coerceTheme, readStoredTheme,
  resolvesDark, storeTheme, themeChoice, themeIcon, watchTheme,
} from '../src/index.js';
import { coerceArea } from '../src/schema.js';

// ─── The three choices ───────────────────────────────────────────────────────

test('there are exactly three choices, and system is the default', () => {
  assert.deepEqual(THEMES, ['system', 'light', 'dark']);
  assert.equal(DEFAULT_THEME, 'system');
  // System comes first because it is the default: the list doubles as the menu.
  assert.equal(THEME_CHOICES[0].id, 'system');
});

test('every choice carries a label, an icon and a hint', () => {
  for (const choice of THEME_CHOICES) {
    assert.ok(choice.label, `${choice.id} needs a label`);
    assert.ok(choice.icon, `${choice.id} needs an icon`);
    assert.ok(choice.hint, `${choice.id} needs a hint`);
  }
  // Three distinct icons: two choices sharing one would make them look identical.
  assert.equal(new Set(THEME_CHOICES.map((c) => c.icon)).size, 3);
});

// ─── Coercion: unknown is system, not dark ───────────────────────────────────

test('anything unrecognised reads as system', () => {
  for (const raw of [null, undefined, '', 'nonsense', 0, [], {}, 'Dark', 'SYSTEM']) {
    assert.equal(coerceTheme(raw), 'system', `${JSON.stringify(raw)}`);
  }
});

test('a real choice survives coercion', () => {
  for (const id of THEMES) assert.equal(coerceTheme(id), id);
});

test('a settings record with a junk theme still loads', () => {
  const { value } = coerceArea('settings', { theme: 'neon' });
  assert.equal(value.theme, 'system', 'the field defaults, it does not fail');
});

// ─── Resolution ──────────────────────────────────────────────────────────────

test('light and dark ignore the operating system entirely', () => {
  assert.equal(resolvesDark('dark', false), true, 'dark stays dark under a light OS');
  assert.equal(resolvesDark('light', true), false, 'light stays light under a dark OS');
});

test('system is the only choice that follows the operating system', () => {
  assert.equal(resolvesDark('system', true), true);
  assert.equal(resolvesDark('system', false), false);
});

test('an unknown choice resolves as system would, not as dark', () => {
  // The failure mode that matters: a corrupt value must not force dark on
  // someone whose OS is light.
  assert.equal(resolvesDark('nonsense', false), false);
  assert.equal(resolvesDark(null, true), true);
});

test('the icon names the choice, so system is never shown as a sun', () => {
  assert.equal(themeIcon('system'), 'monitor');
  assert.equal(themeIcon('light'), 'sun');
  assert.equal(themeIcon('dark'), 'moon');
  assert.equal(themeIcon('nonsense'), 'monitor', 'falls back with the value');
  assert.equal(themeChoice('nope').id, 'system');
});

// ─── Storage ─────────────────────────────────────────────────────────────────

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
  };
}

test('the stored value is written under the key the bootstrap script reads', () => {
  const storage = fakeStorage();
  storeTheme('dark', storage);
  assert.equal(storage.map.get(THEME_STORAGE_KEY), 'dark');
  assert.equal(THEME_STORAGE_KEY, 'chestha.theme', 'both pre-paint scripts hard-code this');
});

test('a junk value is normalised on the way in, not stored as-is', () => {
  const storage = fakeStorage();
  storeTheme('neon', storage);
  assert.equal(storage.map.get(THEME_STORAGE_KEY), 'system');
});

test('a blocked or missing storage neither throws nor loses the default', () => {
  const blocked = {
    getItem() { throw new Error('site data blocked'); },
    setItem() { throw new Error('site data blocked'); },
  };
  assert.doesNotThrow(() => storeTheme('dark', blocked));
  assert.equal(readStoredTheme(blocked), 'system');
  assert.equal(readStoredTheme(fakeStorage()), 'system', 'nothing stored yet');
  assert.equal(readStoredTheme(fakeStorage({ 'chestha.theme': 'light' })), 'light');
});

// ─── watchTheme keeps following the OS ───────────────────────────────────────

function fakeEnv(systemDark) {
  const classes = new Set();
  const listeners = new Set();
  return {
    classes,
    emit(next) {
      this.media.matches = next;
      for (const fn of listeners) fn();
    },
    media: {
      matches: systemDark,
      addEventListener: (_, fn) => listeners.add(fn),
      removeEventListener: (_, fn) => listeners.delete(fn),
    },
    listenerCount: () => listeners.size,
    get doc() {
      return {
        documentElement: {
          classList: {
            toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
          },
        },
      };
    },
    get win() {
      return { matchMedia: () => this.media };
    },
  };
}

test('watchTheme applies the class immediately, before any OS change', () => {
  const env = fakeEnv(true);
  const stop = watchTheme('system', { document: env.doc, window: env.win });
  assert.equal(env.classes.has('dark'), true, 'a dark OS on `system` is dark at once');
  stop();
});

test('a later OS change is picked up while on system', () => {
  const env = fakeEnv(false);
  const stop = watchTheme('system', { document: env.doc, window: env.win });
  assert.equal(env.classes.has('dark'), false);
  env.emit(true);
  assert.equal(env.classes.has('dark'), true, 'the OS went dark and so did the page');
  env.emit(false);
  assert.equal(env.classes.has('dark'), false);
  stop();
});

test('an OS change is ignored on an explicit choice', () => {
  const env = fakeEnv(false);
  const stop = watchTheme('light', { document: env.doc, window: env.win });
  env.emit(true);
  assert.equal(env.classes.has('dark'), false, 'light was asked for and light it stays');
  stop();
});

test('the teardown unsubscribes, so re-running does not stack listeners', () => {
  const env = fakeEnv(false);
  const stop = watchTheme('system', { document: env.doc, window: env.win });
  assert.equal(env.listenerCount(), 1);
  stop();
  assert.equal(env.listenerCount(), 0);
  // And the orphaned listener does not keep writing to the document.
  env.emit(true);
  assert.equal(env.classes.has('dark'), false);
});

test('watchTheme is a no-op where there is no document or matchMedia', () => {
  // The website renders this module on the server, where neither exists.
  assert.doesNotThrow(() => watchTheme('dark', { document: null, window: null })());
  assert.equal(typeof watchTheme('dark', { document: null, window: null }), 'function');
});
