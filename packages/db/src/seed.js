import { SEED_CATEGORIES } from '@chestha/core';
import { prisma } from './client.js';

/**
 * Seeds the curated category taxonomy. Idempotent: categories are upserted by
 * slug, so running this on a populated database refreshes names and ordering
 * without touching the posts that reference them — and without resurrecting a
 * category the owner deliberately deleted, since only the seed slugs are
 * touched.
 */
async function main() {
  let created = 0;
  let updated = 0;

  for (const [index, category] of SEED_CATEGORIES.entries()) {
    const existing = await prisma.category.findUnique({ where: { slug: category.slug } });
    await prisma.category.upsert({
      where: { slug: category.slug },
      create: { ...category, order: index },
      // `order` is intentionally not overwritten: the owner may have reordered
      // the list, and that is a product decision, not drift to be corrected.
      update: { name: category.name, blurb: category.blurb },
    });
    if (existing) updated += 1;
    else created += 1;
  }

  console.log(`Categories: ${created} created, ${updated} refreshed.`);
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
