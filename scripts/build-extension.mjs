/**
 * Assembles the unpacked Chrome extension.
 *
 * The built web app is copied in wholesale and the manifest sits beside it, so
 * the extension is the same application running from `chrome-extension://`
 * rather than a separate build. Absolute asset paths (/icon-192.png,
 * /dsa-packs/*.json, /audio/*) resolve against the extension root, which is why
 * no base-path rewriting is needed.
 *
 * The assembly step is exported so the watcher can reuse it rather than
 * duplicating the copy rules.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

export const APP_DIST = `${root}apps/extension/dist`;
export const EXTENSION_SRC = `${root}scripts/extension`;
export const EXTENSION_DIST = `${root}dist/extension`;

/** @returns {boolean} whether the extension was written */
export function assembleExtension({ quiet = false } = {}) {
  if (!existsSync(APP_DIST)) {
    if (!quiet) console.error('apps/extension/dist is missing — run `npm run build:extension` first.');
    return false;
  }

  rmSync(EXTENSION_DIST, { recursive: true, force: true });
  mkdirSync(EXTENSION_DIST, { recursive: true });
  cpSync(APP_DIST, EXTENSION_DIST, { recursive: true });
  cpSync(EXTENSION_SRC, EXTENSION_DIST, { recursive: true });
  return true;
}

export const LOAD_INSTRUCTIONS = `Load it in Chrome:
  1. Open chrome://extensions
  2. Turn on "Developer mode" (top right)
  3. Click "Load unpacked" and choose:
     ${EXTENSION_DIST}
  4. Pin the icon and click it to open the workspace

This also replaces Chrome's New Tab page. Chrome will ask you to confirm the
change the first time, and you can undo it at any point by disabling or removing
the extension, or by clicking "Keep my settings" in that prompt.

Note: Chrome does NOT let an extension change the "On startup" pages. To have the
workspace open when Chrome launches, set it yourself:
  Settings > On startup > Open a specific page > Add a new page, and paste the
  extension's index.html URL (copy it from the extension's card, or open a new
  tab and copy the address).

Its data lives on the chrome-extension:// origin, separate from the dev server's
— move data across with Settings > Export / Import.`;

// Only act when invoked directly, so importing this does not rebuild anything.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  if (!assembleExtension()) process.exit(1);
  console.log(`Unpacked extension written to dist/extension\n\n${LOAD_INSTRUCTIONS}\n
Re-run \`npm run build:extension\` after changes, then press the reload icon on
the extension card — or use \`npm run watch:work\` to rebuild automatically.`);
}
