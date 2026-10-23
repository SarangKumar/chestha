/**
 * Packs the built extension into a .zip for the Chrome Web Store.
 *
 * The unpacked build in `apps/extension/dist` is a development artefact: it
 * carries the author's own wallpaper and audio, plus the READMEs that explain
 * how to add more. None of that belongs in an upload. Two reasons:
 *
 *   1. Licence. A wallpaper or recording you are allowed to use locally is not
 *      automatically one you are allowed to redistribute to every installer.
 *      Shipping media by accident is the easy mistake, so stripping is the
 *      default and keeping it takes a flag.
 *   2. Size. The audio alone is ~25 MB of a ~27 MB build, and every installer
 *      downloads it whether or not they ever open the Sounds page.
 *
 * Stripping media leaves each manifest in place with an empty list rather than
 * deleting it, because the app fetches those manifests on load; an empty list
 * is a normal state the catalogue already handles, a 404 is not.
 *
 * The staging copy is built beside the zip and left in place, so you can inspect
 * exactly what was uploaded after the fact.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EXTENSION_DIST } from './build-extension.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = `${root}release`;

/**
 * Files that exist to document the folder they sit in, or that nothing in the
 * built app references. Dropping them changes no behaviour.
 */
const DROP_ALWAYS = [
  'audio/README.md',
  'backgrounds/README.md',
  'icon.png', // superseded by the sized icons; referenced by neither manifest nor page
];

/** Folders whose media is the author's own, each paired with its manifest. */
const MEDIA_FOLDERS = [
  { dir: 'audio', manifest: 'audio/manifest.json', key: 'sounds' },
  { dir: 'backgrounds', manifest: 'backgrounds/manifest.json', key: 'backgrounds' },
];

function walk(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = `${dir}/${entry.name}`;
    return entry.isDirectory() ? walk(full, base) : [full.slice(base.length + 1)];
  });
}

const human = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

function totalBytes(dir) {
  return walk(dir).reduce((sum, rel) => sum + statSync(`${dir}/${rel}`).size, 0);
}

export function packExtension({ keepMedia = false, quiet = false } = {}) {
  if (!existsSync(EXTENSION_DIST)) {
    if (!quiet) console.error('apps/extension/dist is missing — run `npm run build:extension` first.');
    return null;
  }

  const version = JSON.parse(readFileSync(`${EXTENSION_DIST}/manifest.json`, 'utf8')).version;
  const stage = `${OUT_DIR}/vistaar-${version}`;
  const zip = `${stage}.zip`;
  const before = totalBytes(EXTENSION_DIST);

  rmSync(stage, { recursive: true, force: true });
  rmSync(zip, { force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  cpSync(EXTENSION_DIST, stage, { recursive: true });

  const dropped = [];
  const drop = (rel) => {
    const path = `${stage}/${rel}`;
    if (!existsSync(path)) return;
    dropped.push(`${rel} (${human(statSync(path).size)})`);
    rmSync(path, { force: true });
  };

  for (const rel of DROP_ALWAYS) drop(rel);

  if (!keepMedia) {
    for (const { dir, manifest, key } of MEDIA_FOLDERS) {
      const folder = `${stage}/${dir}`;
      if (!existsSync(folder)) continue;
      // Everything but the manifest itself: the manifest is rewritten, not removed.
      for (const name of readdirSync(folder)) {
        if (`${dir}/${name}` !== manifest) drop(`${dir}/${name}`);
      }
      writeFileSync(
        `${stage}/${manifest}`,
        `${JSON.stringify({ comment: 'Bundled media is not redistributed. Add your own files here.', [key]: [] }, null, 2)}\n`,
      );
    }
  }

  // `zip -r` from inside the staging folder, so paths in the archive are
  // relative to the extension root. The Web Store rejects an archive whose
  // manifest.json sits inside a wrapper directory.
  execFileSync('zip', ['-r', '-q', '-X', zip, '.'], { cwd: stage });

  const result = {
    zip,
    stage,
    version,
    before,
    after: totalBytes(stage),
    zipped: statSync(zip).size,
    dropped,
    keptMedia: keepMedia,
  };

  if (!quiet) {
    console.log(`Vistaar ${version} packed for the Chrome Web Store.\n`);
    if (dropped.length > 0) {
      console.log('Stripped:');
      for (const line of dropped) console.log(`  - ${line}`);
      if (!keepMedia) console.log('  (audio and background manifests kept, with empty lists)');
      console.log('');
    }
    console.log(`  unpacked build  ${human(result.before)}`);
    console.log(`  after stripping ${human(result.after)}`);
    console.log(`  zipped          ${human(result.zipped)}\n`);
    console.log(`Upload:  ${zip}`);
    console.log(`Staged:  ${stage}  (what the archive contains, for checking)\n`);
    console.log('Pass --keep-media to include the bundled wallpaper and audio. Only do that');
    console.log('if you hold redistribution rights for every file in those folders.');
  }

  return result;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  if (!packExtension({ keepMedia: process.argv.includes('--keep-media') })) process.exit(1);
}
