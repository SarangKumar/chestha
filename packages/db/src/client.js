import { PrismaClient } from '@prisma/client';

/**
 * One client per process.
 *
 * Next's dev server re-evaluates modules on every change, and a fresh
 * PrismaClient per evaluation exhausts the database's connection pool within a
 * few saves — so outside production the instance is parked on `globalThis` and
 * reused. In production the module is evaluated once and the global is not
 * used at all.
 */
const globalForPrisma = globalThis;

export const prisma = globalForPrisma.__chesthaPrisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__chesthaPrisma = prisma;
}
