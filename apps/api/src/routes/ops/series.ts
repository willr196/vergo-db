/**
 * VERGO Ops: repeating bookings. Start one from any booking (it becomes the
 * pattern), change the weekdays, end date or pattern, or stop it. The days
 * themselves are ordinary Ops bookings, edited and staffed as usual.
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../prisma';
import { writeAudit, actorOf, diff } from '../../ops/audit';
import { CANCELLABLE_DAY_STATUSES, DEFAULT_AHEAD_WEEKS, MAX_AHEAD_WEEKS, fillSeries } from '../../ops/series';
import { FILLING_STATUSES } from '../../ops/service';
import { addDays, dateKey, londonDateKey } from '../../ops/time';
import { handle, fail, ymd, dateOnly } from './common';

const r = Router();

const weekdays = z.array(z.number().int().min(1).max(7)).min(1, 'Pick at least one day').transform((d) => [...new Set(d)].sort((a, b) => a - b));
const aheadWeeks = z.number().int().min(1).max(MAX_AHEAD_WEEKS);

async function shapeSeries(id: string) {
  const s = await prisma.opsBookingSeries.findUniqueOrThrow({
    where: { id },
    include: {
      client: { select: { id: true, companyName: true } },
      patternBooking: { select: { id: true, reference: true, eventType: true, venue: true, startTime: true, expectedFinish: true } },
    },
  });
  const today = dateOnly(londonDateKey(new Date()));
  const [upcoming, next] = await Promise.all([
    prisma.opsBooking.count({ where: { seriesId: id, eventDate: { gte: today }, status: { not: 'CANCELLED' } } }),
    prisma.opsBooking.findFirst({ where: { seriesId: id, eventDate: { gte: today }, status: { not: 'CANCELLED' } }, orderBy: { eventDate: 'asc' }, select: { id: true, reference: true, eventDate: true } }),
  ]);
  return {
    id: s.id,
    client: s.client,
    pattern: s.patternBooking,
    weekdays: s.weekdays,
    startsOn: dateKey(s.startsOn),
    endsOn: s.endsOn ? dateKey(s.endsOn) : null,
    aheadWeeks: s.aheadWeeks,
    generatedThrough: s.generatedThrough ? dateKey(s.generatedThrough) : null,
    active: s.active,
    upcoming,
    next: next ? { ...next, eventDate: dateKey(next.eventDate) } : null,
  };
}

r.get('/series', handle(async (_req, res) => {
  const all = await prisma.opsBookingSeries.findMany({ orderBy: [{ active: 'desc' }, { createdAt: 'desc' }], select: { id: true } });
  res.json({ ok: true, data: await Promise.all(all.map((s) => shapeSeries(s.id))) });
}));

r.get('/series/:id', handle(async (req, res) => {
  if (!(await prisma.opsBookingSeries.findUnique({ where: { id: req.params.id }, select: { id: true } }))) fail(404, 'Repeating booking not found');
  res.json({ ok: true, data: await shapeSeries(req.params.id) });
}));

const repeatBody = z.object({
  weekdays,
  endsOn: ymd.nullable().optional(),
  aheadWeeks: aheadWeeks.optional(),
});

r.post('/bookings/:id/repeat', handle(async (req, res) => {
  const body = repeatBody.parse(req.body);
  const actor = actorOf(req);
  const booking = await prisma.opsBooking.findUnique({ where: { id: req.params.id }, select: { id: true, reference: true, clientId: true, eventDate: true, seriesId: true, status: true } });
  if (!booking) fail(404, 'Booking not found');
  if (booking.seriesId) fail(409, 'This booking already repeats. Change or stop that instead.');
  if (booking.status === 'CANCELLED') fail(400, 'A cancelled booking cannot be the pattern for a repeat.');
  const startsOn = dateKey(booking.eventDate);
  if (body.endsOn && body.endsOn < startsOn) fail(400, 'The last day must be on or after this booking.');

  const series = await prisma.$transaction(async (tx) => {
    const created = await tx.opsBookingSeries.create({
      data: {
        clientId: booking.clientId, patternBookingId: booking.id, weekdays: body.weekdays,
        startsOn: booking.eventDate, endsOn: body.endsOn ? dateOnly(body.endsOn) : null,
        aheadWeeks: body.aheadWeeks ?? DEFAULT_AHEAD_WEEKS, generatedThrough: booking.eventDate, createdBy: actor,
      },
      select: { id: true },
    });
    await tx.opsBooking.update({ where: { id: booking.id }, data: { seriesId: created.id } });
    await writeAudit(actor, { action: 'BOOKING_SERIES_STARTED', entityType: 'OpsBooking', entityId: booking.id, newValue: { seriesId: created.id, ...body } }, tx);
    return created;
  });
  const added = await fillSeries(series.id, actor);
  res.status(201).json({ ok: true, data: { ...(await shapeSeries(series.id)), added } });
}));

const patchBody = z.object({
  weekdays: weekdays.optional(),
  endsOn: ymd.nullable().optional(),
  aheadWeeks: aheadWeeks.optional(),
  patternBookingId: z.string().min(1).optional(),
  active: z.boolean().optional(),
});

r.patch('/series/:id', handle(async (req, res) => {
  const body = patchBody.parse(req.body);
  const actor = actorOf(req);
  const before = await prisma.opsBookingSeries.findUnique({ where: { id: req.params.id } });
  if (!before) fail(404, 'Repeating booking not found');
  if (body.patternBookingId) {
    const p = await prisma.opsBooking.findUnique({ where: { id: body.patternBookingId }, select: { seriesId: true, status: true } });
    if (!p || p.seriesId !== before.id) fail(400, 'The pattern must be one of this repeating booking\'s own days.');
    if (p.status === 'CANCELLED') fail(400, 'A cancelled day cannot be the pattern.');
  }
  if (body.endsOn && body.endsOn < dateKey(before.startsOn)) fail(400, 'The last day must be on or after the first.');
  // New weekdays, or a restart, should fill the gaps from today (e.g. adding
  // Saturdays puts in the coming Saturdays, not only those after the last day
  // made). Days already there are kept as they are: (seriesId, eventDate) is
  // unique, so the fill skips them, cancelled ones included.
  const today = londonDateKey(new Date());
  const weekdaysChanged = body.weekdays && body.weekdays.join() !== before.weekdays.join();
  const rescan = (weekdaysChanged || (body.active && !before.active)) && before.generatedThrough && dateKey(before.generatedThrough) >= today;
  const data = {
    ...body,
    ...(body.endsOn !== undefined ? { endsOn: body.endsOn ? dateOnly(body.endsOn) : null } : {}),
    ...(rescan ? { generatedThrough: dateOnly(addDays(today, -1)) } : {}),
  };
  await prisma.$transaction(async (tx) => {
    await tx.opsBookingSeries.update({ where: { id: before.id }, data });
    const change = diff(before as any, data as any);
    await writeAudit(actor, { action: 'BOOKING_SERIES_CHANGED', entityType: 'OpsBooking', entityId: before.patternBookingId, oldValue: change.oldValue, newValue: { seriesId: before.id, ...change.newValue } }, tx);
  });
  const added = await fillSeries(before.id, actor);
  res.json({ ok: true, data: { ...(await shapeSeries(before.id)), added } });
}));

const stopBody = z.object({
  /** The last day that still goes ahead. */
  lastDay: ymd,
  /** Cancel the later days that nobody is on yet. Days with staff are kept and listed. */
  cancelLaterDays: z.boolean().default(true),
});

