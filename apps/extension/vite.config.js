import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// One version number, read from the root package.json at build time, so the
// About page and the extension manifest cannot drift apart.
const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

/**
 * The website origin is read from the env files rather than hardcoded in the
 * app, and checked here so a missing or malformed value stops the build. The
 * alternative is a bundle that throws on `new URL(...)` the first time someone
 * opens a New Tab, which is a far worse place to find out.
 */
function requireSiteUrl(mode) {
  const { VITE_SITE_URL: value } = loadEnv(mode, rootDir, 'VITE_');
  if (!value) {
    throw new Error(
      'VITE_SITE_URL is not set. Copy apps/extension/.env.example to '
      + '.env.local, or restore the committed .env.development / .env.production.',
    );
  }
  try {
    // Rejects a bare host or a path: every consumer resolves links against it.
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('not http(s)');
  } catch {
    throw new Error(`VITE_SITE_URL must be an absolute http(s) URL — got "${value}".`);
  }
  return value;
}

/**
 * Hands the resolved website origin to the extension assembly step.
 *
 * `scripts/build-extension.mjs` needs it to write `host_permissions` into the
 * manifest, and the manifest must name exactly the origin the bundle talks to:
 * a mismatch means the session cookie is not sent and every user reads as
 * signed out. Re-implementing Vite's env-file precedence in the assembly script
 * would be a second copy of that rule and a guaranteed source of drift, so the
 * value is emitted here — from the same `loadEnv` the bundle was built with —
 * and read from the build output. The assembly step deletes the file rather
 * than shipping it.
 */
function emitSiteOrigin(siteUrl) {
  return {
    name: 'chestha-site-origin',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: '.site-origin',
        source: new URL(siteUrl).origin,
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const siteUrl = requireSiteUrl(mode);

  return {
    plugins: [react(), tailwindcss(), emitSiteOrigin(siteUrl)],
    resolve: {
      alias: {
        '@': path.join(rootDir, 'src'),
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(version),
      // Written back as the env value the app reads, so the check above is on
      // the same string the bundle gets.
      'import.meta.env.VITE_SITE_URL': JSON.stringify(siteUrl),
    },
    server: { port: 5173 },
    build: {
      target: 'es2022',
      rollupOptions: {
        input: {
          // The workspace itself.
          index: path.join(rootDir, 'index.html'),
          // The audio host: an invisible extension page that keeps the mix
          // playing when the New Tab is navigated away. It is built here, with
          // the app, because it imports the same engine; it is inert in the
          // website build, where nothing loads it.
          offscreen: path.join(rootDir, 'offscreen.html'),
        },
      },
    },
  };
});
