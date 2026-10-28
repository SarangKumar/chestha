/**
 * The same Vite build ships as a plain website and as the Chrome New Tab page.
 * Marketing chrome (site footer, welcoming entry points) belongs on the website
 * only — the extension New Tab should stay a dense daily workspace.
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
