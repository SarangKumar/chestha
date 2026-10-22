/**
 * One registry for every global shortcut: the actions, their defaults, combo
 * parsing, conflict detection and persistence shape. Dispatch lives in the web
 * app, but it is driven entirely by what this module resolves, so there is a
 * single listener rather than handlers scattered across components.
 *
 * "Mod" means Command on Apple platforms and Control elsewhere, which is how one
 * stored combo works correctly on both.
 */

export const SHORTCUT_ACTIONS = [
  { id: 'palette', name: 'Command palette', description: 'Open the command palette', default: 'Mod+K', customizable: true },
  { id: 'capture', name: 'Quick capture', description: 'Capture a task from anywhere', default: 'N', customizable: true },
  { id: 'sidebar', name: 'Today panel', description: 'Show or hide the today panel', default: '[', customizable: true },
  { id: 'go-dashboard', name: 'Go to dashboard', description: 'Open the dashboard', default: null, customizable: true },
  { id: 'go-tasks', name: 'Go to tasks', description: 'Open tasks', default: null, customizable: true },
  { id: 'go-calendar', name: 'Go to calendar', description: 'Open the calendar', default: null, customizable: true },
  { id: 'go-dsa', name: 'Go to DSA', description: 'Open the DSA section', default: null, customizable: true },
  { id: 'go-sounds', name: 'Go to sounds', description: 'Open ambient sounds', default: null, customizable: true },
  { id: 'go-settings', name: 'Go to settings', description: 'Open settings', default: null, customizable: true },
];

/** Always-available sequences, documented so they are discoverable, not editable. */
export const FIXED_SEQUENCES = [
  { keys: 'G then D', description: 'Go to the dashboard' },
  { keys: 'G then T', description: 'Go to tasks' },
  { keys: 'G then C', description: 'Go to the calendar' },
  { keys: 'G then A', description: 'Go to DSA' },
  { keys: 'G then O', description: 'Go to sounds' },
  { keys: 'G then S', description: 'Go to settings' },
  { keys: 'Esc', description: 'Close whatever is open' },
  { keys: 'Alt + arrows', description: 'Move a widget while editing the dashboard' },
  { keys: 'Arrows', description: 'Move by day in the calendar' },
];

export const SHORTCUT_IDS = SHORTCUT_ACTIONS.map((a) => a.id);

export function shortcutAction(id) {
  return SHORTCUT_ACTIONS.find((a) => a.id === id) ?? null;
}

const MODIFIER_ORDER = ['Mod', 'Ctrl', 'Alt', 'Shift'];
const MODIFIER_KEYS = new Set(['Control', 'Meta', 'Alt', 'Shift', 'CapsLock', 'Dead']);

/**
 * Combos a browser or OS owns. Rebinding these would break the user's browser,
 * so they are refused rather than silently stolen.
 */
const RESERVED = new Set([
  'Mod+W', 'Mod+T', 'Mod+N', 'Mod+Q', 'Mod+R', 'Mod+L', 'Mod+P', 'Mod+S',
  'Mod+Shift+W', 'Mod+Shift+T', 'Mod+Shift+N', 'Mod+Shift+Q',
  'Mod+Alt+I', 'Mod+Shift+I', 'F5', 'F11', 'F12',
  'Mod+PLUS', 'Mod+MINUS', 'Mod+0',
]);

/**
 * Named keys are whitelisted. Without this, any stray word in a stored file
 * ("nonsense") would be accepted as a key, so an unusable combo could survive
 * validation and silently never fire.
 */
const NAMED_KEYS = new Set([
  'Space', 'Enter', 'Escape', 'Tab', 'Backspace', 'Delete', 'Insert',
  'Home', 'End', 'PageUp', 'PageDown',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'PLUS', 'MINUS',
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
]);

function canonicalKey(key) {
  if (!key) return null;
  if (key === ' ' || key.toLowerCase() === 'space') return 'Space';
  if (key === '+') return 'PLUS';
  if (key === '-') return 'MINUS';
  if (key.length === 1) return key.toUpperCase();

  const titled = key[0].toUpperCase() + key.slice(1);
  if (NAMED_KEYS.has(titled)) return titled;
  // Match case-insensitively so "arrowup" and "pageup" are still accepted.
  for (const named of NAMED_KEYS) {
    if (named.toLowerCase() === key.toLowerCase()) return named;
  }
  return null;
}

/** @returns {string|null} a canonical combo string, or null if unusable. */
export function normalizeCombo(input) {
  if (typeof input !== 'string' || !input.trim()) return null;
  const parts = input.split('+').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const mods = new Set();
  let key = null;
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'mod' || lower === 'cmd' || lower === 'command' || lower === 'meta') mods.add('Mod');
    else if (lower === 'ctrl' || lower === 'control') mods.add('Ctrl');
    else if (lower === 'alt' || lower === 'option') mods.add('Alt');
    else if (lower === 'shift') mods.add('Shift');
    else key = canonicalKey(part);
  }
  if (!key) return null;
  const ordered = MODIFIER_ORDER.filter((m) => mods.has(m));
  return [...ordered, key].join('+');
}

