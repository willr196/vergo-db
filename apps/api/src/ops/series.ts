/**
 * Repeating Ops bookings (ongoing contracts, e.g. a kitchen porter Monday to
 * Friday). A series never invents a booking type of its own: it keeps real
 * OpsBooking days created aheadWeeks in advance, each a copy of its pattern
 * booking, so the rota, calendar, staffing, timesheets and invoicing all treat
 * every day like any other booking. Staff are never copied: each day is
 * staffed on its own, so nobody is put on a shift they did not agree to.
 *
 * Filling ahead is idempotent. (seriesId, eventDate) is unique, and days are
 * only ever added after generatedThrough, so a day cancelled or moved by hand
 * is never brought back and two machines filling at once cannot double up.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { writeAudit } from './audit';
import { nextBookingReference } from './service';
import { addDays, dateKey, londonDateKey } from './time';

export const DEFAULT_AHEAD_WEEKS = 6;
export const MAX_AHEAD_WEEKS = 26;
export const SERIES_ACTOR = 'ops:repeating-bookings';

/** 1 = Monday .. 7 = Sunday for a YYYY-MM-DD date. */
export function isoWeekday(ymd: string): number {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay() || 7;
}

export interface SeriesPlanInput {
  weekdays: number[];
  startsOn: string;
  endsOn: string | null;
  generatedThrough: string | null;
  aheadWeeks: number;
  today: string;
}

/**
 * The days a series should add now, and the new generatedThrough. Never
 * reaches back before today or before generatedThrough, never past endsOn.
 */
export function planSeriesDays(input: SeriesPlanInput): { dates: string[]; through: string | null } {
  const days = new Set(input.weekdays);
  const after = input.generatedThrough ? addDays(input.generatedThrough, 1) : input.startsOn;
  let from = [input.startsOn, after, input.today].sort().pop()!;
  const horizon = addDays(input.today, Math.min(Math.max(input.aheadWeeks, 1), MAX_AHEAD_WEEKS) * 7);
  const until = input.endsOn && input.endsOn < horizon ? input.endsOn : horizon;
  if (from > until || days.size === 0) return { dates: [], through: input.generatedThrough };
  const dates: string[] = [];
  for (; from <= until; from = addDays(from, 1)) if (days.has(isoWeekday(from))) dates.push(from);
  const through = input.generatedThrough && input.generatedThrough > until ? input.generatedThrough : until;
  return { dates, through };
}

/** Statuses a new day starts in: a draft or quote stays one, anything else is a confirmed booking. */
function newDayStatus(patternStatus: string): 'DRAFT' | 'QUOTED' | 'CONFIRMED' {
  return patternStatus === 'DRAFT' || patternStatus === 'QUOTED' ? patternStatus : 'CONFIRMED';
}

const isSeriesDayClash = (error: any) =>
  error?.code === 'P2002' && String(error?.meta?.target ?? '').includes('seriesId');

/** Add the days a series is due, copying its pattern booking. Returns the new references. */
export async function fillSeries(seriesId: string, actor = SERIES_ACTOR, today = londonDateKey(new Date())): Promise<string[]> {
  const series = await prisma.opsBookingSeries.findUnique({
    where: { id: seriesId },
    include: { patternBooking: { include: { requirements: { orderBy: { createdAt: 'asc' } }, scheduleItems: true } } },
  });
  if (!series || !series.active) return [];
  const plan = planSeriesDays({
    weekdays: series.weekdays,
    startsOn: dateKey(series.startsOn),
    endsOn: series.endsOn ? dateKey(series.endsOn) : null,
    generatedThrough: series.generatedThrough ? dateKey(series.generatedThrough) : null,
    aheadWeeks: series.aheadWeeks,
    today,
  });
  const p = series.patternBooking;
  const created: string[] = [];

  for (const day of plan.dates) {
    let done = false;
    for (let attempt = 0; attempt < 5 && !done; attempt++) {
      const reference = await nextBookingReference(Number(day.slice(0, 4)));
      try {
        await prisma.$transaction(async (tx) => {
          const booking = await tx.opsBooking.create({
            data: {
              reference, clientId: series.clientId, seriesId: series.id,
              bookingType: p.bookingType, eventType: p.eventType, venue: p.venue, address: p.address,
              eventDate: new Date(`${day}T00:00:00.000Z`), startTime: p.startTime, expectedFinish: p.expectedFinish,
              guestNumbers: p.guestNumbers, onSiteContactName: p.onSiteContactName, onSiteContactPhone: p.onSiteContactPhone,
              vergoLead: p.vergoLead, status: newDayStatus(p.status), notes: p.notes,
              consumerTermsRequired: p.consumerTermsRequired, termsVersionAtBooking: p.termsVersionAtBooking,
              paymentTermsDays: p.paymentTermsDays,
            },
            select: { id: true },
          });
          for (const r of p.requirements) {
            const { id: _id, createdAt: _c, updatedAt: _u, opsBookingId: _b, ...rest } = r;
            await tx.opsRequirement.create({ data: { ...rest, opsBookingId: booking.id } });
          }
          for (const s of p.scheduleItems) {
            await tx.opsScheduleItem.create({ data: { opsBookingId: booking.id, time: s.time, title: s.title, assignee: s.assignee, notes: s.notes } });
          }
          await writeAudit(actor, { action: 'BOOKING_CREATED', entityType: 'OpsBooking', entityId: booking.id, newValue: { repeatOf: p.reference, seriesId: series.id, eventDate: day } }, tx);
        });
        created.push(reference);
        done = true;
      } catch (error: any) {
        if (isSeriesDayClash(error)) { done = true; break; } // already there (another machine, or added before)
        if (error?.code !== 'P2002') throw error; // a reference race: take the next number
      }
    }
  }

  if (plan.through) {
    await prisma.opsBookingSeries.update({ where: { id: series.id }, data: { generatedThrough: new Date(`${plan.through}T00:00:00.000Z`) } });
  }
  return created;
}

/** Fill every active series. Errors on one series are logged and do not stop the others. */
export async function fillAllSeries(actor = SERIES_ACTOR): Promise<number> {
  const all = await prisma.opsBookingSeries.findMany({ where: { active: true }, select: { id: true } });
  let total = 0;
  for (const s of all) {
    try {
      total += (await fillSeries(s.id, actor)).length;
    } catch (error) {
      console.error('[OPS] Could not fill repeating booking', s.id, error);
    }
  }
  return total;
}

let timer: NodeJS.Timeout | null = null;

/** Keep repeating bookings filled ahead: shortly after start, then every six hours. */
export function startSeriesFiller() {
  if (timer) return;
  const run = () => void fillAllSeries().then((n) => { if (n) console.log(`[OPS] Repeating bookings: added ${n} day(s)`); }).catch((e) => console.error('[OPS] Repeating bookings fill failed', e));
  setTimeout(run, 30_000).unref();
  timer = setInterval(run, 6 * 60 * 60 * 1000);
  timer.unref();
}

export function stopSeriesFiller() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Days of a series that can be cancelled when it stops: not yet worked, invoiced, or staffed. */
export const CANCELLABLE_DAY_STATUSES: Prisma.OpsBookingWhereInput['status'] = { in: ['DRAFT', 'QUOTED', 'CONFIRMED', 'STAFFING'] };
