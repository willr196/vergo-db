import { prisma } from '../prisma';
import {
  defaultFaqs,
  defaultPhotos,
  defaultPromos,
  defaultRecentWork,
  defaultTestimonials,
  FaqContent,
  HomeLine,
  PhotoContent,
  PromoContent,
  RecentWorkContent,
  TestimonialContent,
} from './defaults';
import { applySettings, defaultSettings, parseSettings, SiteSettings } from './settings';

/**
 * The public site's editable content, held in memory. Pages read it
 * synchronously and never wait on the database:
 *   - at boot it is the built-in defaults (today's site, word for word);
 *   - refreshContent() replaces it with the database copy, every 60 seconds
 *     and straight after an admin save;
 *   - if the database is slow (over 500ms) or down, the last good copy stays.
 *
 * Logs go to the console, not services/logger: this module is loaded by the
 * page renderer, and the logger starts a worker thread in development.
 *
 * Until prisma/seed-site-content.ts has run (it sets the "contentSeeded"
 * marker), the defaults stay in force even when the database answers, so an
 * empty content table can never blank a section of the live site.
 */

/** An open shift for the list on /work: what, when, where and the pay. */
export interface ShiftSummary {
  role: string;
  title: string;
  date: Date;
  area: string;
  payRate: number;
  payType: 'HOURLY' | 'DAILY' | 'FIXED';
}

export interface ContentDates {
  settings?: Date;
  testimonials?: Date;
  recentWork?: Date;
  photos?: Date;
  promos?: Date;
  /** By pageKey */
  faqs: Record<string, Date>;
}

export interface SiteContent {
  settings: SiteSettings;
  testimonials: TestimonialContent[];
  recentWork: RecentWorkContent[];
  photos: PhotoContent[];
  faqs: Record<string, FaqContent[]>;
  promos: PromoContent[];
  /**
   * When each kind of content last changed in the database, published or not
   * (unpublishing is a change too). Drives the sitemap's lastmod. Empty on
   * the built-in defaults.
   */
  updated: ContentDates;
  /** Up to five upcoming open shifts from the job board, soonest first. */
  openShifts: ShiftSummary[];
  /** Where this copy came from, for the admin and the logs. */
  source: 'defaults' | 'database';
  loadedAt: Date;
}

export const SEEDED_MARKER = 'contentSeeded';
const DB_TIMEOUT_MS = 500;
const REFRESH_MS = 60_000;

function defaults(): SiteContent {
  return {
    settings: defaultSettings(),
    testimonials: defaultTestimonials(),
    recentWork: defaultRecentWork(),
    photos: defaultPhotos(),
    faqs: defaultFaqs(),
    promos: defaultPromos(),
    updated: { faqs: {} },
    openShifts: [],
    source: 'defaults',
    loadedAt: new Date(),
  };
}

let current: SiteContent = defaults();
applySettings(current.settings);

const listeners: Array<() => void> = [];

/** Runs after every change of content, e.g. to clear rendered-page caches. */
export function onContentChange(fn: () => void): void {
  listeners.push(fn);
}

export function siteContent(): SiteContent {
  return current;
}

