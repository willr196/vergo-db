import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { adminAuth } from '../middleware/adminAuth';
import { SETTING_KEYS, SETTING_SCHEMAS, SettingKey, defaultSettings, parseSettings } from '../site/settings';
import path from 'node:path';
import { faqsByPage, promoContents, refreshContent, siteContent, withContent, SEEDED_MARKER, SiteContent } from '../site/store';
import { renderView, seasonState, viewRouteFor, withPageScriptHashes } from '../site/view';
import { versionAssetUrls } from '../lib/publicHtml';
import { seedSiteContent } from '../site/seed';
import { LIMITS, checkLength } from '../site/limits';
import { londonDay, londonDayEnd } from '../site/defaults';
import { mediaStorage, storePhoto } from '../site/media';
import { purgeCdn } from '../site/cdn';
import { ChangeDetail, RevertError, Table, isRevertible, orderField, revertChange, snapshot } from '../site/history';
import { coreProblems, isCoreKey, rateBody } from '../site/rates';

/**
 * Admin "Site content": the settings, the rate card, reviews, recent work, photos, FAQs and
 * seasonal promos the public pages are built from. Behind the admin session
 * and CSRF (adminAuth).
 *
 * Every save: validates (zod, plus the length limits in site/limits.ts),
 * writes a ContentChange row with what it replaced (site/history.ts, so the
 * History tab can revert it), reloads the site's in-memory copy (which clears
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
  'hire/corporate-events',
  'hire/cleaners',
  'hire/security',
  'hire/front-of-house',
  'hire/event-chefs',
  'hire/private-parties',
  'work',
  'special-events/christmas',
  'special-events/new-years-eve',
];

class ContentError extends Error {
  constructor(message: string, public status = 400, public problems: string[] = []) {
    super(message);
  }
}

function who(req: Request): string {
  return req.session?.username || 'admin';
}

/** One record's change, for the history. Settings keep their value; rows a snapshot. */
function rowChange(table: Table, id: string, before: unknown, after: unknown): ChangeDetail {
  const keep = (v: unknown) => (table === 'SiteSetting' ? v ?? null : snapshot(v));
  return { kind: 'row', table, id, before: keep(before), after: keep(after) };
}

/** After a write: log it, reload what the site serves, purge the CDN. */
async function saved(req: Request, what: string, detail?: ChangeDetail) {
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
      if (err instanceof RevertError) return res.status(err.status).json({ ok: false, error: err.message });
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
const href = z.string().trim().max(200).regex(/^(\/[^\s]*|https:\/\/[^\s]+)$/, 'must be a page path like /special-events/christmas');
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
    const [settingRows, rates, testimonials, recentWork, photos, faqs, promos, changes, drafts] = await Promise.all([
      prisma.siteSetting.findMany(),
      prisma.rate.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      prisma.testimonial.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }),
      prisma.recentWork.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }),
      prisma.galleryPhoto.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }),
      prisma.faq.findMany({ orderBy: [{ pageKey: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }] }),
      prisma.seasonalPromo.findMany({ orderBy: { startsAt: 'asc' } }),
      prisma.contentChange.findMany({ orderBy: { when: 'desc' }, take: 30 }),
      prisma.contentDraft.findMany({ orderBy: { createdAt: 'asc' } }),
    ]);
    const revertedIds = new Set(
      changes.map((c) => (isRevertible(c.detail) ? c.detail.revertOf : undefined)).filter((v): v is string => Boolean(v)),
    );
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
      rates: rates.map((r) => ({ ...r, core: isCoreKey(r.key) })),
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
        pageUntilOn: toYmd(p.pageUntil),
        pageInSeason: p.published && now <= (p.pageUntil || p.endsAt).getTime(),
        bannerLive: p.published && p.startsAt.getTime() <= now && now <= p.endsAt.getTime(),
        headerLive: live.header?.key === p.key,
      })),
      drafts,
      changes: changes.map((c) => ({
        id: c.id,
        who: c.who,
        what: c.what,
        when: c.when,
        revertible: isRevertible(c.detail) && !revertedIds.has(c.id),
        reverted: revertedIds.has(c.id),
      })),
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
    await saved(req, `Updated ${key}`, rowChange('SiteSetting', key, before?.value ?? null, value));
    res.json({ ok: true, value });
  }),
);

