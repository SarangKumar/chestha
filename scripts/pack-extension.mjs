/**
 * Packs the built extension into a .zip for the Chrome Web Store.
 *
 * The unpacked build in `dist/extension` is a development artefact: it carries
 * the author's own wallpaper and any extra audio they dropped in, plus the
 * READMEs that explain how to add more. None of that belongs in an upload:
 * a wallpaper or recording you are allowed to use locally is not automatically
 * one you are allowed to redistribute to every installer, and shipping media by
 * accident is the easy mistake, so stripping is the default and keeping it takes
 * a flag.
 *
 * The sound library is the exception. Those twelve files ARE the Sounds page —
 * they are declared in packages/core/src/sound.js, licensed for redistribution,
 * and under 10 MB in total, so they always ship. Stripping them would leave an
 * installed extension with an empty library and no way to fill it.
 *
 * Stripping media leaves each media catalog in place with an empty list rather
 * than deleting it, because the app fetches those catalogs on load; an empty
 * list is a normal state the catalogue already handles, a 404 is not.
 *
 * Media indexes are named catalog.json (not manifest.json). Chrome Web Store
 * rejects a package that contains more than one file named manifest.json, and
 * the MV3 extension manifest must be the only one.
 *
 * Staging is deleted after the zip is written — only the .zip remains.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EXTENSION_DIST } from './build-extension.mjs';
import { SOUNDS } from '../packages/core/src/sound.js';

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

/**
 * Folders whose media is the author's own, each paired with its catalog.
 * Catalogs must NOT be named manifest.json — CWS treats every path ending in
 * /manifest.json as an extension manifest.
 *
 * `keep` names files that ship regardless, read from the catalogue rather than
 * hardcoded so adding a sound cannot leave its file behind.
 */
const MEDIA_FOLDERS = [
  {
    dir: 'audio',
    catalog: 'audio/catalog.json',
    key: 'sounds',
    keep: new Set(SOUNDS.map((s) => s.file)),
  },
  { dir: 'backgrounds', catalog: 'backgrounds/catalog.json', key: 'images' },
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

function isManifestPath(rel) {
  return rel === 'manifest.json' || rel.endsWith('/manifest.json');
}

export function packExtension({ keepMedia = false, quiet = false } = {}) {
  if (!existsSync(EXTENSION_DIST)) {
    if (!quiet) console.error('dist/extension is missing — run `npm run work` first.');
    return null;
  }

  const version = JSON.parse(readFileSync(`${EXTENSION_DIST}/manifest.json`, 'utf8')).version;
  const stage = `${OUT_DIR}/chestha-${version}`;
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

  // Drop any leftover media indexes named manifest.json (legacy name). CWS
  // would treat them as extra extension manifests.
  for (const { dir } of MEDIA_FOLDERS) {
    drop(`${dir}/manifest.json`);
  }

  if (!keepMedia) {
    for (const { dir, catalog, key, keep } of MEDIA_FOLDERS) {
      const folder = `${stage}/${dir}`;
      if (!existsSync(folder)) continue;
      // Everything but the catalog itself and the files that always ship: the
      // catalog is rewritten, not removed.
      for (const name of readdirSync(folder)) {
        if (`${dir}/${name}` === catalog || keep?.has(name)) continue;
        drop(`${dir}/${name}`);
      }
      writeFileSync(
        `${stage}/${catalog}`,
        `${JSON.stringify({ comment: 'Bundled media is not redistributed. Add your own files here.', [key]: [] }, null, 2)}\n`,
      );
    }
  }

  // Guard: a shipped sound whose file is missing is a broken Sounds page, and
  // the app only finds out when someone presses play.
  for (const sound of SOUNDS) {
    if (!existsSync(`${stage}/audio/${sound.file}`)) {
      rmSync(stage, { recursive: true, force: true });
      throw new Error(`Pack refused: ${sound.id} names audio/${sound.file}, which is not in the build.`);
    }
  }

  // Guard: never ship a second file named manifest.json
  const stagedFiles = walk(stage);
  const allNamedManifest = stagedFiles.filter(isManifestPath);
  if (allNamedManifest.length !== 1 || allNamedManifest[0] !== 'manifest.json') {
    rmSync(stage, { recursive: true, force: true });
    throw new Error(
      `Pack refused: expected exactly one manifest.json at package root, found: ${allNamedManifest.join(', ') || '(none)'}`,
    );
  }

  // `zip -r` from inside the staging folder, so paths in the archive are
  // relative to the extension root. The Web Store rejects an archive whose
  // manifest.json sits inside a wrapper directory.
  execFileSync('zip', ['-r', '-q', '-X', zip, '.'], { cwd: stage });

  const after = totalBytes(stage);
  const zipped = statSync(zip).size;

  // Remove temporary staging — only the .zip remains.
  rmSync(stage, { recursive: true, force: true });

  const result = {
    zip,
    stage: null,
    version,
    before,
    after,
    zipped,
    dropped,
    keptMedia: keepMedia,
  };

  if (!quiet) {
    console.log(`Chestha ${version} packed for the Chrome Web Store.\n`);
    if (dropped.length > 0) {
      console.log('Stripped:');
      for (const line of dropped) console.log(`  - ${line}`);
      if (!keepMedia) console.log('  (the sound library and both catalogs kept; catalogs emptied of extras)');
      console.log('');
    }
    console.log(`  unpacked build  ${human(result.before)}`);
    console.log(`  after stripping ${human(result.after)}`);
    console.log(`  zipped          ${human(result.zipped)}\n`);
    console.log(`Upload:  ${zip}`);
    console.log('Staging removed after pack.\n');
    console.log('Pass --keep-media to include the bundled wallpaper and any extra audio you');
    console.log('added. Only do that if you hold redistribution rights for every one of those');
    console.log('files. The twelve shipped sounds are included either way.');
  }

  return result;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  try {
    if (!packExtension({ keepMedia: process.argv.includes('--keep-media') })) process.exit(1);
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}
