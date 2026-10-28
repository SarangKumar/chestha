import { useCallback, useEffect, useState } from 'react';
import { isEmbedPreview, isExtensionRuntime } from './platform.js';

/**
 * Routable sections. `home` is the website marketing landing and is absent
 * from the nav rail. `about` is website-only (marketing chrome); `changelog`
 * is rail-absent — marketing / palette on the site, palette in the extension.
 */
export const SECTIONS = [
  'home',
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
];

/** App shell sections (everything except the marketing landing). */
export const APP_SECTIONS = SECTIONS.filter((section) => section !== 'home');

function defaultSection() {
  // Extension New Tab and the landing product-preview iframe always open the
  // dense workspace — never the marketing page (which would nest another iframe).
  if (isExtensionRuntime() || isEmbedPreview()) return 'dashboard';
  return 'home';
}

function read() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [section, param] = raw.split('/');
  if (!section) {
    return { section: defaultSection(), param: null };
  }
  // Extension / embed must never land on marketing (home or About).
  if ((isExtensionRuntime() || isEmbedPreview()) && (section === 'home' || section === 'about')) {
    return { section: 'dashboard', param: null };
  }
  return {
    section: SECTIONS.includes(section) ? section : defaultSection(),
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