/* -------------------------------------------------------------- rate card */
// Money in whole pence. The core rates (site/rates.ts) feed every page and the
// quote form, so they stay hourly, public and active; their amounts change.

router.post(
  '/rates',
  handle(async (req, res) => {
    await requireSeeded();
    const data = rateBody.parse(req.body);
    if (isCoreKey(data.key) || (await prisma.rate.findUnique({ where: { key: data.key } }))) {
      throw new ContentError(`There's already a rate with the key "${data.key}".`, 409);
    }
    const sortOrder = (await prisma.rate.count()) + 1;
    const row = await prisma.rate.create({ data: { ...data, amountPence: data.amountPence ?? null, sortOrder, updatedBy: who(req) } });
    await saved(req, `Added the rate ${row.label}`, rowChange('Rate', row.id, null, row));
    res.status(201).json({ ok: true, item: row });
  }),
);

router.put(
  '/rates/:id',
  handle(async (req, res) => {
    await requireSeeded();
    const { id: rowId } = id.parse(req.params);
    const data = rateBody.parse(req.body);
    const before = await prisma.rate.findUniqueOrThrow({ where: { id: rowId } });
    const problem = coreProblems(before.key, data);
    if (problem) throw new ContentError(problem);
    if (data.key !== before.key && (isCoreKey(data.key) || (await prisma.rate.findUnique({ where: { key: data.key } })))) {
      throw new ContentError(`There's already a rate with the key "${data.key}".`, 409);
    }
    const row = await prisma.rate.update({ where: { id: rowId }, data: { ...data, amountPence: data.amountPence ?? null, updatedBy: who(req) } });
    await saved(req, `Edited the rate ${row.label}`, rowChange('Rate', row.id, before, row));
    res.json({ ok: true, item: row });
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
    await saved(req, `Added a review from ${row.name}`, rowChange('Testimonial', row.id, null, row));
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
    const before = await prisma.testimonial.findUniqueOrThrow({ where: { id: rowId } });
    const row = await prisma.testimonial.update({ where: { id: rowId }, data: { ...data, url: data.url || null } });
    await saved(req, `Edited the review from ${row.name}`, rowChange('Testimonial', row.id, before, row));
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
    await saved(req, `Added recent work: ${row.title}`, rowChange('RecentWork', row.id, null, row));
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
    const before = await prisma.recentWork.findUniqueOrThrow({ where: { id: rowId } });
    const row = await prisma.recentWork.update({ where: { id: rowId }, data });
    await saved(req, `Edited recent work: ${row.title}`, rowChange('RecentWork', row.id, before, row));
    res.json({ ok: true, item: row });
  }),
);

const faqBody = z.object({
  pageKey: z.enum(FAQ_PAGES as [string, ...string[]]),
  question: text(300),
  answer: text(1000),
  published: z.boolean().default(true),
});

function parseFaq(body: unknown) {
  const data = faqBody.parse(body);
  lengthCheck('faqAnswer', data.answer);
  return data;
}

/** Saves an FAQ live: a new one (rowId null) goes last on its page. */
async function publishFaq(req: Request, rowId: string | null, body: unknown) {
  const data = parseFaq(body);
  if (!rowId) {
    const order = (await prisma.faq.count({ where: { pageKey: data.pageKey } })) + 1;
    const row = await prisma.faq.create({ data: { ...data, order } });
    await saved(req, `Added an FAQ to ${row.pageKey}: ${row.question}`, rowChange('Faq', row.id, null, row));
    return row;
  }
  const before = await prisma.faq.findUniqueOrThrow({ where: { id: rowId } });
  const row = await prisma.faq.update({ where: { id: rowId }, data });
  await saved(req, `Edited an FAQ on ${row.pageKey}: ${row.question}`, rowChange('Faq', row.id, before, row));
  return row;
}

