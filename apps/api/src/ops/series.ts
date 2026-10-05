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
import { dateKey, londonDateKey } from './time';
import { planSeriesDays } from './seriesPlan';

export { DEFAULT_AHEAD_WEEKS, MAX_AHEAD_WEEKS, isoWeekday, planSeriesDays, type SeriesPlanInput } from './seriesPlan';
export const SERIES_ACTOR = 'ops:repeating-bookings';

/** Statuses a new day starts in: a draft or quote stays one, anything else is a confirmed booking. */
export function newDayStatus(patternStatus: string): 'DRAFT' | 'QUOTED' | 'CONFIRMED' {
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
    try {
      const copy = await copyBookingTo(p, day, { seriesId: series.id, status: newDayStatus(p.status), actor, audit: { repeatOf: p.reference, seriesId: series.id } });
      created.push(copy.reference);
    } catch (error: any) {
      if (!isSeriesDayClash(error)) throw error; // already there (another machine, or added before)
    }
  }

  if (plan.through) {
    await prisma.opsBookingSeries.update({ where: { id: series.id }, data: { generatedThrough: new Date(`${plan.through}T00:00:00.000Z`) } });
  }
  return created;
}

type CopySource = Prisma.OpsBookingGetPayload<{ include: { requirements: true; scheduleItems: true } }>;

/**
 * Copy a booking to another day: times, venue, roles, rates and running order,
 * never staff. Used by repeating bookings and by "Copy to other days".
 * Retries on a booking-reference race; any other error is the caller's.
 */
export async function copyBookingTo(
  p: CopySource,
  day: string,
  opts: { seriesId?: string | null; status: string; actor: string; audit: Record<string, unknown> },
): Promise<{ id: string; reference: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = await nextBookingReference(Number(day.slice(0, 4)));
    try {
      return await prisma.$transaction(async (tx) => {
        const booking = await tx.opsBooking.create({
          data: {
            reference, clientId: p.clientId, seriesId: opts.seriesId ?? null,
            bookingType: p.bookingType, eventType: p.eventType, venue: p.venue, address: p.address,
            eventDate: new Date(`${day}T00:00:00.000Z`), startTime: p.startTime, expectedFinish: p.expectedFinish,
            guestNumbers: p.guestNumbers, onSiteContactName: p.onSiteContactName, onSiteContactPhone: p.onSiteContactPhone,
            vergoLead: p.vergoLead, status: opts.status as Prisma.OpsBookingCreateInput['status'], notes: p.notes,
            consumerTermsRequired: p.consumerTermsRequired, termsVersionAtBooking: p.termsVersionAtBooking,
            paymentTermsDays: p.paymentTermsDays,
          },
          select: { id: true, reference: true },
        });
        for (const r of [...p.requirements].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
          const { id: _id, createdAt: _c, updatedAt: _u, opsBookingId: _b, ...rest } = r;
          await tx.opsRequirement.create({ data: { ...rest, opsBookingId: booking.id } });
        }
        for (const s of p.scheduleItems) {
          await tx.opsScheduleItem.create({ data: { opsBookingId: booking.id, time: s.time, title: s.title, assignee: s.assignee, notes: s.notes } });
        }
        await writeAudit(opts.actor, { action: 'BOOKING_CREATED', entityType: 'OpsBooking', entityId: booking.id, newValue: { ...opts.audit, eventDate: day } }, tx);
        return booking;
      });
    } catch (error: any) {
      if (error?.code !== 'P2002' || isSeriesDayClash(error)) throw error;
      // a reference race: take the next number
    }
  }
  throw new Error('Could not allocate a booking reference, try again.');
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
