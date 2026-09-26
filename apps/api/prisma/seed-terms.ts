import { prisma } from '../src/prisma';
import { PRICING, SITE_TERMS, formatRate } from '../src/config/pricing';

async function main() {
  // The API serves the most recently published version, and a booking records
  // the version it was confirmed under, so changing the terms means a new
  // version rather than an edit to the old one.
  //
  // Built from config/pricing.ts, the same source as the public /terms page,
  // so a booking's recorded terms can't say something the page doesn't.
  const version = 'v5';
  const effectiveDate = new Date('2026-09-26T00:00:00.000Z');
  const sections = [
    {
      key: 'rates-and-charges',
      heading: 'Rates and charges',
      items: [
        `Standard: ${formatRate(PRICING.standardRate)} per hour, per person, for waiting staff, bar staff, kitchen porters, runners, and hosts and front of house`,
        ...(PRICING.premiumEnabled
          ? [`Premium: ${formatRate(PRICING.premiumRate)} per hour, per person. ${SITE_TERMS.premiumDefinition}`]
          : []),
        `${PRICING.minimumChargeHours}-hour minimum charge per person, per booking`,
        `Time beyond the confirmed end is billed in ${PRICING.overrunBlockMinutes}-minute blocks`,
        `Hours worked after midnight are charged at +${Math.round((PRICING.afterMidnightMultiplier - 1) * 100)}%`,
        'Chefs, cooks, managers and supervisors are quoted and agreed individually before booking',
        'There are no booking fees or uniform charges',
      ],
    },
    {
      key: 'changes-and-cancellation',
      heading: 'Changes and cancellation',
      items: [SITE_TERMS.cancellation],
      note: "These tiers apply to the booking as a whole. If you need to reduce staff numbers rather than cancel entirely, tell us as early as possible and we'll agree a fair adjustment.",
    },
    {
      key: 'payment',
      heading: 'Payment',
      items: [] as string[],
      note: SITE_TERMS.paymentTerms,
    },
  ];

  await prisma.termsVersion.upsert({
    where: { version },
    update: { effectiveDate, sections, publishedAt: new Date() },
    create: { version, effectiveDate, publishedAt: new Date(), sections },
  });

  console.log(`Seeded/updated TermsVersion ${version}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