router.post(
  '/faqs',
  handle(async (req, res) => {
    await requireSeeded();
    res.status(201).json({ ok: true, item: await publishFaq(req, null, req.body) });
  }),
);

router.put(
  '/faqs/:id',
  handle(async (req, res) => {
    await requireSeeded();
    const { id: rowId } = id.parse(req.params);
    res.json({ ok: true, item: await publishFaq(req, rowId, req.body) });
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
    pageLine: z.string().trim().max(200).optional().nullable(),
    pageUntilOn: z.union([z.literal(''), ymd]).optional().nullable(),
    published: z.boolean().default(true),
  })
  .refine((p) => p.startsOn <= p.endsOn, { message: 'must end on or after the day it starts', path: ['endsOn'] })
  .refine((p) => !p.pageUntilOn || p.startsOn <= p.pageUntilOn, { message: 'must be on or after the day it starts', path: ['pageUntilOn'] })
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
    pageLine: p.pageLine || null,
    pageUntil: p.pageUntilOn ? endOf(p.pageUntilOn) : null,
    published: p.published,
  };
}

function parsePromo(body: unknown) {
  const p = promoBody.parse(body);
  lengthCheck('banner', p.bannerText);
  return p;
}

/** Saves a promo live: new when rowId is null. */
async function publishPromo(req: Request, rowId: string | null, body: unknown) {
  const p = parsePromo(body);
  if (!rowId) {
    const row = await prisma.seasonalPromo.create({ data: promoData(p) });
    await saved(req, `Added the ${row.key} promo`, rowChange('SeasonalPromo', row.id, null, row));
    return row;
  }
  const before = await prisma.seasonalPromo.findUniqueOrThrow({ where: { id: rowId } });
  const row = await prisma.seasonalPromo.update({ where: { id: rowId }, data: promoData(p) });
  await saved(req, `Edited the ${row.key} promo`, rowChange('SeasonalPromo', row.id, before, row));
  return row;
}

router.post(
  '/promos',
  handle(async (req, res) => {
    await requireSeeded();
    res.status(201).json({ ok: true, item: await publishPromo(req, null, req.body) });
  }),
);

router.put(
  '/promos/:id',
  handle(async (req, res) => {
    await requireSeeded();
    const { id: rowId } = id.parse(req.params);
    res.json({ ok: true, item: await publishPromo(req, rowId, req.body) });
  }),
);

/* ----------------------------------------------------------------- drafts */
// FAQs and promos can be saved as a draft, previewed (GET /admin-preview, only
// for a signed-in admin) and published later. Publishing goes through the same
// publish function as Save, so it is validated, logged and revertible the same.

const DRAFTABLE = {
  faqs: { parse: parseFaq, publish: publishFaq, model: () => prisma.faq },
  promos: { parse: parsePromo, publish: publishPromo, model: () => prisma.seasonalPromo },
} as const;
type Draftable = keyof typeof DRAFTABLE;
const draftable = z.enum(Object.keys(DRAFTABLE) as [Draftable, ...Draftable[]]);
const draftBody = z.object({ rowId: z.string().min(1).max(191).nullable().optional(), data: z.unknown() });

/** One draft per record: saving again over an existing record's draft replaces it. */
router.post(
  '/drafts/:collection',
  handle(async (req, res) => {
    await requireSeeded();
    const which = draftable.parse(req.params.collection);
    const { rowId, data } = draftBody.parse(req.body);
    const parsed = DRAFTABLE[which].parse(data) as Prisma.InputJsonValue;
    if (rowId) await (DRAFTABLE[which].model() as any).findUniqueOrThrow({ where: { id: rowId } });
    const existing = rowId ? await prisma.contentDraft.findFirst({ where: { collection: which, rowId } }) : null;
    const draft = existing
      ? await prisma.contentDraft.update({ where: { id: existing.id }, data: { data: parsed, who: who(req) } })
      : await prisma.contentDraft.create({ data: { collection: which, rowId: rowId || null, data: parsed, who: who(req) } });
    res.status(existing ? 200 : 201).json({ ok: true, draft });
  }),
);

