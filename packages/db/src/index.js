/**
 * The database boundary. Application code imports `@chestha/db`, never
 * `@prisma/client` directly: the generated client's location depends on where
 * `prisma generate` ran, and routing every import through this package keeps
 * that detail in one place.
 *
 * `./password.js` is a separate entry point because it pulls in `node:crypto`
 * and must never be reachable from code that might be bundled for a browser.
 */
export { prisma } from './client.js';
export { Prisma } from '@prisma/client';
