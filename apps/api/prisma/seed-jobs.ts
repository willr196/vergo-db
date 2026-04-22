import { PrismaClient, JobType, JobStatus, PayType } from '@prisma/client';

const prisma = new PrismaClient();

const REGISTER_INTEREST_JOBS = [
  {
    title: 'Bartender — Register Interest',
    roleName: 'Bartender',
    description: "We're always looking for experienced Bartender staff for events across London. Register your interest and we'll be in touch when the right shift comes up.",
  },
  {
    title: 'Barista — Register Interest',
    roleName: 'Barista',
    description: "We're always looking for experienced Barista staff for events across London. Register your interest and we'll be in touch when the right shift comes up.",
  },
  {
    title: 'Front of House — Register Interest',
    roleName: 'Front of House',
    description: "We're always looking for experienced Front of House staff for events across London. Register your interest and we'll be in touch when the right shift comes up.",
  },
  {
    title: 'Waiter — Register Interest',
    roleName: 'Waiter',
    description: "We're always looking for experienced Waiter staff for events across London. Register your interest and we'll be in touch when the right shift comes up.",
  },
  {
    title: 'Chef — Register Interest',
    roleName: 'Chef',
    description: "We're always looking for experienced Chef staff for events across London. Register your interest and we'll be in touch when the right shift comes up.",
  },
  {
    title: 'Kitchen Porter — Register Interest',
    roleName: 'Kitchen Porter',
    description: "We're always looking for experienced Kitchen Porter staff for events across London. Register your interest and we'll be in touch when the right shift comes up.",
  },
  {
    title: 'Runner — Register Interest',
    roleName: 'Runner',
    description: "We're always looking for experienced Runner staff for events across London. Register your interest and we'll be in touch when the right shift comes up.",
  },
];

async function seedJobs() {
  console.log('🌱 Seeding register-interest job listings...');

  for (const jobData of REGISTER_INTEREST_JOBS) {
    // Ensure the role exists
    const role = await prisma.role.upsert({
      where: { name: jobData.roleName },
      update: {},
      create: { name: jobData.roleName },
    });

    // Upsert the job (match on title to avoid duplicates)
    const existing = await prisma.job.findFirst({
      where: { title: jobData.title },
    });

    if (existing) {
      await prisma.job.update({
        where: { id: existing.id },
        data: {
          description: jobData.description,
          type: JobType.INTERNAL,
          status: JobStatus.OPEN,
          location: 'London',
          payRate: null,
          closingDate: null,
          roleId: role.id,
          publishedAt: existing.publishedAt ?? new Date(),
        },
      });
      console.log(`  ↻ Updated: ${jobData.title}`);
    } else {
      await prisma.job.create({
        data: {
          title: jobData.title,
          description: jobData.description,
          type: JobType.INTERNAL,
          status: JobStatus.OPEN,
          location: 'London',
          payRate: null,
          payType: PayType.HOURLY,
          closingDate: null,
          publishedAt: new Date(),
          roleId: role.id,
        },
      });
      console.log(`  ✓ Created: ${jobData.title}`);
    }
  }

  console.log(`\n✅ ${REGISTER_INTEREST_JOBS.length} register-interest listings seeded`);
}

seedJobs()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
