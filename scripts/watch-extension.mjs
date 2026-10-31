/**
 * Rebuilds the unpacked extension whenever the app changes.
 *
 * Vite's own `--watch` rebuilds `apps/extension/dist`, but the extension also needs the
 * manifest and background worker copied alongside it — so this watches the build
 * output and re-assembles after each one.
 *
 * Chrome does not notice file changes on its own: after a rebuild, press the
 * reload icon on the extension's card (or Ctrl/Cmd+R on its New Tab page for
 * page-only changes).
 */
import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assembleExtension, EXTENSION_DIST, LOAD_INSTRUCTIONS, APP_DIST } from './build-extension.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

// The picker reads a generated index, so refresh it before the first build.
spawn(process.execPath, [`${root}scripts/build-backgrounds.mjs`], { stdio: 'inherit' })
  .on('close', start);

function start() {
  console.log('Starting Vite in watch mode…\n');

  const vite = spawn(
    'npm',
    ['run', 'build', '--workspace', '@chestha/extension', '--', '--watch'],
    { cwd: root, stdio: 'inherit' },
  );

  // Vite writes many files per rebuild; debounce so the extension is assembled
  // once per build rather than once per file.
  let timer = null;
  let builds = 0;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!assembleExtension({ quiet: true })) return;
      builds += 1;
      const time = new Date().toLocaleTimeString();
      console.log(`\n[${time}] extension rebuilt (${builds}) — press reload on its card in chrome://extensions`);
    }, 400);
  };

  if (!existsSync(APP_DIST)) mkdirSync(APP_DIST, { recursive: true });
  const watcher = watch(APP_DIST, { recursive: true }, schedule);
  schedule();

  console.log(`${LOAD_INSTRUCTIONS}\n\nWatching for changes. Ctrl+C to stop.`);

  const stop = () => {
    watcher.close();
    vite.kill('SIGTERM');
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  vite.on('close', stop);
}