r.post('/series/:id/stop', handle(async (req, res) => {
  const body = stopBody.parse(req.body);
  const actor = actorOf(req);
  const series = await prisma.opsBookingSeries.findUnique({ where: { id: req.params.id } });
  if (!series) fail(404, 'Repeating booking not found');

  const later = await prisma.opsBooking.findMany({
    where: { seriesId: series.id, eventDate: { gt: dateOnly(body.lastDay) }, status: { not: 'CANCELLED' } },
    select: { id: true, reference: true, eventDate: true, status: true, assignments: { select: { status: true } } },
    orderBy: { eventDate: 'asc' },
  });
  const cancellable = (CANCELLABLE_DAY_STATUSES as { in: string[] }).in;
  const toCancel = body.cancelLaterDays
    ? later.filter((b) => cancellable.includes(b.status) && !b.assignments.some((a) => FILLING_STATUSES.has(a.status)))
    : [];
  const kept = later.filter((b) => !toCancel.includes(b));

  await prisma.$transaction(async (tx) => {
    await tx.opsBookingSeries.update({ where: { id: series.id }, data: { active: false, endsOn: dateOnly(body.lastDay) } });
    for (const b of toCancel) {
      await tx.opsBooking.update({ where: { id: b.id }, data: { status: 'CANCELLED' } });
      await writeAudit(actor, { action: 'BOOKING_STATUS_CHANGED', entityType: 'OpsBooking', entityId: b.id, oldValue: { status: b.status }, newValue: { status: 'CANCELLED' }, reason: 'Repeating booking stopped' }, tx);
    }
    await writeAudit(actor, { action: 'BOOKING_SERIES_STOPPED', entityType: 'OpsBooking', entityId: series.patternBookingId, newValue: { seriesId: series.id, lastDay: body.lastDay, cancelled: toCancel.map((b) => b.reference) } }, tx);
  });

  res.json({
    ok: true,
    data: {
      ...(await shapeSeries(series.id)),
      cancelled: toCancel.map((b) => b.reference),
      kept: kept.map((b) => ({ id: b.id, reference: b.reference, eventDate: dateKey(b.eventDate), status: b.status })),
    },
  });
}));

export default r;