/** Reads a combo off a keyboard event. Returns null while only modifiers are held. */
export function comboFromEvent(event, isApple = false) {
  if (MODIFIER_KEYS.has(event.key)) return null;
  const mods = [];
  const modPressed = isApple ? event.metaKey : event.ctrlKey;
  const otherCtrl = isApple ? event.ctrlKey : event.metaKey;
  if (modPressed) mods.push('Mod');
  if (otherCtrl) mods.push('Ctrl');
  if (event.altKey) mods.push('Alt');
  if (event.shiftKey) mods.push('Shift');
  const key = canonicalKey(event.key);
  if (!key) return null;
  return [...MODIFIER_ORDER.filter((m) => mods.includes(m)), key].join('+');
}

export function formatCombo(combo, isApple = false) {
  if (!combo) return 'Not set';
  return combo
    .split('+')
    .map((part) => {
      if (part === 'Mod') return isApple ? '⌘' : 'Ctrl';
      if (part === 'Alt') return isApple ? '⌥' : 'Alt';
      if (part === 'Shift') return isApple ? '⇧' : 'Shift';
      if (part === 'Ctrl') return isApple ? '⌃' : 'Ctrl';
      if (part === 'PLUS') return '+';
      if (part === 'MINUS') return '−';
      return part;
    })
    .join(isApple ? '' : '+');
}

/**
 * A single unmodified letter is fine (typing is excluded at dispatch), but a
 * bare modifier, a reserved browser combo, or an unusable key is refused.
 */
export function validateCombo(input) {
  const combo = normalizeCombo(input);
  if (!combo) return { ok: false, error: 'Press a key combination — a modifier on its own will not do.' };
  if (RESERVED.has(combo)) {
    return { ok: false, error: `${combo} is reserved by the browser or operating system, so it cannot be reassigned.` };
  }
  if (combo === 'Escape' || combo === 'Tab' || combo === 'Enter') {
    return { ok: false, error: `${combo} has a fixed meaning in the interface and cannot be reassigned.` };
  }
  return { ok: true, combo };
}

export function isReserved(combo) {
  return RESERVED.has(normalizeCombo(combo) ?? '');
}

/** Defaults overlaid with the user's stored choices. */
export function resolveShortcuts(overrides = {}) {
  const resolved = {};
  for (const action of SHORTCUT_ACTIONS) {
    const override = overrides?.[action.id];
    if (override === null) {
      resolved[action.id] = null; // deliberately unassigned
    } else {
      resolved[action.id] = normalizeCombo(override) ?? action.default;
    }
  }
  return resolved;
}

/** @returns {Array<{combo: string, actionIds: string[]}>} */
export function findConflicts(resolved) {
  const byCombo = new Map();
  for (const [id, combo] of Object.entries(resolved)) {
    if (!combo) continue;
    if (!byCombo.has(combo)) byCombo.set(combo, []);
    byCombo.get(combo).push(id);
  }
  return [...byCombo.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([combo, actionIds]) => ({ combo, actionIds }));
}

/** Which other action already owns this combo, if any. */
export function conflictFor(resolved, actionId, combo) {
  const normalized = normalizeCombo(combo);
  if (!normalized) return null;
  for (const [id, assigned] of Object.entries(resolved)) {
    if (id !== actionId && assigned === normalized) return id;
  }
  return null;
}

export function setShortcut(overrides, actionId, combo) {
  const action = shortcutAction(actionId);
  if (!action || !action.customizable) {
    return { ok: false, error: 'That shortcut cannot be customised.' };
  }
  const check = validateCombo(combo);
  if (!check.ok) return check;

  const resolved = resolveShortcuts(overrides);
  const clash = conflictFor(resolved, actionId, check.combo);
  if (clash) {
    return { ok: false, error: `${check.combo} is already used by “${shortcutAction(clash).name}”.`, conflictWith: clash };
  }
  return { ok: true, overrides: { ...overrides, [actionId]: check.combo } };
}

export function clearShortcut(overrides, actionId) {
  return { ...overrides, [actionId]: null };
}

export function resetShortcut(overrides, actionId) {
  const next = { ...overrides };
  delete next[actionId];
  return next;
}

export function resetAllShortcuts() {
  return {};
}

export function isCustomised(overrides, actionId) {
  const action = shortcutAction(actionId);
  if (!action) return false;
  if (!(actionId in (overrides ?? {}))) return false;
  const override = overrides[actionId];
  if (override === null) return action.default !== null;
  return normalizeCombo(override) !== action.default;
}

/** Storage validation: unknown ids and unusable combos are discarded. */
export function coerceShortcuts(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!SHORTCUT_IDS.includes(id)) continue;
    if (value === null) { out[id] = null; continue; }
    const check = validateCombo(value);
    if (check.ok) out[id] = check.combo;
  }
  // A stored file could contain two actions on one combo; keep the first.
  const seen = new Set();
  for (const id of SHORTCUT_IDS) {
    if (!(id in out) || out[id] === null) continue;
    if (seen.has(out[id])) delete out[id];
    else seen.add(out[id]);
  }
  return out;
}
