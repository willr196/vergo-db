import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { adminAuth } from '../middleware/adminAuth';
import { SETTING_KEYS, SETTING_SCHEMAS, SettingKey, defaultSettings, parseSettings } from '../site/settings';
import { refreshContent, siteContent, SEEDED_MARKER } from '../site/store';
import { seedSiteContent } from '../site/seed';
import { LIMITS, checkLength } from '../site/limits';
import { londonDay, londonDayEnd } from '../site/defaults';
import { mediaStorage, storePhoto } from '../site/media';
import { seasonState } from '../site/view';
import { purgeCdn } from '../site/cdn';

/**
 * Admin "Site content": the settings, reviews, recent work, photos, FAQs and
 * seasonal promos the public pages are built from. Behind the admin session
 * and CSRF (adminAuth).
 *
 * Every save: validates (zod, plus the length limits in site/limits.ts),
 * writes a ContentChange row, reloads the site's in-memory copy (which clears
 * the rendered-page caches), and purges the CDN.
 */
const router = Router();
router.use(adminAuth);

const FAQ_PAGES = [
  'hire/waiting-staff',
  'hire/bar-staff',
  'hire/kitchen-porters',
  'hire/weddings',
  'hire/production-catering',
  'work',
  'special-events/christmas',
  'special-events/halloween',
];

class ContentError extends Error {
  constructor(message: string, public status = 400, public problems: string[] = []) {
    super(message);
  }
}

function who(req: Request): string {
  return req.session?.username || 'admin';
}

/** After a write: log it, reload what the site serves, purge the CDN. */
async function saved(req: Request, what: string, detail?: unknown) {
  await prisma.contentChange.create({
    data: { who: who(req), what, detail: detail === undefined ? undefined : (detail as Prisma.InputJsonValue) },
  });
  await refreshContent();
  await purgeCdn();
}

/** Writes are refused until the import has run: before it, the site ignores the database. */
async function requireSeeded() {
  const marker = await prisma.siteSetting.findUnique({ where: { key: SEEDED_MARKER } });
  if (!marker) throw new ContentError('Import the site content first (the button at the top of the page).', 409);
}

function lengthCheck(kind: Parameters<typeof checkLength>[0], text: string) {
  const problems = checkLength(kind, text);
  if (problems.length) throw new ContentError(problems.join(' '), 400, problems);
}

