/**
 * VERGO Ops planning: outreach leads, the weekly rota and each booking's
 * running order. Merged in from the old local tool (Documents/vergo_admin) so
 * everything runs from one admin panel.
 */

import { Router } from 'express';
import { z } from 'zod';
import type { BookingStatus } from '@prisma/client';
import { prisma } from '../../prisma';
import { writeAudit, actorOf, diff } from '../../ops/audit';
import { unusablePasswordHash, FILLING_STATUSES } from '../../ops/service';
import { addDays, dateKey, londonDateKey, weekStartKey } from '../../ops/time';
import { handle, fail, ymd, clock, optionalText, dateOnly } from './common';

const r = Router();

// ── Leads ─────────────────────────────────────────────────────────────────

const CHANNELS = ['EMAIL', 'PHONE', 'IN_PERSON', 'OTHER'] as const;
const STAGES = ['CONTACTED', 'REPLIED', 'WON', 'LOST'] as const;

const leadBody = z.object({
  company: z.string().trim().min(1).max(200),
  contactName: optionalText(120),
  contactEmail: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().toLowerCase().email().max(255).nullable().optional()),
  contactPhone: optionalText(40),
  contactedOn: ymd,
  channel: z.enum(CHANNELS).default('EMAIL'),
  stage: z.enum(STAGES).default('CONTACTED'),
  notes: optionalText(4000),
});

const leadSelect = {
  id: true, company: true, contactName: true, contactEmail: true, contactPhone: true, contactedOn: true,
  channel: true, stage: true, notes: true, clientId: true, createdAt: true, updatedAt: true,
  client: { select: { id: true, companyName: true } },
} as const;

const shapeLead = <T extends { contactedOn: Date }>(lead: T) => ({ ...lead, contactedOn: dateKey(lead.contactedOn) });

r.get('/leads', handle(async (req, res) => {
  const q = z.object({ stage: z.enum(STAGES).optional(), search: z.string().max(100).optional() }).parse(req.query);
  const leads = await prisma.opsLead.findMany({
    where: {
      ...(q.stage ? { stage: q.stage } : {}),
      ...(q.search ? { OR: [
        { company: { contains: q.search, mode: 'insensitive' } },
        { contactName: { contains: q.search, mode: 'insensitive' } },
        { contactEmail: { contains: q.search, mode: 'insensitive' } },
      ] } : {}),
    },
    orderBy: [{ contactedOn: 'desc' }, { createdAt: 'desc' }],
    select: leadSelect,
  });
  res.json({ ok: true, data: leads.map(shapeLead) });
}));

r.post('/leads', handle(async (req, res) => {
  const body = leadBody.parse(req.body);
  const lead = await prisma.opsLead.create({ data: { ...body, contactedOn: dateOnly(body.contactedOn) }, select: leadSelect });
  await writeAudit(actorOf(req), { action: 'LEAD_CREATED', entityType: 'OpsLead', entityId: lead.id, newValue: body });
  res.status(201).json({ ok: true, data: shapeLead(lead) });
}));

r.patch('/leads/:id', handle(async (req, res) => {
  const body = leadBody.partial().parse(req.body);
  const before = await prisma.opsLead.findUnique({ where: { id: req.params.id }, select: leadSelect });
  if (!before) fail(404, 'Lead not found');
  const lead = await prisma.opsLead.update({
    where: { id: before.id },
    data: { ...body, ...(body.contactedOn ? { contactedOn: dateOnly(body.contactedOn) } : {}) },
    select: leadSelect,
  });
  const { oldValue, newValue, changed } = diff(shapeLead(before) as Record<string, unknown>, body as Record<string, unknown>);
  if (changed) await writeAudit(actorOf(req), { action: 'LEAD_UPDATED', entityType: 'OpsLead', entityId: lead.id, oldValue, newValue });
  res.json({ ok: true, data: shapeLead(lead) });
}));

r.delete('/leads/:id', handle(async (req, res) => {
  const lead = await prisma.opsLead.findUnique({ where: { id: req.params.id }, select: leadSelect });
  if (!lead) fail(404, 'Lead not found');
  await prisma.opsLead.delete({ where: { id: lead.id } });
  await writeAudit(actorOf(req), { action: 'LEAD_DELETED', entityType: 'OpsLead', entityId: lead.id, oldValue: shapeLead(lead) });
  res.json({ ok: true, data: { id: lead.id, deleted: true } });
}));

