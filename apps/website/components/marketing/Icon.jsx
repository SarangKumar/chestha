/**
 * The handful of glyphs the marketing chrome needs.
 *
 * Deliberately not the whole set: the extension's `icons.jsx` carries about
 * sixty, almost all of them for workspace sections this app does not have.
 * Copying only what is used keeps the two from looking like one file that
 * drifted. Geometry and stroke match the extension exactly, because the mark
 * beside them is the same mark.
 */
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

const PATHS = {
  github: <path d="M9.2 20.5v-2.6c-2.8.6-3.4-1.3-3.4-1.3-.5-1.2-1.2-1.5-1.2-1.5-1-.7.1-.7.1-.7 1.1.1 1.6 1.1 1.6 1.1 1 1.6 2.5 1.2 3.1.9.1-.7.4-1.2.7-1.5-2.3-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .9-.3 2.9 1a7.4 7.4 0 0 1 4 0c2-1.3 2.9-1 2.9-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.3 4.7-4.6 5 .4.4.8 1.1.8 2.2v3.4" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" /></>,
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />,
  // The third theme choice is a screen, not a time of day. Kept identical to
  // the extension's own `monitor` and `check` so the two pickers match.
  monitor: <><rect x="2.5" y="4" width="19" height="13" rx="2" /><path d="M8.5 20.5h7M12 17v3.5" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  lock: <><rect x="4.5" y="10" width="15" height="10.5" rx="2" /><path d="M8 10V7.5a4 4 0 0 1 8 0V10" /></>,
  external: <><path d="M14 4.5h5.5V10" /><path d="M19.5 4.5 11 13" /><path d="M17 14.5v3a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3" /></>,
};

export function Icon({ name, className = 'size-5' }) {
  return <svg {...base} className={className} aria-hidden="true">{PATHS[name] ?? null}</svg>;
}