const handle =
  (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch((err) => {
      if (err instanceof ContentError) return res.status(err.status).json({ ok: false, error: err.message, problems: err.problems });
      if (err instanceof z.ZodError) {
        return res.status(400).json({ ok: false, error: err.issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`).join('; ') });
      }
      if (err && typeof err === 'object' && 'status' in err && typeof (err as any).status === 'number') {
        return res.status((err as any).status).json({ ok: false, error: (err as Error).message });
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return res.status(404).json({ ok: false, error: 'Not found' });
      }
      next(err);
    });

const id = z.object({ id: z.string().min(1).max(191) });
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalUrl = z.union([z.literal(''), z.string().trim().url().max(500)]).optional().nullable();
/** A local page path or an absolute https URL, for links on promos. */
const href = z.string().trim().max(200).regex(/^(\/[^\s]*|https:\/\/[^\s]+)$/, 'must be a page path like /special-events/halloween');
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date');

function startOf(d: string): Date {
  const [y, m, day] = d.split('-').map(Number);
  return londonDay(y, m, day);
}
function endOf(d: string): Date {
  const [y, m, day] = d.split('-').map(Number);
  return londonDayEnd(y, m, day);
}
function toYmd(date: Date | null): string | null {
  if (!date) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(date);
}

/* --------------------------------------------------------------- overview */

router.get(
  '/',
  handle(async (_req, res) => {
    const [settingRows, testimonials, recentWork, photos, faqs, promos, changes] = await Promise.all([
      prisma.siteSetting.findMany(),
      prisma.testimonial.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }),
      prisma.recentWork.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }),
      prisma.galleryPhoto.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }),
      prisma.faq.findMany({ orderBy: [{ pageKey: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }] }),
      prisma.seasonalPromo.findMany({ orderBy: { startsAt: 'asc' } }),
      prisma.contentChange.findMany({ orderBy: { when: 'desc' }, take: 30 }),
    ]);
    const seeded = settingRows.some((r) => r.key === SEEDED_MARKER);
    const live = seasonState();
    const now = Date.now();
    res.json({
      ok: true,
      seeded,
      serving: siteContent().source,
      /** What the header shows right now, from whatever the site is serving. */
      headerNow: live.header ? live.header.navLabel : null,
      loadedAt: siteContent().loadedAt,
      limits: LIMITS,
      photoStorage: mediaStorage(),
      settings: seeded ? parseSettings(settingRows) : defaultSettings(),
      testimonials,
      recentWork,
      photos,
      faqPages: FAQ_PAGES,
      faqs,
      promos: promos.map((p) => ({
        ...p,
        startsOn: toYmd(p.startsAt),
        endsOn: toYmd(p.endsAt),
        navStartsOn: toYmd(p.navStartsAt),
        navEndsOn: toYmd(p.navEndsAt),
        bannerLive: p.published && p.startsAt.getTime() <= now && now <= p.endsAt.getTime(),
        headerLive: live.header?.key === p.key,
      })),
      changes,
    });
  }),
);

router.post(
  '/import',
  handle(async (req, res) => {
    const counts = await seedSiteContent(who(req));
    await refreshContent();
    await purgeCdn();
    res.json({ ok: true, counts });
  }),
);

/* --------------------------------------------------------------- settings */

router.put(
  '/settings/:key',
  handle(async (req, res) => {
    await requireSeeded();
    const key = z.enum(SETTING_KEYS as [SettingKey, ...SettingKey[]]).parse(req.params.key);
    const value = SETTING_SCHEMAS[key].parse(req.body);
    const before = await prisma.siteSetting.findUnique({ where: { key } });
    await prisma.siteSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    await saved(req, `Updated ${key}`, { before: before?.value ?? null, after: value });
    res.json({ ok: true, value });
  }),
);

/* ------------------------------------------------------------ collections */

const reorder = z.object({ ids: z.array(z.string().min(1).max(191)).min(1).max(200) });

const testimonialBody = z.object({
  quote: text(1000),
  name: text(120),
  context: text(120),
  source: z.enum(['google', 'direct']).default('direct'),
  url: optionalUrl,
  stars: z.number().int().min(1).max(5).optional().nullable(),
  showOnHome: z.boolean().default(false),
  showOnHire: z.boolean().default(true),
  published: z.boolean().default(true),
});

router.post(
  '/testimonials',
  handle(async (req, res) => {
    await requireSeeded();
    const data = testimonialBody.parse(req.body);
    lengthCheck('review', data.quote);
    const order = (await prisma.testimonial.count()) + 1;
    const row = await prisma.testimonial.create({ data: { ...data, url: data.url || null, order } });
    await saved(req, `Added a review from ${row.name}`);
    res.status(201).json({ ok: true, item: row });
  }),
);

router.put(
  '/testimonials/:id',
  handle(async (req, res) => {
    await requireSeeded();
    const { id: rowId } = id.parse(req.params);
    const data = testimonialBody.parse(req.body);
    lengthCheck('review', data.quote);
    const row = await prisma.testimonial.update({ where: { id: rowId }, data: { ...data, url: data.url || null } });
    await saved(req, `Edited the review from ${row.name}`);
    res.json({ ok: true, item: row });
  }),
);

const recentWorkBody = z.object({ title: text(200), detail: text(500), published: z.boolean().default(true) });

router.post(
  '/recent-work',
  handle(async (req, res) => {
    await requireSeeded();
    const data = recentWorkBody.parse(req.body);
    lengthCheck('recentWork', `${data.title} ${data.detail}`);
    const order = (await prisma.recentWork.count()) + 1;
    const row = await prisma.recentWork.create({ data: { ...data, order } });
    await saved(req, `Added recent work: ${row.title}`);
    res.status(201).json({ ok: true, item: row });
  }),
);

router.put(
  '/recent-work/:id',
  handle(async (req, res) => {
    await requireSeeded();
    const { id: rowId } = id.parse(req.params);
    const data = recentWorkBody.parse(req.body);
    lengthCheck('recentWork', `${data.title} ${data.detail}`);
    const row = await prisma.recentWork.update({ where: { id: rowId }, data });
    await saved(req, `Edited recent work: ${row.title}`);
    res.json({ ok: true, item: row });
  }),
);

const faqBody = z.object({
  pageKey: z.enum(FAQ_PAGES as [string, ...string[]]),
  question: text(300),
  answer: text(1000),
  published: z.boolean().default(true),
});

router.post(
  '/faqs',
  handle(async (req, res) => {
    await requireSeeded();
    const data = faqBody.parse(req.body);
    lengthCheck('faqAnswer', data.answer);
    const order = (await prisma.faq.count({ where: { pageKey: data.pageKey } })) + 1;
    const row = await prisma.faq.create({ data: { ...data, order } });
    await saved(req, `Added an FAQ to ${row.pageKey}: ${row.question}`);
    res.status(201).json({ ok: true, item: row });
  }),
);

router.put(
  '/faqs/:id',
  handle(async (req, res) => {
    await requireSeeded();
    const { id: rowId } = id.parse(req.params);
    const data = faqBody.parse(req.body);
    lengthCheck('faqAnswer', data.answer);
    const row = await prisma.faq.update({ where: { id: rowId }, data });
    await saved(req, `Edited an FAQ on ${row.pageKey}: ${row.question}`);
    res.json({ ok: true, item: row });
  }),
);

const homeLine = z.union([
  text(200),
  z.object({ label: text(120), price: text(40) }).strict(),
]);

const promoBody = z
  .object({
    key: z.string().trim().regex(/^[a-z0-9-]{2,50}$/, 'lowercase letters, numbers and dashes'),
    navLabel: text(40),
    bannerText: text(120),
    href,
    homeHeading: text(200),
    homeLines: z.array(homeLine).max(8),
    homeCtaLabel: z.string().trim().max(80).optional().nullable(),
    homeCtaHref: z.union([z.literal(''), href]).optional().nullable(),
    startsOn: ymd,
    endsOn: ymd,
    navStartsOn: z.union([z.literal(''), ymd]).optional().nullable(),
    navEndsOn: z.union([z.literal(''), ymd]).optional().nullable(),
    published: z.boolean().default(true),
  })
  .refine((p) => p.startsOn <= p.endsOn, { message: 'must end on or after the day it starts', path: ['endsOn'] })
  .refine((p) => !p.navStartsOn || !p.navEndsOn || p.navStartsOn <= p.navEndsOn, {
    message: 'must end on or after the day it starts',
    path: ['navEndsOn'],
  });

function promoData(p: z.infer<typeof promoBody>) {
  return {
    key: p.key,
    navLabel: p.navLabel,
    bannerText: p.bannerText,
    href: p.href,
    homeHeading: p.homeHeading,
    homeLines: p.homeLines,
    homeCtaLabel: p.homeCtaLabel || null,
    homeCtaHref: p.homeCtaHref || null,
    startsAt: startOf(p.startsOn),
    endsAt: endOf(p.endsOn),
    navStartsAt: p.navStartsOn ? startOf(p.navStartsOn) : null,
    navEndsAt: p.navEndsOn ? endOf(p.navEndsOn) : null,
    published: p.published,
  };
}

router.post(
  '/promos',
  handle(async (req, res) => {
    await requireSeeded();
    const p = promoBody.parse(req.body);
    lengthCheck('banner', p.bannerText);
    const row = await prisma.seasonalPromo.create({ data: promoData(p) });
    await saved(req, `Added the ${row.key} promo`);
    res.status(201).json({ ok: true, item: row });
  }),
);

router.put(
  '/promos/:id',
  handle(async (req, res) => {
    await requireSeeded();
    const { id: rowId } = id.parse(req.params);
    const p = promoBody.parse(req.body);
    lengthCheck('banner', p.bannerText);
    const row = await prisma.seasonalPromo.update({ where: { id: rowId }, data: promoData(p) });
    await saved(req, `Edited the ${row.key} promo`);
    res.json({ ok: true, item: row });
  }),
);

/* ----------------------------------------------------------------- photos */

const photoBody = z.object({
  alt: text(300),
  caption: z.string().trim().max(300).optional().nullable(),
  tags: z.array(z.string().trim().regex(/^[a-z0-9-]{2,40}$/)).max(10).default([]),
  published: z.boolean().default(true),
});

router.post(
  '/photos',
  handle(async (req, res) => {
    await requireSeeded();
    const body = photoBody.extend({ contentBase64: z.string().min(1) }).parse(req.body);
    const raw = body.contentBase64.replace(/^data:[^;]+;base64,/, '');
    const stored = await storePhoto(Buffer.from(raw, 'base64'));
    const order = (await prisma.galleryPhoto.count()) + 1;
    const row = await prisma.galleryPhoto.create({
      data: { ...stored, alt: body.alt, caption: body.caption || null, tags: body.tags, published: body.published, order },
    });
    await saved(req, `Added a photo: ${row.alt}`);
    res.status(201).json({ ok: true, item: row });
  }),
);

router.put(
  '/photos/:id',
  handle(async (req, res) => {
    await requireSeeded();
    const { id: rowId } = id.parse(req.params);
    const data = photoBody.parse(req.body);
    const row = await prisma.galleryPhoto.update({ where: { id: rowId }, data: { ...data, caption: data.caption || null } });
    await saved(req, `Edited a photo: ${row.alt}`);
    res.json({ ok: true, item: row });
  }),
);

/* ------------------------------------------------- delete and reorder, all */

const MODELS = {
  testimonials: { model: () => prisma.testimonial, label: 'a review' },
  'recent-work': { model: () => prisma.recentWork, label: 'recent work' },
  faqs: { model: () => prisma.faq, label: 'an FAQ' },
  photos: { model: () => prisma.galleryPhoto, label: 'a photo' },
  promos: { model: () => prisma.seasonalPromo, label: 'a promo' },
} as const;
type Collection = keyof typeof MODELS;
const collection = z.enum(Object.keys(MODELS) as [Collection, ...Collection[]]);

router.delete(
  '/:collection/:id',
  handle(async (req, res) => {
    await requireSeeded();
    const which = collection.parse(req.params.collection);
    const { id: rowId } = id.parse({ id: req.params.id });
    const deleted = await (MODELS[which].model() as any).delete({ where: { id: rowId } });
    await saved(req, `Deleted ${MODELS[which].label}`, deleted);
    res.json({ ok: true });
  }),
);

router.post(
  '/:collection/reorder',
  handle(async (req, res) => {
    await requireSeeded();
    const which = collection.parse(req.params.collection);
    if (which === 'promos') throw new ContentError('Promos are ordered by their dates.');
    const { ids } = reorder.parse(req.body);
    const model = MODELS[which].model() as any;
    await prisma.$transaction(ids.map((rowId, order) => model.update({ where: { id: rowId }, data: { order } })));
    await saved(req, `Reordered ${which}`);
    res.json({ ok: true });
  }),
);

export default router;
