import { prisma } from '../src/prisma';

async function main() {
  const version = 'v1';
  const effectiveDate = new Date('2026-07-31T00:00:00.000Z');
  const sections = [
    {
      key: 'rates-and-charges',
      heading: 'Rates and Charges',
      items: [
        '£18.50 per hour, per person, plus VAT: one rate across waiting staff, bar staff, kitchen porters, runners and hosts',
        '4-hour minimum charge per person, per booking',
        'Overruns beyond the confirmed end time are billed in 30-minute blocks',
        'Senior roles (supervisors, chefs, event managers) are quoted and agreed individually before booking',
        "No booking fees, uniform charges or other surcharges beyond what's set out here",
      ],
    },
    {
      key: 'changes-and-cancellation',
      heading: 'Changes and Cancellation',
      items: [
        'More than 48 hours before the booking starts: no charge',
        'Between 24 and 48 hours before: 50% of the confirmed booking charge',
        'Less than 12 hours before: full confirmed booking charge',
      ],
      note: "These tiers apply to the booking as a whole. If you need to reduce staff numbers rather than cancel entirely, tell us as early as possible and we'll agree a fair adjustment.",
    },
    {
      key: 'payment',
      heading: 'Payment',
      items: [] as string[],
      note: "Invoices are payable within 14 days of the invoice date. For a client's first booking with us, payment is required in advance of the event.",
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
