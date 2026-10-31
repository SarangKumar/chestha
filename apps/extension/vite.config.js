import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// One version number, read from the root package.json at build time, so the
// About page and the extension manifest cannot drift apart.
const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.join(rootDir, 'src'),
    },
  },
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: { port: 5173 },
  build: { target: 'es2022' },
});
