import faqsByPage from './defaults-faqs.json';
import proof from './defaults-proof.json';

/**
 * The site's content as it stood when it moved into the database, word for
 * word: defaults-proof.json (the reviews and recent work, formerly
 * public/data/proof.json) and defaults-faqs.json (every page's FAQs).
 *
 * Two jobs: prisma/seed-site-content.ts writes it, and site/store.ts
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
  /** The dates line on the event page while in season; may carry {{TOKENS}}. */
  pageLine?: string | null;
  /** The event page is in season until this; endsAt when empty. */
  pageUntil?: Date | null;
}

export function defaultTestimonials(): TestimonialContent[] {
  return (proof.testimonials as any[]).map((t) => ({
    quote: t.quote,
    name: t.name,
    context: t.context,
    source: t.source === 'google' ? 'google' : 'direct',
    url: t.url || null,
    stars: t.stars || null,
    // "featured" was the one review the homepage showed; /hire showed them all.
    showOnHome: Boolean(t.featured),
    showOnHire: true,
  }));
}

export function defaultRecentWork(): RecentWorkContent[] {
  return proof.recentWork.map((w) => ({ title: w.title, detail: w.detail }));
}

/** Photos all arrive through the admin. */
export function defaultPhotos(): PhotoContent[] {
  return [];
}

/** Every page's FAQs, keyed by page ("hire/weddings"), copied from the pages. */
export function defaultFaqs(): Record<string, FaqContent[]> {
  return structuredClone(faqsByPage as Record<string, FaqContent[]>);
}

/** Midnight at the start of a day in London, as UTC. */
export function londonDay(year: number, month: number, day: number): Date {
  // BST runs from the last Sunday of March to the last Sunday of October.
  const probe = new Date(Date.UTC(year, month - 1, day, 12));
  const offset = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', timeZoneName: 'shortOffset' })
    .formatToParts(probe)
    .find((p) => p.type === 'timeZoneName')?.value;
  const hours = offset && offset !== 'GMT' ? Number(offset.replace('GMT', '')) : 0;
  return new Date(Date.UTC(year, month - 1, day) - hours * 3600_000);
}

/** The last moment of a day in London. */
export function londonDayEnd(year: number, month: number, day: number): Date {
  return new Date(londonDay(year, month, day + 1).getTime() - 1);
}

/**
 * The season, with the windows vergo-site.js used: Christmas's banner 1
 * September to 20 December, with its header item for the same dates; New
 * Year's Eve's banner 1 November to 31 December, beside it. Dated for 2026;
 * next year's dates are set in the admin.
 */
export function defaultPromos(year = 2026): PromoContent[] {
  return [
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
      navStartsAt: null,
      navEndsAt: null,
      pageLine: null,
      // The page stays in season through the holidays, for parties booked late.
      pageUntil: londonDayEnd(year, 12, 31),
    },
    {
      key: 'new-years-eve',
      navLabel: 'New Year’s Eve',
      bannerText: 'New Year’s Eve staff: now booking',
      href: '/special-events/new-years-eve',
      homeHeading: 'New Year’s Eve: teams for the biggest night of the year',
      homeLines: [],
      homeCtaLabel: 'New Year’s Eve staff',
      homeCtaHref: '/special-events/new-years-eve',
      startsAt: londonDay(year, 11, 1),
      endsAt: londonDayEnd(year, 12, 31),
      navStartsAt: null,
      navEndsAt: null,
      pageLine: null,
      pageUntil: null,
    },
  ];
}
