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
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

export const APP_DIST = `${root}apps/extension/dist`;
export const EXTENSION_SRC = `${root}scripts/extension`;
export const EXTENSION_DIST = `${root}dist/extension`;

/**
 * Written by the Vite build (see the `chestha-site-origin` plugin in
 * `apps/extension/vite.config.js`), read here, and never shipped.
 */
const ORIGIN_FILE = '.site-origin';

/**
 * Writes `host_permissions` into the assembled manifest.
 *
 * The permission names the website origin, which is a build-time value, so it
 * cannot sit in the committed manifest. It is read from the origin the bundle
 * was built with rather than re-resolved here: Vite's env-file precedence is
 * not worth re-implementing, and a manifest that names a different origin than
 * the bundle is the worst kind of wrong — the session cookie is silently not
 * sent, `/api/session` answers "signed out" for everyone, and every gated
 * section locks.
 *
 * `<origin>/*` rather than the bare origin, because a host permission is a match
 * pattern and the bare form matches no path.
 */
function applyHostPermissions() {
  const originPath = `${APP_DIST}/${ORIGIN_FILE}`;
  if (!existsSync(originPath)) {
    console.error(
      `${ORIGIN_FILE} is missing from apps/extension/dist — re-run \`npm run build:extension\`.`,
    );
    return false;
  }

  const origin = readFileSync(originPath, 'utf8').trim();
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('not http(s)');
  } catch {
    console.error(`${ORIGIN_FILE} does not hold an absolute http(s) origin — got "${origin}".`);
    return false;
  }

  const manifestPath = `${EXTENSION_DIST}/manifest.json`;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  // The notes in the committed manifest are for a reader of that file and have
  // no business in the shipped one, where Chrome would report each as an
  // unrecognised key. Every `_`-prefixed key goes, so adding another note to
  // the source manifest needs no change here.
  for (const key of Object.keys(manifest)) {
    if (key.startsWith('_')) delete manifest[key];
  }
  manifest.host_permissions = [`${new URL(origin).origin}/*`];
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  // A build artefact, not part of the extension.
  rmSync(`${EXTENSION_DIST}/${ORIGIN_FILE}`, { force: true });
  return true;
}

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
  if (!applyHostPermissions()) {
    // Leaving a manifest with no host permission behind would produce an
    // extension that loads and then reports everyone as signed out, which is a
    // far more confusing failure than not assembling at all.
    rmSync(EXTENSION_DIST, { recursive: true, force: true });
    return false;
  }
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
