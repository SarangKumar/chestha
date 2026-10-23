/**
 * Assembles the unpacked Chrome extension.
 *
 * The built web app is copied in wholesale and the manifest sits beside it, so
 * the extension is the same application running from `chrome-extension://`
 * rather than a separate build. Absolute asset paths (/icon-192.png,
 * /dsa-packs/*.json, /audio/*) resolve against the extension root, which is why
 * no base-path rewriting is needed.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const webDist = `${root}apps/web/dist`;
const extSrc = `${root}apps/extension/src`;
const out = `${root}apps/extension/dist`;

if (!existsSync(webDist)) {
  console.error('apps/web/dist is missing — run `npm run build` first.');
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

cpSync(webDist, out, { recursive: true });
cpSync(extSrc, out, { recursive: true });

console.log(`Unpacked extension written to apps/extension/dist

Load it in Chrome:
  1. Open chrome://extensions
  2. Turn on "Developer mode" (top right)
  3. Click "Load unpacked" and choose:
     ${out}
  4. Pin the icon and click it to open the workspace

This also replaces Chrome's New Tab page. Chrome will ask you to confirm the
change the first time, and you can undo it at any point by disabling or removing
the extension, or by clicking "Keep my settings" in that prompt.

Note: Chrome does NOT let an extension change the "On startup" pages. To have the
workspace open when Chrome launches, set it yourself:
  Settings > On startup > Open a specific page > Add a new page, and paste the
  extension's index.html URL (copy it from the extension's card, or open a new
  tab and copy the address).

Re-run \`npm run build:extension\` after changes, then press the reload icon on
the extension card. Its data lives on the chrome-extension:// origin, separate
from the dev server's — move data across with Settings > Export / Import.`);
