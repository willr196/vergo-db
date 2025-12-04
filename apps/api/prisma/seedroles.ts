import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ROLES = [
  'Bartender',
  'Waiter',
  'Waitress',
  'Chef',
  'Kitchen Porter',
  'Front of House',
  'Event Manager',
  'Bar Back',
  'Runner',
  'Host',
  'Hostess',
  'Sommelier',
  'Barista',
  'Catering Assistant',
  'Cloakroom Attendant'
];

async function seedRoles() {
  console.log('🌱 Seeding roles...');
  
  for (const name of ROLES) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name }
    });
    console.log(`  ✓ ${name}`);
  }
  
  console.log(`\n✅ ${ROLES.length} roles seeded`);
}

seedRoles()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());