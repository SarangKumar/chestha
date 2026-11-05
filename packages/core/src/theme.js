/**
 * The theme choice, shared by both apps.
 *
 * There are three choices, not two: `system` is a real, stored value and not
 * the absence of one. That distinction is the whole reason this module exists —
 * "no preference" and "follow the operating system" look identical the moment
 * the OS is dark, but only one of them should start following the OS again once
 * someone has explicitly asked for light.
 *
 * `system` is also the only choice that can change while nothing is clicked, so
 * anything resolving it has to keep listening to the media query rather than
 * reading it once. `watchTheme` is that listener, written once here because
 * both apps had to get it right and only one of them did.
 *
 * The storage key and the dark-resolution rule are duplicated, deliberately and
 * unavoidably, in two pre-paint bootstrap scripts —
 * `apps/extension/public/theme-init.js` and the `THEME_INIT` constant in
 * `apps/website/app/layout.jsx`. Those run before any module loads, so they
 * cannot import this one. If the rule below changes, change all three.
 *
 * The stored value does not travel between the site and the extension: they are
 * separate origins, so each remembers its own choice under the same key.
 */

export const THEME_STORAGE_KEY = 'chestha.theme';

/**
 * In the order they are offered. `icon` names an entry in each app's own icon
 * set — both apps happen to use the same three names, which is why the choice
 * of icon lives with the choice of theme rather than in the component.
 */
export const THEME_CHOICES = [
  { id: 'system', label: 'System', icon: 'monitor', hint: 'Follow the operating system' },
  { id: 'light', label: 'Light', icon: 'sun', hint: 'Always light' },
  { id: 'dark', label: 'Dark', icon: 'moon', hint: 'Always dark' },
];

export const THEMES = THEME_CHOICES.map((choice) => choice.id);

export const DEFAULT_THEME = 'system';

/** Anything unrecognised — including a missing key — reads as `system`. */
export function coerceTheme(raw) {
  return THEMES.includes(raw) ? raw : DEFAULT_THEME;
}

export function themeChoice(id) {
  return THEME_CHOICES.find((choice) => choice.id === id) ?? THEME_CHOICES[0];
}

/** The icon for a choice, which is the one the trigger shows. */
export function themeIcon(id) {
  return themeChoice(coerceTheme(id)).icon;
}

/**
 * Whether a choice means dark, given what the OS currently reports.
 *
 * `systemDark` is passed in rather than read here: this has to stay callable
 * where there is no `window` at all, which on the website is every server
 * render.
 */
export function resolvesDark(theme, systemDark) {
  const choice = coerceTheme(theme);
  if (choice === 'dark') return true;
  if (choice === 'light') return false;
  return Boolean(systemDark);
}

/**
 * Apply a theme to the document and keep applying it.
 *
 * Returns a teardown function, so it is a drop-in for a React effect. Only
 * `system` actually needs the listener, but subscribing unconditionally keeps
 * one code path: the callback is cheap, and a conditional one here was how the
 * extension ended up ignoring an OS change after a round trip through light.
 */
export function watchTheme(theme, { document: doc, window: win } = {}) {
  const root = (doc ?? globalThis.document)?.documentElement;
  const view = win ?? globalThis.window;
  if (!root || !view?.matchMedia) return () => {};

  const media = view.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => root.classList.toggle('dark', resolvesDark(theme, media.matches));
  apply();
  media.addEventListener('change', apply);
  return () => media.removeEventListener('change', apply);
}

/** Persist the choice for the pre-paint script to read on the next load. */
export function storeTheme(theme, storage = globalThis.localStorage) {
  try {
    storage?.setItem(THEME_STORAGE_KEY, coerceTheme(theme));
  } catch {
    /* private window, or site data blocked — the class on <html> still applies */
  }
}

/** What the pre-paint script left behind, for an app with no store of its own. */
export function readStoredTheme(storage = globalThis.localStorage) {
  try {
    return coerceTheme(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}