router.put(
  '/drafts/:id',
  handle(async (req, res) => {
    await requireSeeded();
    const { id: draftId } = id.parse(req.params);
    const draft = await prisma.contentDraft.findUniqueOrThrow({ where: { id: draftId } });
    const parsed = DRAFTABLE[draftable.parse(draft.collection)].parse(req.body?.data) as Prisma.InputJsonValue;
    res.json({ ok: true, draft: await prisma.contentDraft.update({ where: { id: draftId }, data: { data: parsed, who: who(req) } }) });
  }),
);

router.post(
  '/drafts/:id/publish',
  handle(async (req, res) => {
    await requireSeeded();
    const { id: draftId } = id.parse(req.params);
    const draft = await prisma.contentDraft.findUniqueOrThrow({ where: { id: draftId } });
    const item = await DRAFTABLE[draftable.parse(draft.collection)].publish(req, draft.rowId, draft.data);
    await prisma.contentDraft.delete({ where: { id: draftId } });
    res.json({ ok: true, item });
  }),
);

/** The site content with every draft laid over the published rows: what the site will show once they're all published. */
async function contentWithDrafts(): Promise<SiteContent> {
  const [faqRows, promoRows, drafts] = await Promise.all([
    prisma.faq.findMany({ orderBy: [{ pageKey: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }] }),
    prisma.seasonalPromo.findMany({ orderBy: { startsAt: 'asc' } }),
    prisma.contentDraft.findMany({ orderBy: { createdAt: 'asc' } }),
  ]);
  const lay = <T extends { id: string }>(rows: T[], rowId: string | null, fields: Partial<T>, created: T) => {
    const i = rowId ? rows.findIndex((r) => r.id === rowId) : -1;
    if (i >= 0) rows[i] = { ...rows[i], ...fields };
    else if (!rowId) rows.push(created);
  };
  for (const d of drafts) {
    const stamp = { id: d.id, createdAt: d.createdAt, updatedAt: d.updatedAt };
    if (d.collection === 'faqs') {
      const data = faqBody.parse(d.data);
      lay(faqRows, d.rowId, data, { ...stamp, ...data, order: Number.MAX_SAFE_INTEGER });
    } else if (d.collection === 'promos') {
      const data = promoData(promoBody.parse(d.data));
      lay(promoRows, d.rowId, data, { ...stamp, ...data });
    }
  }
  faqRows.sort((a, b) => a.pageKey.localeCompare(b.pageKey) || a.order - b.order);
  promoRows.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return {
    ...siteContent(),
    faqs: faqsByPage(faqRows.filter((f) => f.published)),
    promos: promoContents(promoRows.filter((p) => p.published)),
  };
}

/**
 * GET ?path=/special-events/christmas: that page as it will read with every
 * draft published. Behind the admin session like the rest of this router,
 * never cached, and marked so nobody mistakes it for the live page.
 */
router.get(
  '/preview',
  handle(async (req, res) => {
    const pagePath = z.string().regex(/^\/[a-z0-9/-]*$/).max(200).parse(req.query.path ?? '/');
    const route = viewRouteFor(pagePath);
    if (!route) throw new ContentError('There is no page at that address.', 404);
    const content = await contentWithDrafts();
    const rendered = withContent(content, () => renderView(route.view, { path: route.path }));
    const html = versionAssetUrls(rendered, path.join(process.cwd(), 'public')).replace(
      /<body([^>]*)>/,
      '<body$1><div role="status" style="position:sticky;top:0;z-index:1000;background:#D4AF37;color:#0a0a0a;font:600 14px/1.4 system-ui,sans-serif;padding:8px 16px;text-align:center">Preview with drafts. Not live until published.</div>',
    );
    withPageScriptHashes(res, html);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.type('html').send(html);
  }),
);

