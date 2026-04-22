import { prisma } from '../src/prisma';

async function main() {
  console.log('🗑️  Starting database reset...\n');

  await prisma.$transaction(async (tx) => {
    // Leaf tables first (FK dependencies)
    await tx.emailEvent.deleteMany();
    await tx.email.deleteMany();
    await tx.emailPreferences.deleteMany();
    await tx.scheduledEmail.deleteMany();
    await tx.savedJob.deleteMany();
    await tx.jobApplication.deleteMany();
    await tx.booking.deleteMany();
    await tx.quoteRequest.deleteMany();
    await tx.job.deleteMany();
    await tx.refreshToken.deleteMany();
    await tx.pushToken.deleteMany();
    await tx.applicationRole.deleteMany();
    await tx.application.deleteMany();
    await tx.fileUploadVerification.deleteMany();
    await tx.contact.deleteMany();
    await tx.user.deleteMany();
    await tx.client.deleteMany();
    await tx.applicant.deleteMany();
  });

  const adminCount = await prisma.adminUser.count();
  const roleCount = await prisma.role.count();
  const pricingCount = await prisma.pricingTier.count();
  const planCount = await prisma.subscriptionPlan.count();

  console.log('✅ Reset complete. Preserved:');
  console.log(`   AdminUser:        ${adminCount} record(s)`);
  console.log(`   Role:             ${roleCount} record(s)`);
  console.log(`   PricingTier:      ${pricingCount} record(s)`);
  console.log(`   SubscriptionPlan: ${planCount} record(s)`);
}

main()
  .catch((e) => {
    console.error('❌ Reset failed:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
