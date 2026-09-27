import { prisma } from '../prisma';
import { defaultFaqs, defaultPhotos, defaultPromos, defaultRecentWork, defaultTestimonials } from './defaults';
import { defaultSettings, SETTING_KEYS } from './settings';
import { SEEDED_MARKER } from './store';

/**
 * Copies the public site's content into the database, word for word, from
 * site/defaults.ts (the pages as they stood at the move). Used by
 * prisma/seed-site-content.ts and by the admin's "Import" button.
 *
 * Safe to run more than once, and on a database the admin has already edited:
 *   - a setting is written only if its row doesn't exist;
 *   - reviews, recent work and photos are written only into an empty table;
 *   - a page's FAQs are written only if that page has none;
 *   - a seasonal promo is written only if its key doesn't exist.
 * Then it sets the "contentSeeded" marker, which is what switches the live
 * site from its built-in defaults to the database.
 */
export async function seedSiteContent(who = 'seed-site-content') {
  const settings = defaultSettings();
  for (const key of SETTING_KEYS) {
    await prisma.siteSetting.upsert({ where: { key }, create: { key, value: settings[key] }, update: {} });
  }

  if ((await prisma.testimonial.count()) === 0) {
    await prisma.testimonial.createMany({ data: defaultTestimonials().map((t, order) => ({ ...t, order })) });
  }
  if ((await prisma.recentWork.count()) === 0) {
    await prisma.recentWork.createMany({ data: defaultRecentWork().map((w, order) => ({ ...w, order })) });
  }
  if ((await prisma.galleryPhoto.count()) === 0) {
    const photos = defaultPhotos();
    if (photos.length) await prisma.galleryPhoto.createMany({ data: photos.map((p, order) => ({ ...p, order })) });
  }
  for (const [pageKey, items] of Object.entries(defaultFaqs())) {
    if ((await prisma.faq.count({ where: { pageKey } })) > 0) continue;
    await prisma.faq.createMany({ data: items.map((f, order) => ({ pageKey, question: f.question, answer: f.answer, order })) });
  }
  for (const promo of defaultPromos()) {
    await prisma.seasonalPromo.upsert({ where: { key: promo.key }, create: promo, update: {} });
  }

  await prisma.siteSetting.upsert({
    where: { key: SEEDED_MARKER },
    create: { key: SEEDED_MARKER, value: { at: new Date().toISOString() } },
    update: {},
  });
  await prisma.contentChange.create({ data: { who, what: 'Imported the site content from the pages' } });

  return {
    settings: await prisma.siteSetting.count(),
    testimonials: await prisma.testimonial.count(),
    recentWork: await prisma.recentWork.count(),
    photos: await prisma.galleryPhoto.count(),
    faqs: await prisma.faq.count(),
    promos: await prisma.seasonalPromo.count(),
  };
}
