import fs from 'node:fs';
import path from 'node:path';
import faqsByPage from './defaults-faqs.json';

/**
 * The site's content as it stood when it moved into the database, word for
 * word. Two jobs: prisma/seed-site-content.ts writes it, and site/store.ts
 * serves it until the database has been seeded, or when the database can't be
 * reached and there is no last good copy in memory yet.
 */

export interface TestimonialContent {
  quote: string;
  name: string;
  context: string;
  source: string;
  url?: string | null;
  stars?: number | null;
  showOnHome: boolean;
  showOnHire: boolean;
}

export interface RecentWorkContent {
  title: string;
  detail: string;
}

export interface PhotoContent {
  /** With variants, "{w}" stands for each width. */
  path: string;
  variants: number[];
  alt: string;
  caption?: string | null;
  tags: string[];
  width: number;
  height: number;
}

export interface FaqContent {
  question: string;
  answer: string;
}

/** A line under a season's homepage heading: a sentence, or a role and its rate. */
export type HomeLine = string | { label: string; price: string };

export interface PromoContent {
  key: string;
  navLabel: string;
  bannerText: string;
  href: string;
  homeHeading: string;
  homeLines: HomeLine[];
  homeCtaLabel?: string | null;
  homeCtaHref?: string | null;
  startsAt: Date;
  endsAt: Date;
  navStartsAt?: Date | null;
  navEndsAt?: Date | null;
}

/** public/data/proof.json, the file the reviews and recent work lived in before the database. */
function proofFile(): { testimonials: any[]; recentWork: any[] } {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'data', 'proof.json'), 'utf8'));
    return { testimonials: data.testimonials || [], recentWork: data.recentWork || [] };
  } catch {
    return { testimonials: [], recentWork: [] };
  }
}

export function defaultTestimonials(): TestimonialContent[] {
  return proofFile().testimonials.map((t) => ({
    quote: t.quote,
    name: t.name,
    context: t.context,
    source: t.source === 'google' ? 'google' : 'direct',
    url: t.url || null,
    stars: t.stars || null,
    // proof.json's "featured" was the one review the homepage shows; /hire showed them all.
    showOnHome: Boolean(t.featured),
    showOnHire: true,
  }));
}

export function defaultRecentWork(): RecentWorkContent[] {
  return proofFile().recentWork.map((w) => ({ title: w.title, detail: w.detail }));
}

/**
 * The one photo the pages pick by tag: the Halloween bar on the homepage's
 * season section (tag "season-halloween"). Everything else arrives through
 * the admin.
 */
export function defaultPhotos(): PhotoContent[] {
  return [
    {
      path: '/images/special-events/halloween-bar-{w}.webp',
      variants: [800, 1200],
      alt: 'Bartenders in hooded robes and ghost masks pouring cocktails at a candlelit Halloween bar',
      caption: null,
      tags: ['season-halloween'],
      width: 1448,
      height: 1086,
    },
  ];
}

/** Every page's FAQs, keyed by page ("hire/weddings"), copied from the pages. */
export function defaultFaqs(): Record<string, FaqContent[]> {
  return structuredClone(faqsByPage as Record<string, FaqContent[]>);
}

/** Midnight at the start of a day in London, as UTC. */
function londonDay(year: number, month: number, day: number): Date {
  // BST runs from the last Sunday of March to the last Sunday of October.
  const probe = new Date(Date.UTC(year, month - 1, day, 12));
  const offset = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', timeZoneName: 'shortOffset' })
    .formatToParts(probe)
    .find((p) => p.type === 'timeZoneName')?.value;
  const hours = offset && offset !== 'GMT' ? Number(offset.replace('GMT', '')) : 0;
  return new Date(Date.UTC(year, month - 1, day) - hours * 3600_000);
}

/** The last moment of a day in London. */
function londonDayEnd(year: number, month: number, day: number): Date {
  return new Date(londonDay(year, month, day + 1).getTime() - 1);
}

/**
 * The two seasons, with the windows vergo-site.js used: Halloween's banner and
 * header item 1 September to 31 October; Christmas's banner 1 September to 20
 * December and its header item from 1 November. Dated for 2026; next year's
 * dates are set in the admin.
 */
export function defaultPromos(year = 2026): PromoContent[] {
  return [
    {
      key: 'halloween',
      navLabel: 'Halloween',
      bannerText: 'Halloween staff and performers: now booking',
      href: '/special-events/halloween',
      homeHeading: 'Halloween: themed staff, performers and makeup',
      homeLines: [
        { label: 'Themed hospitality staff', price: '{{THEMED_RATE}}/hr' },
        { label: 'Scare actors and character performers', price: '{{PERFORMER_RATE}}/hr' },
        { label: 'Makeup artists', price: '{{MAKEUP_RATE}}/hr' },
        'The last week of October books up first.',
      ],
      homeCtaLabel: 'Build your Halloween team',
      homeCtaHref: '/special-events/halloween#build',
      startsAt: londonDay(year, 9, 1),
      endsAt: londonDayEnd(year, 10, 31),
      navStartsAt: null,
      navEndsAt: null,
    },
    {
      key: 'christmas',
      navLabel: 'Christmas',
      bannerText: 'Christmas party staff: now booking',
      href: '/special-events/christmas',
      homeHeading: 'Christmas: party staff through December',
      homeLines: ['Festive and themed staff, or a straight team at {{STANDARD_RATE}}/hr.'],
      homeCtaLabel: 'Christmas party staff',
      homeCtaHref: '/special-events/christmas',
      startsAt: londonDay(year, 9, 1),
      endsAt: londonDayEnd(year, 12, 20),
      navStartsAt: londonDay(year, 11, 1),
      navEndsAt: londonDayEnd(year, 12, 20),
    },
  ];
}
