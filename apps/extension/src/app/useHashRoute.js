import { useCallback, useEffect, useState } from 'react';
/**
 * Routable sections. All of them are app-shell sections: the marketing landing
 * used to live here as `home`, but the product's site is `apps/website` now and
 * this bundle is only ever the workspace — in the New Tab, on the dev server
 * and in a preview of the build alike. `about`, `changelog` and `guide` are
 * reachable from the palette rather than the rail.
 */
export const SECTIONS = [
  'dashboard',
  'tasks',
  'calendar',
  'dsa',
  'grove',
  'websites',
  'sounds',
  'settings',
  'about',
  'changelog',
  'guide',
];

/**
 * Retained as the name the rest of the app imports. Nothing is filtered out of
 * it any more — every routable section is an app-shell section.
 */
export const APP_SECTIONS = SECTIONS;

/** The workspace is the only start screen this bundle has. */
const DEFAULT_SECTION = 'dashboard';

function read() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [section, param] = raw.split('/');
  if (!section) {
    return { section: DEFAULT_SECTION, param: null };
  }
  return {
    section: SECTIONS.includes(section) ? section : DEFAULT_SECTION,
    param: param ? decodeURIComponent(param) : null,
  };
}

/** A hash route keeps deep links free of a router dependency, and lets the
 *  extension open a specific section with a plain URL. */
export function useHashRoute() {
  const [route, setRoute] = useState(read);

  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((section, param) => {
    const next = param ? `#/${section}/${encodeURIComponent(param)}` : `#/${section}`;
    if (window.location.hash === next) setRoute(read());
    else window.location.hash = next;
  }, []);

  return [route, navigate];
}
