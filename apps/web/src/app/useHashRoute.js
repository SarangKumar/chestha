import { useCallback, useEffect, useState } from 'react';

/**
 * Routable sections. `about` is last and is deliberately absent from the
 * navigation rail — it is reached from the command palette or a direct link, so
 * it needs a route without taking up a permanent slot.
 */
export const SECTIONS = ['dashboard', 'tasks', 'calendar', 'dsa', 'grove', 'websites', 'sounds', 'settings', 'about'];

function read() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [section, param] = raw.split('/');
  return {
    section: SECTIONS.includes(section) ? section : 'dashboard',
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
