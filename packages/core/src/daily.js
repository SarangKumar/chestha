/**
 * Deterministic "one per day" selection.
 *
 * The same date always yields the same item, so a daily pick is stable across
 * reloads and does not shuffle while you look at it, and it needs no stored
 * cursor to advance.
 */
export function pickForDay(items, iso, offset = 0) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const seed = [...String(iso)].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return items[(seed + offset) % items.length];
}

/** Trims, drops blanks and caps a user-entered list. */
export function normalizeLines(value, max = 50) {
  const source = Array.isArray(value) ? value : String(value ?? '').split('\n');
  const out = [];
  for (const line of source) {
    const text = String(line ?? '').trim();
    if (!text) continue;
    out.push(text.slice(0, 280));
    if (out.length >= max) break;
  }
  return out;
}