function setContent(next: SiteContent): void {
  current = next;
  applySettings(next.settings);
  for (const fn of listeners) {
    try {
      fn();
    } catch (err) {
      console.error('[SITE-CONTENT] change listener failed', err);
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`site content query took over ${ms}ms`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

async function loadFromDatabase(): Promise<SiteContent | null> {
  const [settingRows, testimonials, recentWork, photos, faqs, promos] = await Promise.all([
    prisma.siteSetting.findMany(),
    prisma.testimonial.findMany({ where: { published: true }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }),
    prisma.recentWork.findMany({ where: { published: true }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }),
    prisma.galleryPhoto.findMany({ where: { published: true }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }),
    prisma.faq.findMany({ where: { published: true }, orderBy: [{ pageKey: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }] }),
    prisma.seasonalPromo.findMany({ where: { published: true }, orderBy: { startsAt: 'asc' } }),
  ]);

  if (!settingRows.some((row) => row.key === SEEDED_MARKER)) return null;

  const [t, w, ph, pr, faqDates] = await Promise.all([
    prisma.testimonial.aggregate({ _max: { updatedAt: true } }),
    prisma.recentWork.aggregate({ _max: { updatedAt: true } }),
    prisma.galleryPhoto.aggregate({ _max: { updatedAt: true } }),
    prisma.seasonalPromo.aggregate({ _max: { updatedAt: true } }),
    prisma.faq.groupBy({ by: ['pageKey'], _max: { updatedAt: true } }),
  ]);
  const settingsDates = settingRows.filter((r) => r.key !== SEEDED_MARKER).map((r) => r.updatedAt.getTime());
  const updated: ContentDates = {
    settings: settingsDates.length ? new Date(Math.max(...settingsDates)) : undefined,
    testimonials: t._max.updatedAt || undefined,
    recentWork: w._max.updatedAt || undefined,
    photos: ph._max.updatedAt || undefined,
    promos: pr._max.updatedAt || undefined,
    faqs: Object.fromEntries(faqDates.filter((f) => f._max.updatedAt).map((f) => [f.pageKey, f._max.updatedAt as Date])),
  };

  const faqsByPage: Record<string, FaqContent[]> = {};
  for (const f of faqs) {
    (faqsByPage[f.pageKey] ||= []).push({ question: f.question, answer: f.answer });
  }

  return {
    settings: parseSettings(settingRows),
    testimonials: testimonials.map((t) => ({
      quote: t.quote,
      name: t.name,
      context: t.context,
      source: t.source,
      url: t.url,
      stars: t.stars,
      showOnHome: t.showOnHome,
      showOnHire: t.showOnHire,
    })),
    recentWork: recentWork.map((w) => ({ title: w.title, detail: w.detail })),
    photos: photos.map((p) => ({
      path: p.path,
      variants: p.variants,
      alt: p.alt,
      caption: p.caption,
      tags: p.tags,
      width: p.width,
      height: p.height,
    })),
    faqs: faqsByPage,
    promos: promos.map((p) => ({
      key: p.key,
      navLabel: p.navLabel,
      bannerText: p.bannerText,
      href: p.href,
      homeHeading: p.homeHeading,
      homeLines: homeLines(p.homeLines),
      homeCtaLabel: p.homeCtaLabel,
      homeCtaHref: p.homeCtaHref,
      startsAt: p.startsAt,
      endsAt: p.endsAt,
      navStartsAt: p.navStartsAt,
      navEndsAt: p.navEndsAt,
    })),
    updated,
    openShifts: [],
    source: 'database',
    loadedAt: new Date(),
  };
}

/**
 * The next five open shifts VERGO is staffing itself (INTERNAL jobs, not
 * listings posted for others), with a date and a pay rate. Loaded on every
 * refresh whether or not the site content has been seeded: this is the job
 * board's data, not site content.
 */
async function loadOpenShifts(): Promise<ShiftSummary[]> {
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const jobs = await prisma.job.findMany({
    where: { status: 'OPEN', type: 'INTERNAL', eventDate: { gte: startOfToday }, payRate: { not: null } },
    orderBy: [{ eventDate: 'asc' }, { createdAt: 'asc' }],
    take: 5,
    select: { title: true, location: true, eventDate: true, payRate: true, payType: true, role: { select: { name: true } } },
  });
  return jobs.map((j) => ({
    role: j.role.name,
    title: j.title,
    date: j.eventDate as Date,
    area: j.location,
    payRate: Number(j.payRate),
    payType: j.payType,
  }));
}

/** Stored JSON as homepage lines, dropping anything that is neither a sentence nor { label, price }. */
function homeLines(value: unknown): HomeLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((line): HomeLine[] => {
    if (typeof line === 'string') return [line];
    if (line && typeof line === 'object' && typeof (line as any).label === 'string' && typeof (line as any).price === 'string') {
      return [{ label: (line as any).label, price: (line as any).price }];
    }
    return [];
  });
}

/** Reloads from the database. Never throws: on any failure the last good copy stays. */
export async function refreshContent(): Promise<void> {
  try {
    const [next, openShifts] = await withTimeout(Promise.all([loadFromDatabase(), loadOpenShifts()]), DB_TIMEOUT_MS);
    setContent({ ...(next || current), openShifts });
  } catch (err) {
    console.warn('[SITE-CONTENT] refresh failed, keeping the last good copy:', err instanceof Error ? err.message : err);
  }
}

/** Loads now, then every minute. The timer doesn't keep the process alive. */
export function startContentRefresh(): void {
  void refreshContent();
  const timer = setInterval(() => void refreshContent(), REFRESH_MS);
  timer.unref();
}

/** Test hook: back to the built-in defaults. */
export function resetContentForTests(): void {
  setContent(defaults());
}