router.delete(
  '/drafts/:id',
  handle(async (req, res) => {
    await requireSeeded();
    const { id: draftId } = id.parse(req.params);
    await prisma.contentDraft.delete({ where: { id: draftId } });
    res.json({ ok: true });
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
    await saved(req, `Added a photo: ${row.alt}`, rowChange('GalleryPhoto', row.id, null, row));
    res.status(201).json({ ok: true, item: row });
  }),
);

router.put(
  '/photos/:id',
  handle(async (req, res) => {
    await requireSeeded();
    const { id: rowId } = id.parse(req.params);
    const data = photoBody.parse(req.body);
    const before = await prisma.galleryPhoto.findUniqueOrThrow({ where: { id: rowId } });
    const row = await prisma.galleryPhoto.update({ where: { id: rowId }, data: { ...data, caption: data.caption || null } });
    await saved(req, `Edited a photo: ${row.alt}`, rowChange('GalleryPhoto', row.id, before, row));
    res.json({ ok: true, item: row });
  }),
);

/* ------------------------------------------------- delete and reorder, all */

const MODELS = {
  testimonials: { model: () => prisma.testimonial, table: 'Testimonial' as Table, label: 'a review' },
  'recent-work': { model: () => prisma.recentWork, table: 'RecentWork' as Table, label: 'recent work' },
  faqs: { model: () => prisma.faq, table: 'Faq' as Table, label: 'an FAQ' },
  photos: { model: () => prisma.galleryPhoto, table: 'GalleryPhoto' as Table, label: 'a photo' },
  promos: { model: () => prisma.seasonalPromo, table: 'SeasonalPromo' as Table, label: 'a promo' },
  rates: { model: () => prisma.rate, table: 'Rate' as Table, label: 'a rate' },
} as const;
type Collection = keyof typeof MODELS;
const collection = z.enum(Object.keys(MODELS) as [Collection, ...Collection[]]);

router.delete(
  '/:collection/:id',
  handle(async (req, res) => {
    await requireSeeded();
    const which = collection.parse(req.params.collection);
    const { id: rowId } = id.parse({ id: req.params.id });
    if (which === 'rates') {
      const rate = await prisma.rate.findUniqueOrThrow({ where: { id: rowId } });
      if (isCoreKey(rate.key)) throw new ContentError("This rate is used across the site and can't be deleted. Change its amount instead.");
    }
    const deleted = await (MODELS[which].model() as any).delete({ where: { id: rowId } });
    // A draft of a deleted record has nothing left to publish onto.
    await prisma.contentDraft.deleteMany({ where: { rowId } });
    await saved(req, `Deleted ${MODELS[which].label}`, rowChange(MODELS[which].table, rowId, deleted, null));
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
    const field = orderField(MODELS[which].table);
    const rows: Array<Record<string, any>> = await model.findMany({ where: { id: { in: ids } }, select: { id: true, [field]: true } });
    const before = rows.map((r) => ({ id: r.id as string, order: r[field] as number }));
    await prisma.$transaction(ids.map((rowId, order) => model.update({ where: { id: rowId }, data: { [field]: order } })));
    await saved(req, `Reordered ${which}`, {
      kind: 'reorder',
      table: MODELS[which].table,
      before,
      after: ids.map((rowId, order) => ({ id: rowId, order })),
    });
    res.json({ ok: true });
  }),
);

/* ---------------------------------------------------------------- history */

router.post(
  '/changes/:id/revert',
  handle(async (req, res) => {
    await requireSeeded();
    const { id: changeId } = id.parse(req.params);
    const change = await prisma.contentChange.findUniqueOrThrow({ where: { id: changeId } });
    if (!isRevertible(change.detail)) throw new ContentError('This change was saved before changes could be reverted.', 409);
    const reverted = await prisma.contentChange.findFirst({ where: { detail: { path: ['revertOf'], equals: changeId } } });
    if (reverted) throw new ContentError('This change has already been reverted.', 409);
    const result = await revertChange(changeId, change.detail);
    await saved(req, result.what, result.detail);
    res.json({ ok: true });
  }),
);

export default router;