// A won lead becomes a client: approved, no portal login until they set one,
// the same as a client added on the Clients screen. The lead keeps the link.
r.post('/leads/:id/convert', handle(async (req, res) => {
  const body = z.object({
    email: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.string().trim().toLowerCase().email().max(200).optional()),
  }).parse(req.body ?? {});
  const actor = actorOf(req);
  const lead = await prisma.opsLead.findUnique({ where: { id: req.params.id } });
  if (!lead) fail(404, 'Lead not found');
  if (lead.clientId) fail(409, 'This lead is already a client.', { clientId: lead.clientId });
  const email = body.email || lead.contactEmail;
  if (!email) fail(400, 'Add the contact email first: a client needs one.');
  const existing = await prisma.client.findUnique({ where: { email }, select: { id: true, companyName: true } });
  if (existing) fail(409, `${existing.companyName} already uses this email. Open that client instead.`, { existingClientId: existing.id });

  const passwordHash = await unusablePasswordHash();
  const client = await prisma.$transaction(async (tx) => {
    const created = await tx.client.create({
      data: {
        companyName: lead.company, contactName: lead.contactName || lead.company, email, phone: lead.contactPhone,
        adminNotes: lead.notes, passwordHash, status: 'APPROVED', approvedAt: new Date(), approvedBy: actor,
      },
      select: { id: true, companyName: true },
    });
    await tx.opsLead.update({ where: { id: lead.id }, data: { clientId: created.id, stage: 'WON' } });
    await writeAudit(actor, { action: 'LEAD_CONVERTED', entityType: 'OpsLead', entityId: lead.id, newValue: { clientId: created.id } }, tx);
    await writeAudit(actor, { action: 'CLIENT_CREATED', entityType: 'Client', entityId: created.id, newValue: { fromLead: lead.id, companyName: lead.company, email } }, tx);
    return created;
  });
  res.status(201).json({ ok: true, data: { clientId: client.id, companyName: client.companyName } });
}));

// ── Rota ──────────────────────────────────────────────────────────────────
// One week, Monday to Sunday: people down, days across, from the same
// assignment rows the Bookings screen and the worker app use. Bookings with
// places still to fill are listed per day underneath.

const ROTA_HIDDEN: BookingStatus[] = ['CANCELLED', 'REJECTED'];

r.get('/rota', handle(async (req, res) => {
  const q = z.object({ week: ymd.optional() }).parse(req.query);
  const monday = weekStartKey(q.week || londonDateKey(new Date()));
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  // A day either side, then bucketed by London date, so an older row stored
  // at a London local time is not lost across the UTC boundary.
  const from = dateOnly(addDays(monday, -1));
  const to = dateOnly(addDays(monday, 8));

  const [rows, bookings] = await Promise.all([
    prisma.booking.findMany({
      where: { eventDate: { gte: from, lt: to }, status: { notIn: ROTA_HIDDEN } },
      orderBy: [{ eventDate: 'asc' }, { shiftStart: 'asc' }],
      select: {
        id: true, eventDate: true, shiftStart: true, shiftEnd: true, role: true, venue: true, status: true,
        staff: { select: { id: true, firstName: true, lastName: true } },
        opsBooking: { select: { id: true, reference: true } },
        client: { select: { companyName: true } },
      },
    }),
    prisma.opsBooking.findMany({
      where: { eventDate: { gte: dateOnly(monday), lte: dateOnly(days[6]) }, status: { not: 'CANCELLED' } },
      orderBy: [{ eventDate: 'asc' }, { startTime: 'asc' }],
      select: {
        id: true, reference: true, eventDate: true, startTime: true, expectedFinish: true, venue: true, status: true,
        client: { select: { companyName: true } },
        requirements: { select: { quantity: true } },
        assignments: { select: { status: true } },
      },
    }),
  ]);

  const people = new Map<string, { id: string; name: string; days: Record<string, unknown[]> }>();
  for (const row of rows) {
    const day = londonDateKey(row.eventDate);
    if (!days.includes(day)) continue;
    const person = people.get(row.staff.id) ?? { id: row.staff.id, name: `${row.staff.firstName} ${row.staff.lastName}`.trim(), days: {} };
    (person.days[day] ??= []).push({
      assignmentId: row.id, start: row.shiftStart, finish: row.shiftEnd, role: row.role, status: row.status,
      venue: row.venue, client: row.client?.companyName ?? null,
      opsBookingId: row.opsBooking?.id ?? null, reference: row.opsBooking?.reference ?? null,
    });
    people.set(row.staff.id, person);
  }

  const shortfalls: Record<string, unknown[]> = {};
  for (const b of bookings) {
    const required = b.requirements.reduce((s, x) => s + x.quantity, 0);
    const filled = b.assignments.filter((a) => FILLING_STATUSES.has(a.status)).length;
    if (required > filled) {
      (shortfalls[dateKey(b.eventDate)] ??= []).push({
        opsBookingId: b.id, reference: b.reference, client: b.client.companyName, venue: b.venue,
        start: b.startTime, finish: b.expectedFinish, required, filled, unfilled: required - filled,
      });
    }
  }

  res.json({
    ok: true,
    data: {
      week: monday, days, previousWeek: addDays(monday, -7), nextWeek: addDays(monday, 7),
      people: [...people.values()].sort((a, b) => a.name.localeCompare(b.name)),
      shortfalls,
    },
  });
}));

