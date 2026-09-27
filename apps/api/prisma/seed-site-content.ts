import { prisma } from '../src/prisma';
import { seedSiteContent } from '../src/site/seed';

/**
 * Copies the public site's content into the database, word for word. Safe to
 * run twice, and never overwrites what the admin has edited: see
 * src/site/seed.ts. The admin's Site content page has the same import button.
 *
 *   npm run seed:site
 */
seedSiteContent()
  .then((counts) => console.log('Site content seeded:', counts))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
