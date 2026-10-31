import { readFileSync } from 'node:fs';

// One version number, read from the root package.json at build time, so the
// site and the extension manifest cannot drift apart — the same reason
// apps/extension/vite.config.js does this.
const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

/** @type {import('next').NextConfig} */
export default {
  env: { NEXT_PUBLIC_APP_VERSION: version },
  // `packages/*` ship as plain untranspiled ESM source rather than as built
  // artefacts, so Next has to compile them like app code.
  transpilePackages: ['@chestha/core', '@chestha/db', '@chestha/ui'],
  // The Prisma client resolves a query engine at runtime; bundling it into the
  // server build breaks that resolution.
  serverExternalPackages: ['@prisma/client', '.prisma/client'],
};