// ── Running order ─────────────────────────────────────────────────────────

const scheduleBody = z.object({
  time: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), clock.nullable().optional()),
  title: z.string().trim().min(1).max(200),
  assignee: optionalText(120),
  notes: optionalText(1000),
});

const scheduleSelect = { id: true, time: true, title: true, assignee: true, notes: true } as const;

/** Timed lines in clock order, then untimed notes in the order they were added. */
async function scheduleOf(opsBookingId: string) {
  const items = await prisma.opsScheduleItem.findMany({ where: { opsBookingId }, orderBy: { createdAt: 'asc' }, select: scheduleSelect });
  return [...items.filter((i) => i.time).sort((a, b) => a.time!.localeCompare(b.time!)), ...items.filter((i) => !i.time)];
}

r.get('/bookings/:id/schedule', handle(async (req, res) => {
  const booking = await prisma.opsBooking.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!booking) fail(404, 'Booking not found');
  res.json({ ok: true, data: await scheduleOf(booking.id) });
}));

r.post('/bookings/:id/schedule', handle(async (req, res) => {
  const body = scheduleBody.parse(req.body);
  const booking = await prisma.opsBooking.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!booking) fail(404, 'Booking not found');
  const item = await prisma.opsScheduleItem.create({ data: { ...body, opsBookingId: booking.id }, select: scheduleSelect });
  await writeAudit(actorOf(req), { action: 'RUNNING_ORDER_CHANGED', entityType: 'OpsBooking', entityId: booking.id, newValue: { added: item } });
  res.status(201).json({ ok: true, data: await scheduleOf(booking.id) });
}));

r.patch('/schedule/:id', handle(async (req, res) => {
  const body = scheduleBody.partial().parse(req.body);
  const before = await prisma.opsScheduleItem.findUnique({ where: { id: req.params.id } });
  if (!before) fail(404, 'Running order line not found');
  const item = await prisma.opsScheduleItem.update({ where: { id: before.id }, data: body, select: scheduleSelect });
  if (diff(before as Record<string, unknown>, body as Record<string, unknown>).changed) {
    await writeAudit(actorOf(req), { action: 'RUNNING_ORDER_CHANGED', entityType: 'OpsBooking', entityId: before.opsBookingId, oldValue: { title: before.title, time: before.time }, newValue: { updated: item } });
  }
  res.json({ ok: true, data: await scheduleOf(before.opsBookingId) });
}));

r.delete('/schedule/:id', handle(async (req, res) => {
  const before = await prisma.opsScheduleItem.findUnique({ where: { id: req.params.id } });
  if (!before) fail(404, 'Running order line not found');
  await prisma.opsScheduleItem.delete({ where: { id: before.id } });
  await writeAudit(actorOf(req), { action: 'RUNNING_ORDER_CHANGED', entityType: 'OpsBooking', entityId: before.opsBookingId, oldValue: { removed: { title: before.title, time: before.time } } });
  res.json({ ok: true, data: await scheduleOf(before.opsBookingId) });
}));

export default r;
