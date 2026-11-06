/**
 * The same Vite build runs as the Chrome New Tab page and, on the dev server or
 * a preview of the build, as a plain page. Both are the workspace: the product's
 * marketing site is `apps/website`, not this bundle. What is still worth asking
 * is whether the mobile nav bar is present, which only the extension draws.
 *
 * `chrome.runtime.id` is present inside an extension page and absent on the web.
 */
export function isExtensionRuntime() {
  try {
    return typeof chrome !== 'undefined' && Boolean(chrome?.runtime?.id);
  } catch {
    return false;
  }
}
