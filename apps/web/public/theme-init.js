/*
 * Applies the stored theme before first paint, so the wrong one never flashes.
 *
 * This lives in its own file rather than inline in index.html because the
 * extension runs under Manifest V3's content security policy, which allows only
 * `script-src 'self'` — an inline script is blocked outright, and the page then
 * loads in the wrong theme until React mounts.
 *
 * It must stay a classic, non-deferred script in <head> so it executes before
 * the document renders.
 */
try {
  var stored = localStorage.getItem('chestha.theme');
  var dark = stored === 'dark'
    || ((!stored || stored === 'system')
      && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) document.documentElement.classList.add('dark');
} catch (error) {
  /* private window, or site data blocked — the app still renders */
}
