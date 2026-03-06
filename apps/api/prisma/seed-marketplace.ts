import { prisma } from '../src/prisma';

const PRICING_MATRIX = [
  { clientTier: 'STANDARD', staffTier: 'STANDARD', hourlyRate: '20.00', staffPayRate: '12.50', isBookable: true },
  { clientTier: 'STANDARD', staffTier: 'ELITE', hourlyRate: '28.00', staffPayRate: '18.00', isBookable: false },
  { clientTier: 'PREMIUM', staffTier: 'STANDARD', hourlyRate: '17.00', staffPayRate: '12.50', isBookable: true },
  { clientTier: 'PREMIUM', staffTier: 'ELITE', hourlyRate: '28.00', staffPayRate: '18.00', isBookable: true },
] as const;

const SUBSCRIPTION_PLANS = [
  {
    tier: 'STANDARD',
    name: 'Standard',
    weeklyPrice: '0.00',
    monthlyPrice: '0.00',
    annualPrice: '0.00',
    features: JSON.stringify([
      'Browse all staff profiles',
      'Book Standard staff',
      'Quote requests',
      'VERGO quality guarantee',
    ]),
    isActive: true,
  },
  {
    tier: 'PREMIUM',
    name: 'Premium',
    weeklyPrice: '0.00',
    monthlyPrice: '0.00',
    annualPrice: '0.00',
    features: JSON.stringify([
      'Everything in Standard',
      'Book Elite staff (film/TV experienced)',
      '~15% discounted rates',
      'Priority booking confirmation',
      'Dedicated account support',
      'Launch phase: manual onboarding / waitlist access',
    ]),
    isActive: false,
  },
] as const;

async function seedPricingTier() {
  for (const row of PRICING_MATRIX) {
    await prisma.pricingTier.upsert({
      where: {
        clientTier_staffTier: {
          clientTier: row.clientTier,
          staffTier: row.staffTier,
        },
      },
      update: {
        hourlyRate: row.hourlyRate,
        staffPayRate: row.staffPayRate,
        isBookable: row.isBookable,
      },
      create: {
        clientTier: row.clientTier,
        staffTier: row.staffTier,
        hourlyRate: row.hourlyRate,
        staffPayRate: row.staffPayRate,
        isBookable: row.isBookable,
      },
    });
  }
}

async function seedSubscriptionPlan() {
  for (const plan of SUBSCRIPTION_PLANS) {
    await prisma.subscriptionPlan.upsert({
      where: { tier: plan.tier },
      update: {
        name: plan.name,
        weeklyPrice: plan.weeklyPrice,
        monthlyPrice: plan.monthlyPrice,
        annualPrice: plan.annualPrice,
        features: plan.features,
        isActive: plan.isActive,
      },
      create: {
        tier: plan.tier,
        name: plan.name,
        weeklyPrice: plan.weeklyPrice,
        monthlyPrice: plan.monthlyPrice,
        annualPrice: plan.annualPrice,
        features: plan.features,
        isActive: plan.isActive,
      },
    });
  }
}

async function main() {
  await seedPricingTier();
  console.log(`✅ PricingTier seeded (${PRICING_MATRIX.length} rows).`);

  await seedSubscriptionPlan();
  console.log(`✅ SubscriptionPlan seeded (${SUBSCRIPTION_PLANS.length} rows).`);
}

main()
  .catch((error) => {
    console.error('\n❌ Error seeding marketplace data:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
