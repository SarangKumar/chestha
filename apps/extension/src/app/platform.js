/**
 * The same Vite build ships as a plain website and as the Chrome New Tab page.
 * Marketing chrome (landing, site footer, welcoming entry points) belongs on the
 * website only — the extension New Tab should stay a dense daily workspace.
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

/**
 * True when this document is painted inside another frame (the landing product
 * preview) or explicitly asked to embed via `?embed=1`. Embed mode skips
 * marketing chrome so the framed workspace looks like the product, not a site.
 */
export function isEmbedPreview() {
  try {
    if (new URLSearchParams(window.location.search).get('embed') === '1') {
      return true;
    }
  } catch {
    /* ignore */
  }
  try {
    return window.self !== window.top;
  } catch {
    // Cross-origin parent access throws — treat as embedded.
    return true;
  }
}
