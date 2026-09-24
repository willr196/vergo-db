import { prisma } from '../src/prisma';

async function main() {
  // The API serves the most recently published version, and a booking records
  // the version it was confirmed under, so changing the terms means a new
  // version rather than an edit to the old one.
  const version = 'v3';
  const effectiveDate = new Date('2026-09-24T00:00:00.000Z');
  const sections = [
    {
      key: 'rates-and-charges',
      heading: 'Rates and Charges',
      items: [
        '£18 per hour, per person, for waiting staff, bar staff, kitchen porters, runners and hosts. Rates are confirmed on your quote',
        'VERGO LTD is not VAT registered, so no VAT is charged',
        '4-hour minimum charge per person, per booking',
        'Overruns beyond the confirmed end time are billed in 30-minute blocks',
        'Hours worked after midnight are charged at +25%',
        'Supervisors, chefs, event managers, performers, makeup artists and themed roles are quoted separately and agreed in writing before booking',
        'No booking fees, uniform charges or other extras beyond what is set out here',
      ],
    },
    {
      key: 'changes-and-cancellation',
      heading: 'Changes and Cancellation',
      items: [
        'More than 48 hours before the booking starts: no charge',
        'Inside 48 hours: 10% of the confirmed booking value',
        'Inside 24 hours: 25% of the confirmed booking value',
      ],
      note: "These bands apply to the booking as a whole. If you need to reduce staff numbers rather than cancel entirely, tell VERGO as early as possible and a fair adjustment will be agreed.",
    },
    {
      key: 'payment',
      heading: 'Payment',
      items: [] as string[],
      note: 'VERGO invoices after the booking. Invoices are payable within 14 days of the invoice date.',
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
