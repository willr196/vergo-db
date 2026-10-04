/**
 * VERGO Ops: clients/hirers, bookings, requirements, assignments and
 * timesheets. An assignment is an existing Booking row tied to an Ops
 * booking, so the worker app, check-in/out and the old admin screens all
 * keep seeing the same shift.
 */

import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../prisma';
import { writeAudit, actorOf, diff } from '../../ops/audit';
import {
  loadWorker, opsBookingInclude, shapeOpsBooking, shapeAssignment, assignmentInclude, nextBookingReference,
  staffingOf, netWorkedHours, unusablePasswordHash, toNum, ensureDefaultTemplates, type OpsBookingRow,
} from '../../ops/service';
import { assignmentWarnings, canProceed, findOverlaps, type ExistingShift } from '../../ops/assignments';
import { shiftInterval, dateKey, londonDateKey } from '../../ops/time';
import { shiftHours } from '../../lib/money';
import { PRICING, ON_COSTS } from '../../config/pricing';
import { STATUS_TRANSITIONS } from '../adminBookings';
import { renderTemplate, needsWording } from '../../ops/documents';
import { companyValues } from './workers';
import { handle, fail, ymd, clock, optionalText, money, dateOnly } from './common';
import { MIN_RATE } from '../../site/settings';

const r = Router();

// ── Clients / hirers ──────────────────────────────────────────────────────

const CLIENT_TYPES = ['BUSINESS_HIRER', 'PRIVATE_CONSUMER', 'AGENCY', 'VENUE', 'CATERER', 'PRODUCTION', 'OTHER'] as const;

const clientSelect = {
  id: true, companyName: true, tradingName: true, contactName: true, email: true, phone: true,
  billingAddress: true, address: true, venueAddresses: true, industry: true, paymentTerms: true,
  clientType: true, adminNotes: true, termsVersion: true, termsSentAt: true, termsAcceptedAt: true,
  termsAcceptedBy: true, status: true, createdAt: true,
} satisfies Prisma.ClientSelect;

async function currentB2bTermsVersion() {
  const terms = await prisma.termsVersion.findFirst({ where: { publishedAt: { not: null } }, orderBy: { publishedAt: 'desc' }, select: { version: true } });
  return terms?.version ?? null;
}

r.get('/clients', handle(async (req, res) => {
  const q = z.object({ search: z.string().max(100).optional(), type: z.enum(CLIENT_TYPES).optional() }).parse(req.query);
  const clients = await prisma.client.findMany({
    where: {
      ...(q.type ? { clientType: q.type } : {}),
      ...(q.search ? { OR: [
        { companyName: { contains: q.search, mode: 'insensitive' } },
        { tradingName: { contains: q.search, mode: 'insensitive' } },
        { contactName: { contains: q.search, mode: 'insensitive' } },
        { email: { contains: q.search, mode: 'insensitive' } },
      ] } : {}),
    },
    select: { ...clientSelect, _count: { select: { opsBookings: true } } },
    orderBy: { companyName: 'asc' },
    take: 500,
  });
  res.json({ ok: true, data: { clients, currentTermsVersion: await currentB2bTermsVersion() } });
}));

const clientBody = z.object({
  companyName: z.string().trim().min(1).max(200),
  tradingName: optionalText(200),
  contactName: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  phone: optionalText(40),
  billingAddress: optionalText(500),
  venueAddresses: z.array(z.string().trim().min(1).max(300)).max(30).optional(),
  industry: optionalText(200),
  paymentTerms: optionalText(200),
  clientType: z.enum(CLIENT_TYPES),
  adminNotes: optionalText(2000),
});

// Clients created here have no portal login until they set one through the
// normal password reset, and are approved because the office added them.
r.post('/clients', handle(async (req, res) => {
  const body = clientBody.parse(req.body);
  const actor = actorOf(req);
  const existing = await prisma.client.findUnique({ where: { email: body.email }, select: { id: true, companyName: true } });
  if (existing) fail(409, `${existing.companyName} already uses this email. Open that client instead.`, { existingClientId: existing.id });
  const client = await prisma.client.create({
    data: {
      ...body, venueAddresses: body.venueAddresses ?? [], passwordHash: await unusablePasswordHash(),
      status: 'APPROVED', approvedAt: new Date(), approvedBy: actor,
    },
    select: clientSelect,
  });
  await writeAudit(actor, { action: 'CLIENT_CREATED', entityType: 'Client', entityId: client.id, newValue: body });
  res.status(201).json({ ok: true, data: client });
}));

r.get('/clients/:id', handle(async (req, res) => {
  const client = await prisma.client.findUnique({ where: { id: req.params.id }, select: clientSelect });
  if (!client) fail(404, 'Client not found');
  const [bookings, audit] = await Promise.all([
    prisma.opsBooking.findMany({ where: { clientId: client.id }, orderBy: { eventDate: 'desc' }, take: 50, select: { id: true, reference: true, eventDate: true, status: true, venue: true, eventType: true } }),
    prisma.auditLog.findMany({ where: { entityType: 'Client', entityId: client.id }, orderBy: { at: 'desc' }, take: 50 }),
  ]);
  res.json({ ok: true, data: { ...client, bookings: bookings.map((b) => ({ ...b, eventDate: dateKey(b.eventDate) })), audit, currentTermsVersion: await currentB2bTermsVersion() } });
}));

r.patch('/clients/:id', handle(async (req, res) => {
  const body = clientBody.partial().parse(req.body);
  const actor = actorOf(req);
  const before = await prisma.client.findUnique({ where: { id: req.params.id }, select: clientSelect });
  if (!before) fail(404, 'Client not found');
  if (body.email && body.email !== before.email) {
    const clash = await prisma.client.findUnique({ where: { email: body.email }, select: { id: true } });
    if (clash) fail(409, 'Another client already uses this email.');
  }
  const client = await prisma.client.update({ where: { id: before.id }, data: body, select: clientSelect });
  const changes = diff(before as unknown as Record<string, unknown>, body);
  if (changes.changed) await writeAudit(actor, { action: 'CLIENT_UPDATED', entityType: 'Client', entityId: client.id, ...changes });
  res.json({ ok: true, data: client });
}));

const termsBody = z.object({
  action: z.enum(['sent', 'accepted']),
  version: z.string().trim().min(1).max(40),
  date: ymd,
  acceptedBy: optionalText(200),
  /** Private consumers only: confirms these are the separate consumer booking terms. */
  consumerTerms: z.boolean().optional(),
});

r.post('/clients/:id/terms', handle(async (req, res) => {
  const body = termsBody.parse(req.body);
  const actor = actorOf(req);
  const client = await prisma.client.findUnique({ where: { id: req.params.id }, select: clientSelect });
  if (!client) fail(404, 'Client not found');

  if (client.clientType === 'PRIVATE_CONSUMER') {
    const b2b = await currentB2bTermsVersion();
    if (!body.consumerTerms || (b2b && body.version === b2b)) {
      fail(400, 'This client is a private consumer. The B2B Terms of Business do not apply; record the separate consumer booking terms and tick that they are consumer terms.');
    }
  }
  if (body.action === 'accepted' && !body.acceptedBy) fail(400, 'Record who accepted the terms.');
  if (body.date > londonDateKey(new Date())) fail(400, 'Date cannot be in the future.');

  const data = body.action === 'sent'
    ? { termsVersion: body.version, termsSentAt: dateOnly(body.date) }
    : { termsVersion: body.version, termsAcceptedAt: dateOnly(body.date), termsAcceptedBy: body.acceptedBy ?? null };
  const updated = await prisma.client.update({ where: { id: client.id }, data, select: clientSelect });
  await writeAudit(actor, {
    action: body.action === 'sent' ? 'CLIENT_TERMS_SENT' : 'CLIENT_TERMS_ACCEPTED',
    entityType: 'Client', entityId: client.id,
    oldValue: { termsVersion: client.termsVersion, termsSentAt: client.termsSentAt, termsAcceptedAt: client.termsAcceptedAt },
    newValue: { ...data, consumerTerms: body.consumerTerms ?? false },
  });
  res.json({ ok: true, data: updated });
}));

// ── Bookings ──────────────────────────────────────────────────────────────

const OPS_STATUSES = ['DRAFT', 'QUOTED', 'CONFIRMED', 'STAFFING', 'FULLY_STAFFED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'INVOICED', 'PAID'] as const;

const listBookings = z.object({
  from: ymd.optional(),
  to: ymd.optional(),
  clientId: z.string().optional(),
  venue: z.string().max(200).optional(),
  status: z.enum(OPS_STATUSES).optional(),
  staffed: z.enum(['full', 'not_full']).optional(),
  minMargin: z.coerce.number().min(-10).max(1).optional(),
  maxMargin: z.coerce.number().min(-10).max(1).optional(),
  eventType: z.string().max(120).optional(),
  search: z.string().max(100).optional(),
});

export async function loadOpsBookings(where: Prisma.OpsBookingWhereInput) {
  const rows = await prisma.opsBooking.findMany({ where, include: opsBookingInclude, orderBy: [{ eventDate: 'asc' }, { startTime: 'asc' }], take: 1000 });
  return rows.map(shapeOpsBooking);
}

r.get('/bookings', handle(async (req, res) => {
  const q = listBookings.parse(req.query);
  const where: Prisma.OpsBookingWhereInput = {
    ...(q.from || q.to ? { eventDate: { ...(q.from ? { gte: dateOnly(q.from) } : {}), ...(q.to ? { lte: dateOnly(q.to) } : {}) } } : {}),
    ...(q.clientId ? { clientId: q.clientId } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.venue ? { venue: { contains: q.venue, mode: 'insensitive' } } : {}),
    ...(q.eventType ? { eventType: { contains: q.eventType, mode: 'insensitive' } } : {}),
    ...(q.search ? { OR: [
      { reference: { contains: q.search, mode: 'insensitive' } },
      { venue: { contains: q.search, mode: 'insensitive' } },
      { client: { companyName: { contains: q.search, mode: 'insensitive' } } },
    ] } : {}),
  };
  const bookings = (await loadOpsBookings(where)).filter((b) => {
    if (q.staffed === 'full' && !b.staffing.fullyStaffed) return false;
    if (q.staffed === 'not_full' && b.staffing.fullyStaffed) return false;
    if (q.minMargin != null && !(b.profit.grossMargin != null && b.profit.grossMargin >= q.minMargin)) return false;
    if (q.maxMargin != null && !(b.profit.grossMargin != null && b.profit.grossMargin <= q.maxMargin)) return false;
    return true;
  });
  res.json({ ok: true, data: bookings });
}));

const bookingBody = z.object({
  clientId: z.string().min(1),
  quoteRequestId: z.string().optional().nullable(),
  bookingType: optionalText(80),
  eventType: optionalText(120),
  venue: optionalText(200),
  address: optionalText(500),
  eventDate: ymd,
  startTime: clock,
  expectedFinish: clock,
  actualFinish: clock.nullable().optional(),
  guestNumbers: z.number().int().min(0).max(100000).nullable().optional(),
  onSiteContactName: optionalText(120),
  onSiteContactPhone: optionalText(40),
  vergoLead: optionalText(120),
  status: z.enum(OPS_STATUSES).optional(),
  notes: optionalText(4000),
});

async function getOpsBooking(id: string): Promise<OpsBookingRow> {
  const booking = await prisma.opsBooking.findUnique({ where: { id }, include: opsBookingInclude });
  if (!booking) fail(404, 'Booking not found');
  return booking;
}

function bookingWarnings(b: ReturnType<typeof shapeOpsBooking>) {
  const warnings: string[] = [];
  if (b.consumerTermsRequired) warnings.push('Private consumer booking: the B2B Terms of Business do not apply. Separate consumer booking terms are required.');
  else if (b.client.clientType === 'BUSINESS_HIRER' && !b.client.termsAcceptedAt) warnings.push('This hirer has not accepted the Terms of Business.');
  if (b.staffing.unfilled > 0 && !['CANCELLED', 'COMPLETED', 'INVOICED', 'PAID'].includes(b.status)) warnings.push(`${b.staffing.unfilled} slot(s) unfilled.`);
  return warnings;
}

r.post('/bookings', handle(async (req, res) => {
  const body = bookingBody.parse(req.body);
  const actor = actorOf(req);
  const client = await prisma.client.findUnique({ where: { id: body.clientId }, select: { id: true, clientType: true, termsVersion: true, termsAcceptedAt: true } });
  if (!client) fail(404, 'Client not found');
  if (body.status && ['INVOICED', 'PAID'].includes(body.status)) fail(400, 'Use the invoice and paid actions for those statuses.');

  const consumer = client.clientType === 'PRIVATE_CONSUMER';
  let created: { id: string } | null = null;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    const reference = await nextBookingReference(Number(body.eventDate.slice(0, 4)));
    try {
      created = await prisma.opsBooking.create({
        data: {
          ...body,
          eventDate: dateOnly(body.eventDate),
          quoteRequestId: body.quoteRequestId || null,
          reference,
          consumerTermsRequired: consumer,
          termsVersionAtBooking: !consumer && client.termsAcceptedAt ? client.termsVersion : null,
        },
        select: { id: true },
      });
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;
    }
  }
  if (!created) fail(500, 'Could not allocate a booking reference, try again.');
  await writeAudit(actor, { action: 'BOOKING_CREATED', entityType: 'OpsBooking', entityId: created.id, newValue: body });
  const shaped = shapeOpsBooking(await getOpsBooking(created.id));
  res.status(201).json({ ok: true, data: { ...shaped, warnings: bookingWarnings(shaped) } });
}));

r.get('/bookings/:id', handle(async (req, res) => {
  const shaped = shapeOpsBooking(await getOpsBooking(req.params.id));
  const audit = await prisma.auditLog.findMany({ where: { entityType: 'OpsBooking', entityId: shaped.id }, orderBy: { at: 'desc' }, take: 100 });
  res.json({ ok: true, data: { ...shaped, warnings: bookingWarnings(shaped), audit } });
}));

r.patch('/bookings/:id', handle(async (req, res) => {
  const body = bookingBody.omit({ clientId: true }).partial().parse(req.body);
  const actor = actorOf(req);
  const before = await getOpsBooking(req.params.id);
  if (body.status && ['INVOICED', 'PAID'].includes(body.status)) fail(400, 'Use the invoice and paid actions for those statuses.');

  const data: Prisma.OpsBookingUpdateInput = { ...body, ...(body.eventDate ? { eventDate: dateOnly(body.eventDate) } : {}) };
  delete (data as any).quoteRequestId;

  await prisma.$transaction(async (tx) => {
    await tx.opsBooking.update({ where: { id: before.id }, data });
    // Cancelling the booking cancels its live assignments, so the workers'
    // app and the timesheet list stop showing a shift that is not happening.
    if (body.status === 'CANCELLED' && before.status !== 'CANCELLED') {
      const live = before.assignments.filter((a) => a.status === 'PENDING' || a.status === 'CONFIRMED');
      if (live.length) {
        await tx.booking.updateMany({ where: { id: { in: live.map((a) => a.id) } }, data: { status: 'CANCELLED' } });
        await writeAudit(actor, {
          action: 'ASSIGNMENT_CHANGED', entityType: 'OpsBooking', entityId: before.id,
          newValue: { cancelled: live.map((a) => a.id) }, reason: 'Booking cancelled',
        }, tx);
      }
    }
    const comparable = { ...before, eventDate: dateKey(before.eventDate) } as unknown as Record<string, unknown>;
    const changes = diff(comparable, body as Record<string, unknown>);
    if (changes.changed) {
      await writeAudit(actor, {
        action: body.status && body.status !== before.status ? 'BOOKING_STATUS_CHANGED' : 'BOOKING_UPDATED',
        entityType: 'OpsBooking', entityId: before.id, ...changes,
      }, tx);
    }
  });
  const shaped = shapeOpsBooking(await getOpsBooking(before.id));
  res.json({ ok: true, data: { ...shaped, warnings: bookingWarnings(shaped) } });
}));

/** Move a live booking between Confirmed / Staffing / Fully staffed as its assignments change. */
async function syncStaffingStatus(bookingId: string, actor: string) {
  const booking = await getOpsBooking(bookingId);
  if (!['CONFIRMED', 'STAFFING', 'FULLY_STAFFED'].includes(booking.status)) return;
  const staffing = staffingOf(booking);
  const target = staffing.fullyStaffed ? 'FULLY_STAFFED' : staffing.filled > 0 ? 'STAFFING' : 'CONFIRMED';
  if (target === booking.status) return;
  await prisma.opsBooking.update({ where: { id: booking.id }, data: { status: target } });
  await writeAudit(actor, {
    action: 'BOOKING_STATUS_CHANGED', entityType: 'OpsBooking', entityId: booking.id,
    oldValue: { status: booking.status }, newValue: { status: target }, reason: 'Automatic: staffing changed',
  });
}

// ── Requirements ──────────────────────────────────────────────────────────

const requirementBody = z.object({
  role: z.string().trim().min(1).max(80),
  quantity: z.number().int().min(1).max(500),
  clientChargeRate: money,
  workerPayRate: money,
  minimumHours: z.number().min(0).max(24).nullable().optional(),
  afterMidnightMultiplier: z.number().min(1).max(3).nullable().optional(),
  travelContribution: money.nullable().optional(),
  expenses: money.nullable().optional(),
  breakMins: z.number().int().min(0).max(240).optional(),
  requiredExperience: optionalText(500),
  requiredQualifications: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  dressCode: optionalText(500),
  equipment: optionalText(500),
  duties: optionalText(2000),
  healthSafetyRisks: optionalText(2000),
  riskControls: optionalText(2000),
  breakInfo: optionalText(500),
});

r.post('/bookings/:id/requirements', handle(async (req, res) => {
  const body = requirementBody.parse(req.body);
  const actor = actorOf(req);
  const booking = await getOpsBooking(req.params.id);
  const reqRow = await prisma.opsRequirement.create({ data: { ...body, opsBookingId: booking.id, afterMidnightMultiplier: body.afterMidnightMultiplier ?? PRICING.afterMidnightMultiplier } });
  await writeAudit(actor, { action: 'REQUIREMENT_ADDED', entityType: 'OpsBooking', entityId: booking.id, newValue: { requirementId: reqRow.id, ...body } });
  await syncStaffingStatus(booking.id, actor);
  res.status(201).json({ ok: true, data: shapeOpsBooking(await getOpsBooking(booking.id)) });
}));

r.patch('/requirements/:id', handle(async (req, res) => {
  const body = requirementBody.partial().parse(req.body);
  const actor = actorOf(req);
  const before = await prisma.opsRequirement.findUnique({ where: { id: req.params.id } });
  if (!before) fail(404, 'Requirement not found');
  await prisma.opsRequirement.update({ where: { id: before.id }, data: body });
  const changes = diff(before as unknown as Record<string, unknown>, body as Record<string, unknown>);
  if (changes.changed) {
    const rateChanged = 'clientChargeRate' in changes.newValue || 'workerPayRate' in changes.newValue;
    await writeAudit(actor, {
      action: rateChanged ? 'RATE_CHANGED' : 'REQUIREMENT_UPDATED', entityType: 'OpsBooking', entityId: before.opsBookingId,
      ...changes, reason: rateChanged ? 'Requirement rates changed; existing assignments keep their own rates' : null,
    });
  }
  await syncStaffingStatus(before.opsBookingId, actor);
  res.json({ ok: true, data: shapeOpsBooking(await getOpsBooking(before.opsBookingId)) });
}));

r.delete('/requirements/:id', handle(async (req, res) => {
  const actor = actorOf(req);
  const reqRow = await prisma.opsRequirement.findUnique({ where: { id: req.params.id }, include: { _count: { select: { assignments: true } } } });
  if (!reqRow) fail(404, 'Requirement not found');
  if (reqRow._count.assignments > 0) fail(409, 'This requirement has assignments. Cancel or move them first.');
  await prisma.opsRequirement.delete({ where: { id: reqRow.id } });
  await writeAudit(actor, { action: 'REQUIREMENT_REMOVED', entityType: 'OpsBooking', entityId: reqRow.opsBookingId, oldValue: reqRow });
  await syncStaffingStatus(reqRow.opsBookingId, actor);
  res.json({ ok: true, data: shapeOpsBooking(await getOpsBooking(reqRow.opsBookingId)) });
}));

// ── Costs, charges and actual payroll ─────────────────────────────────────

const COST_CATEGORIES = ['equipment', 'costume', 'food_drink', 'supplier', 'worker_other', 'other', 'charge'] as const;

r.post('/bookings/:id/costs', handle(async (req, res) => {
  const body = z.object({
    kind: z.enum(['CHARGE', 'COST']),
    category: z.enum(COST_CATEGORIES),
    description: z.string().trim().min(2).max(300),
    amount: z.number().positive().max(1_000_000),
  }).parse(req.body);
  const actor = actorOf(req);
  const booking = await getOpsBooking(req.params.id);
  const cost = await prisma.opsBookingCost.create({
    data: { opsBookingId: booking.id, kind: body.kind, category: body.kind === 'CHARGE' ? 'charge' : body.category, description: body.description, amountPence: Math.round(body.amount * 100), createdBy: actor },
  });
  await writeAudit(actor, { action: body.kind === 'CHARGE' ? 'CHARGE_ADDED' : 'COST_ADDED', entityType: 'OpsBooking', entityId: booking.id, newValue: cost });
  res.status(201).json({ ok: true, data: shapeOpsBooking(await getOpsBooking(booking.id)) });
}));

r.delete('/costs/:id', handle(async (req, res) => {
  const actor = actorOf(req);
  const cost = await prisma.opsBookingCost.findUnique({ where: { id: req.params.id } });
  if (!cost) fail(404, 'Cost not found');
  await prisma.opsBookingCost.delete({ where: { id: cost.id } });
  await writeAudit(actor, { action: 'COST_REMOVED', entityType: 'OpsBooking', entityId: cost.opsBookingId, oldValue: cost });
  res.json({ ok: true, data: shapeOpsBooking(await getOpsBooking(cost.opsBookingId)) });
}));

const pence = z.number().int().min(0).max(100_000_000).nullable();

r.post('/bookings/:id/actual-payroll', handle(async (req, res) => {
  const body = z.object({
    wagesPence: pence, holidayPayPence: pence, employerCostsPence: pence,
    note: z.string().trim().min(5).max(500),
  }).parse(req.body);
  const actor = actorOf(req);
  const booking = await getOpsBooking(req.params.id);
  const before = shapeOpsBooking(booking).profit;
  await prisma.opsBooking.update({
    where: { id: booking.id },
    data: {
      actualWagesPence: body.wagesPence, actualHolidayPayPence: body.holidayPayPence, actualEmployerCostsPence: body.employerCostsPence,
      actualPayrollNote: body.note, actualPayrollRecordedBy: actor, actualPayrollRecordedAt: new Date(),
    },
  });
  await writeAudit(actor, {
    action: 'PROFIT_OVERRIDE', entityType: 'OpsBooking', entityId: booking.id,
    oldValue: {
      wagesPence: booking.actualWagesPence ?? before.workerWagesPence,
      holidayPayPence: booking.actualHolidayPayPence ?? before.holidayPayPence,
      employerCostsPence: booking.actualEmployerCostsPence ?? before.employerCostsPence,
      basis: before.basis,
    },
    newValue: body, reason: body.note,
  });
  res.json({ ok: true, data: shapeOpsBooking(await getOpsBooking(booking.id)) });
}));

// Invoicing the Ops booking also stamps its completed shifts, so the existing
// float and pay-run figures see the same invoice.
r.post('/bookings/:id/invoice', handle(async (req, res) => {
  const { invoiceRef } = z.object({ invoiceRef: z.string().trim().min(1).max(80) }).parse(req.body);
  const actor = actorOf(req);
  const booking = await getOpsBooking(req.params.id);
  if (booking.invoicedAt) fail(409, 'Already invoiced.');
  if (booking.status === 'CANCELLED') fail(409, 'A cancelled booking cannot be invoiced.');
  const unfinished = booking.assignments.filter((a) => a.status === 'PENDING' || a.status === 'CONFIRMED');
  if (unfinished.length) fail(409, `${unfinished.length} assignment(s) are not completed yet. Approve their timesheets first.`);
  const now = new Date();
  const payDue = new Date(now.getTime() + 14 * 86400000);
  await prisma.$transaction(async (tx) => {
    await tx.opsBooking.update({ where: { id: booking.id }, data: { invoiceRef, invoicedAt: now, status: 'INVOICED' } });
    await tx.booking.updateMany({
      where: { opsBookingId: booking.id, status: 'COMPLETED', invoicedAt: null },
      data: { invoicedAt: now, staffPayDueAt: payDue, invoiceRef },
    });
    await writeAudit(actor, { action: 'BOOKING_STATUS_CHANGED', entityType: 'OpsBooking', entityId: booking.id, oldValue: { status: booking.status }, newValue: { status: 'INVOICED', invoiceRef } }, tx);
  });
  res.json({ ok: true, data: shapeOpsBooking(await getOpsBooking(booking.id)) });
}));

r.post('/bookings/:id/paid', handle(async (req, res) => {
  const actor = actorOf(req);
  const booking = await getOpsBooking(req.params.id);
  if (!booking.invoicedAt) fail(409, 'Invoice the booking first.');
  if (booking.paidAt) fail(409, 'Payment already recorded.');
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.opsBooking.update({ where: { id: booking.id }, data: { paidAt: now, status: 'PAID' } });
    await tx.booking.updateMany({ where: { opsBookingId: booking.id, invoicedAt: { not: null }, clientPaidAt: null }, data: { clientPaidAt: now } });
    await writeAudit(actor, { action: 'BOOKING_STATUS_CHANGED', entityType: 'OpsBooking', entityId: booking.id, oldValue: { status: booking.status }, newValue: { status: 'PAID' } }, tx);
  });
  res.json({ ok: true, data: shapeOpsBooking(await getOpsBooking(booking.id)) });
}));

// ── Assignments ───────────────────────────────────────────────────────────

const LIVE = ['PENDING', 'CONFIRMED'] as const;

/** Readiness items that assignmentWarnings does not already raise on its own. */
const COVERED_ELSEWHERE = /right to work|right-to-work|zero-hours agreement|key information document|not active/i;

async function warningsFor(workerId: string, date: string, start: string, finish: string, requirement: { role: string; requiredQualifications: string[] } | null, excludeId?: string, rates?: { payRate: number | null; chargeRate: number | null }) {
  const worker = await loadWorker(workerId);
  if (!worker) fail(404, 'Worker not found');
  const candidate = shiftInterval(date, start, finish);
  const nearby = await prisma.booking.findMany({
    where: {
      staffId: workerId,
      status: { in: [...LIVE] },
      ...(excludeId ? { id: { not: excludeId } } : {}),
      eventDate: { gte: dateOnly(dateKey(new Date(Date.parse(`${date}T00:00:00Z`) - 86400000))), lte: dateOnly(dateKey(new Date(Date.parse(`${date}T00:00:00Z`) + 86400000))) },
    },
    select: { id: true, eventDate: true, shiftStart: true, shiftEnd: true, venue: true, location: true },
  });
  const others: ExistingShift[] = nearby.flatMap((b) => {
    try {
      return [{ id: b.id, label: `${dateKey(b.eventDate)} ${b.shiftStart}-${b.shiftEnd} ${b.venue ?? b.location}`, ...shiftInterval(dateKey(b.eventDate), b.shiftStart, b.shiftEnd) }];
    } catch { return []; }
  });
  const windows = await prisma.availability.findMany({ where: { userId: workerId }, select: { dateFrom: true, dateTo: true } });
  const warnings = assignmentWarnings({
    rtwStatus: worker.rtw.status,
    contractStatus: worker.contract.status,
    kidStatus: worker.kid.status,
    activeStatus: worker.activeStatus,
    availabilityStatus: worker.usesApp ? worker.availabilityStatus : null,
    availabilityWindows: windows.map((w) => ({ from: dateKey(w.dateFrom), to: dateKey(w.dateTo) })),
    shiftDate: date,
    overlaps: findOverlaps(candidate, others),
    requiredRole: requirement?.role ?? null,
    workerRoles: worker.roles,
    requiredQualifications: requirement?.requiredQualifications ?? [],
    workerQualifications: worker.qualifications,
    payRate: rates?.payRate ?? null,
    chargeRate: rates?.chargeRate ?? null,
    payFloor: MIN_RATE,
    otherMissing: worker.readiness.ready ? [] : worker.readiness.missing.filter((m) => !COVERED_ELSEWHERE.test(m)),
  });
  return { worker, warnings };
}

const assignBody = z.object({
  requirementId: z.string().min(1),
  workerId: z.string().min(1),
  status: z.enum(LIVE).default('PENDING'),
  plannedStart: clock.optional(),
  plannedFinish: clock.optional(),
  payRate: money.optional(),
  clientChargeRate: money.optional(),
  holidayPayMethod: z.enum(['ROLLED_UP', 'ACCRUED']).default('ROLLED_UP'),
  overrideReason: optionalText(500),
});

r.post('/bookings/:id/assignments/check', handle(async (req, res) => {
  const body = assignBody.parse(req.body);
  const booking = await getOpsBooking(req.params.id);
  const requirement = booking.requirements.find((x) => x.id === body.requirementId);
  if (!requirement) fail(404, 'Requirement not found on this booking');
  const { warnings } = await warningsFor(body.workerId, dateKey(booking.eventDate), body.plannedStart ?? booking.startTime, body.plannedFinish ?? booking.expectedFinish, requirement, undefined,
    { payRate: body.payRate ?? Number(requirement.workerPayRate), chargeRate: body.clientChargeRate ?? Number(requirement.clientChargeRate) });
  res.json({ ok: true, data: { warnings, ...canProceed(warnings, body.overrideReason) } });
}));

r.post('/bookings/:id/assignments', handle(async (req, res) => {
  const body = assignBody.parse(req.body);
  const actor = actorOf(req);
  const booking = await getOpsBooking(req.params.id);
  if (['CANCELLED', 'INVOICED', 'PAID'].includes(booking.status)) fail(409, `Booking is ${booking.status.toLowerCase()}.`);
  const requirement = booking.requirements.find((x) => x.id === body.requirementId);
  if (!requirement) fail(404, 'Requirement not found on this booking');
  if (booking.assignments.some((a) => a.staffId === body.workerId && a.requirementId === requirement.id && (LIVE as readonly string[]).includes(a.status))) {
    fail(409, 'This worker is already on this requirement.');
  }

  const date = dateKey(booking.eventDate);
  const start = body.plannedStart ?? booking.startTime;
  const finish = body.plannedFinish ?? booking.expectedFinish;
  const payRate = body.payRate ?? Number(requirement.workerPayRate);
  const chargeRate = body.clientChargeRate ?? Number(requirement.clientChargeRate);
  const { worker, warnings } = await warningsFor(body.workerId, date, start, finish, requirement, undefined, { payRate, chargeRate });
  const verdict = canProceed(warnings, body.overrideReason);
  if (!verdict.ok) fail(409, verdict.needsReason ? 'Warnings need an override reason.' : 'This assignment is blocked.', { warnings, ...verdict });

  let hours: number;
  try { hours = shiftHours(start, finish, requirement.breakMins); } catch (e: any) { fail(400, e.message); }
  const minimum = toNum(requirement.minimumHours) ?? PRICING.minimumChargeHours;
  const client = await prisma.client.findUniqueOrThrow({ where: { id: booking.clientId }, select: { subscriptionTier: true } });
  const terms = body.status === 'CONFIRMED'
    ? await prisma.termsVersion.findFirst({ where: { publishedAt: { not: null } }, orderBy: { publishedAt: 'desc' }, select: { version: true } })
    : null;

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.booking.create({
      data: {
        clientId: booking.clientId,
        staffId: worker.id,
        opsBookingId: booking.id,
        requirementId: requirement.id,
        quoteRequestId: booking.quoteRequestId,
        role: requirement.role,
        eventName: [booking.reference, booking.eventType].filter(Boolean).join(' '),
        eventDate: booking.eventDate,
        location: booking.address ?? booking.venue ?? 'To be confirmed',
        venue: booking.venue,
        shiftStart: start,
        shiftEnd: finish,
        breakMins: requirement.breakMins,
        hoursEstimated: new Prisma.Decimal(hours),
        clientTierAtBooking: client.subscriptionTier,
        staffTierAtBooking: worker.staffTier ?? 'STANDARD',
        hourlyRateCharged: new Prisma.Decimal(chargeRate),
        staffPayRate: new Prisma.Decimal(payRate),
        totalEstimated: new Prisma.Decimal((chargeRate * Math.max(hours, minimum)).toFixed(2)),
        holidayPayMethod: body.holidayPayMethod,
        status: body.status,
        confirmedAt: body.status === 'CONFIRMED' ? new Date() : null,
        confirmedBy: body.status === 'CONFIRMED' ? actor : null,
        termsVersionAtConfirmation: terms?.version ?? null,
        warningOverrideReason: warnings.length ? body.overrideReason ?? null : null,
      },
    });
    await writeAudit(actor, {
      action: 'ASSIGNMENT_CHANGED', entityType: 'OpsBooking', entityId: booking.id,
      newValue: { assignmentId: row.id, worker: worker.name, role: requirement.role, status: body.status, payRate, chargeRate, warnings: warnings.map((w) => w.code) },
      reason: warnings.length ? body.overrideReason ?? null : null,
    }, tx);
    return row;
  });
  await syncStaffingStatus(booking.id, actor);
  res.status(201).json({ ok: true, data: { assignmentId: created.id, warnings, booking: shapeOpsBooking(await getOpsBooking(booking.id)) } });
}));

const assignmentUpdate = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'NO_SHOW']).optional(),
  plannedStart: clock.optional(),
  plannedFinish: clock.optional(),
  breakMins: z.number().int().min(0).max(240).optional(),
  payRate: money.optional(),
  clientChargeRate: money.optional(),
  holidayPayMethod: z.enum(['ROLLED_UP', 'ACCRUED']).optional(),
  overrideReason: optionalText(500),
  reason: optionalText(500),
});

async function getAssignment(id: string) {
  const row = await prisma.booking.findUnique({ where: { id }, include: assignmentInclude });
  if (!row || !row.opsBookingId) fail(404, 'Assignment not found');
  return row as typeof row & { opsBookingId: string };
}

r.patch('/assignments/:id', handle(async (req, res) => {
  const body = assignmentUpdate.parse(req.body);
  const actor = actorOf(req);
  const before = await getAssignment(req.params.id);
  if (before.status === 'COMPLETED' && (body.payRate != null || body.clientChargeRate != null) && before.invoicedAt) {
    fail(409, 'This shift has been invoiced; rates can no longer change.');
  }
  if (body.status && body.status !== before.status) {
    const allowed = STATUS_TRANSITIONS[before.status] ?? [];
    if (!allowed.includes(body.status)) fail(409, `Cannot move an assignment from ${before.status} to ${body.status}.`);
  }

  const start = body.plannedStart ?? before.shiftStart;
  const finish = body.plannedFinish ?? before.shiftEnd;
  const breakMins = body.breakMins ?? before.breakMins ?? 0;
  let warnings: Awaited<ReturnType<typeof warningsFor>>['warnings'] = [];
  const confirming = body.status === 'CONFIRMED' || (before.status === 'CONFIRMED' && (body.plannedStart || body.plannedFinish));
  if (confirming) {
    ({ warnings } = await warningsFor(before.staffId, dateKey(before.eventDate), start, finish, before.requirement, before.id,
      { payRate: body.payRate ?? toNum(before.staffPayRate), chargeRate: body.clientChargeRate ?? toNum(before.hourlyRateCharged) }));
    const verdict = canProceed(warnings, body.overrideReason);
    if (!verdict.ok) fail(409, verdict.needsReason ? 'Warnings need an override reason.' : 'This assignment is blocked.', { warnings, ...verdict });
  }

  const data: Prisma.BookingUpdateInput = {};
  if (body.status) data.status = body.status;
  if (body.status === 'CONFIRMED') { data.confirmedAt = new Date(); data.confirmedBy = actor; }
  if (body.plannedStart || body.plannedFinish || body.breakMins != null) {
    let hours: number;
    try { hours = shiftHours(start, finish, breakMins); } catch (e: any) { fail(400, e.message); }
    Object.assign(data, { shiftStart: start, shiftEnd: finish, breakMins, hoursEstimated: new Prisma.Decimal(hours) });
  }
  if (body.payRate != null) data.staffPayRate = new Prisma.Decimal(body.payRate);
  if (body.clientChargeRate != null) data.hourlyRateCharged = new Prisma.Decimal(body.clientChargeRate);
  if (body.holidayPayMethod) data.holidayPayMethod = body.holidayPayMethod;
  if (warnings.length) data.warningOverrideReason = body.overrideReason ?? null;

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({ where: { id: before.id }, data });
    const rateChange = body.payRate != null || body.clientChargeRate != null;
    await writeAudit(actor, {
      action: rateChange ? 'RATE_CHANGED' : 'ASSIGNMENT_CHANGED',
      entityType: 'OpsBooking', entityId: before.opsBookingId,
      oldValue: { assignmentId: before.id, status: before.status, start: before.shiftStart, finish: before.shiftEnd, payRate: toNum(before.staffPayRate), chargeRate: toNum(before.hourlyRateCharged) },
      newValue: { assignmentId: before.id, ...body },
      reason: body.reason ?? body.overrideReason ?? null,
    }, tx);
  });
  await syncStaffingStatus(before.opsBookingId, actor);
  res.json({ ok: true, data: shapeOpsBooking(await getOpsBooking(before.opsBookingId)) });
}));

// Swap a worker out: the old row is cancelled and points at the new one.
r.post('/assignments/:id/replace', handle(async (req, res) => {
  const body = z.object({ workerId: z.string().min(1), reason: z.string().trim().min(3).max(500), overrideReason: optionalText(500), status: z.enum(LIVE).default('PENDING') }).parse(req.body);
  const actor = actorOf(req);
  const old = await getAssignment(req.params.id);
  if (!(LIVE as readonly string[]).includes(old.status)) fail(409, 'Only an offered or accepted assignment can be replaced.');
  const booking = await getOpsBooking(old.opsBookingId);
  const date = dateKey(old.eventDate);
  const { worker, warnings } = await warningsFor(body.workerId, date, old.shiftStart, old.shiftEnd, old.requirement, undefined,
    { payRate: toNum(old.staffPayRate), chargeRate: toNum(old.hourlyRateCharged) });
  const verdict = canProceed(warnings, body.overrideReason);
  if (!verdict.ok) fail(409, verdict.needsReason ? 'Warnings need an override reason.' : 'This assignment is blocked.', { warnings, ...verdict });

  await prisma.$transaction(async (tx) => {
    const { id: _id, createdAt: _c, updatedAt: _u, staff: _s, requirement: _r, ...copy } = old as any;
    const replacement = await tx.booking.create({
      data: {
        ...copy,
        staffId: worker.id,
        staffTierAtBooking: worker.staffTier ?? 'STANDARD',
        status: body.status,
        confirmedAt: body.status === 'CONFIRMED' ? new Date() : null,
        confirmedBy: body.status === 'CONFIRMED' ? actor : null,
        checkedInAt: null, checkedOutAt: null, hoursWorked: null, workerShiftNotes: null,
        timesheetClientApprovedAt: null, timesheetClientApprovedBy: null, timesheetAdminApprovedAt: null,
        timesheetAdminApprovedBy: null, timesheetDisputedAt: null, timesheetDisputeReason: null,
        replacedByBookingId: null, templateId: null, rejectionReason: null,
        warningOverrideReason: warnings.length ? body.overrideReason ?? null : null,
      },
    });
    await tx.booking.update({ where: { id: old.id }, data: { status: 'CANCELLED', replacedByBookingId: replacement.id } });
    await writeAudit(actor, {
      action: 'ASSIGNMENT_CHANGED', entityType: 'OpsBooking', entityId: booking.id,
      oldValue: { assignmentId: old.id, worker: `${old.staff.firstName} ${old.staff.lastName}` },
      newValue: { assignmentId: replacement.id, worker: worker.name, replaced: true }, reason: body.reason,
    }, tx);
  });
  await syncStaffingStatus(booking.id, actor);
  res.json({ ok: true, data: shapeOpsBooking(await getOpsBooking(booking.id)) });
}));

// Assignment confirmation, generated from the booking and requirement.
r.post('/assignments/:id/confirmation', handle(async (req, res) => {
  const actor = actorOf(req);
  await ensureDefaultTemplates();
  const a = await getAssignment(req.params.id);
  const booking = await getOpsBooking(a.opsBookingId);
  const template = await prisma.documentTemplate.findFirst({ where: { type: 'ASSIGNMENT_CONFIRMATION', retiredAt: null }, orderBy: { version: 'desc' } });
  if (!template) fail(400, 'No assignment confirmation template.');
  if (needsWording(template.body)) fail(400, 'The assignment confirmation template still has gaps marked "VERGO WORDING NEEDED".');
  const req2 = a.requirement;
  const gbp = (v: number | null) => (v == null ? null : `£${v.toFixed(2)}`);
  const rendered = renderTemplate(template.body, {
    ...companyValues(),
    'worker.name': `${a.staff.firstName} ${a.staff.lastName}`.trim(),
    today: londonDateKey(new Date()),
    'doc.version': template.version,
    'assignment.reference': booking.reference,
    'assignment.client': booking.client.tradingName || booking.client.companyName,
    'assignment.clientBusiness': booking.client.industry,
    'assignment.date': new Date(`${dateKey(a.eventDate)}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' }),
    'assignment.start': a.shiftStart,
    'assignment.finish': a.shiftEnd,
    'assignment.venue': booking.venue,
    'assignment.address': booking.address,
    'assignment.onSiteContact': [booking.onSiteContactName, booking.onSiteContactPhone].filter(Boolean).join(', '),
    'assignment.role': a.role ?? req2?.role,
    'assignment.duties': req2?.duties,
    'assignment.experience': req2?.requiredExperience,
    'assignment.qualifications': req2?.requiredQualifications?.join(', ') || 'None',
    'assignment.dressCode': req2?.dressCode,
    'assignment.equipment': req2?.equipment,
    'assignment.breaks': req2?.breakInfo ?? (a.breakMins ? `${a.breakMins} minutes unpaid` : 'None scheduled'),
    'assignment.payRate': gbp(toNum(a.staffPayRate)) ? `${gbp(toNum(a.staffPayRate))} per hour` : null,
    'assignment.holidayMethod': a.holidayPayMethod === 'ACCRUED'
      ? 'Accrued and paid when holiday is taken'
      : `Rolled up: ${(ON_COSTS.holidayAccrualRate * 100).toFixed(2)}% of pay, paid with your wages`,
    'assignment.travel': gbp(toNum(req2?.travelContribution)) ?? 'None',
    'assignment.expenses': gbp(toNum(req2?.expenses)) ?? 'None',
    'assignment.risks': req2?.healthSafetyRisks,
    'assignment.riskControls': req2?.riskControls,
  });
  const doc = await prisma.$transaction(async (tx) => {
    await tx.workerDocument.updateMany({ where: { bookingId: a.id, type: 'ASSIGNMENT_CONFIRMATION', status: { in: ['ISSUED', 'ACCEPTED'] } }, data: { status: 'SUPERSEDED', supersededAt: new Date() } });
    const created = await tx.workerDocument.create({
      data: { userId: a.staffId, templateId: template.id, type: 'ASSIGNMENT_CONFIRMATION', version: template.version, bookingId: a.id, issuedBy: actor, renderedBody: rendered },
    });
    await writeAudit(actor, { action: 'DOCUMENT_ISSUED', entityType: 'Worker', entityId: a.staffId, newValue: { documentId: created.id, type: 'ASSIGNMENT_CONFIRMATION', booking: booking.reference } }, tx);
    return created;
  });
  res.status(201).json({ ok: true, data: doc });
}));

// ── Timesheets ────────────────────────────────────────────────────────────
// The worker's check-in/out on the shift is the timesheet. Ops adds breaks,
// client and admin approval, disputes and an audited edit history.

r.get('/timesheets', handle(async (req, res) => {
  const q = z.object({
    filter: z.enum(['awaiting', 'disputed', 'approved', 'all']).default('awaiting'),
    from: ymd.optional(), to: ymd.optional(),
  }).parse(req.query);
  const where: Prisma.BookingWhereInput = {
    opsBookingId: { not: null },
    ...(q.from || q.to ? { eventDate: { ...(q.from ? { gte: dateOnly(q.from) } : {}), ...(q.to ? { lte: dateOnly(q.to) } : {}) } } : {}),
  };
  if (q.filter === 'awaiting') Object.assign(where, { status: 'CONFIRMED', eventDate: { ...(where.eventDate as object), lte: dateOnly(londonDateKey(new Date())) }, timesheetDisputedAt: null });
  if (q.filter === 'disputed') Object.assign(where, { timesheetDisputedAt: { not: null }, status: { in: ['CONFIRMED', 'COMPLETED'] } });
  if (q.filter === 'approved') Object.assign(where, { timesheetAdminApprovedAt: { not: null } });
  const rows = await prisma.booking.findMany({
    where, include: { ...assignmentInclude, opsBooking: { select: { reference: true, venue: true, client: { select: { companyName: true } } } } },
    orderBy: { eventDate: 'desc' }, take: 500,
  });
  res.json({ ok: true, data: rows.map((row) => ({ ...shapeAssignment(row), booking: row.opsBooking })) });
}));

const timesheetEdit = z.object({
  checkedInAt: z.string().datetime().nullable().optional(),
  checkedOutAt: z.string().datetime().nullable().optional(),
  hoursWorked: z.number().min(0).max(24).nullable().optional(),
  breakMins: z.number().int().min(0).max(240).optional(),
  reason: z.string().trim().min(3).max(500),
});

r.patch('/assignments/:id/timesheet', handle(async (req, res) => {
  const body = timesheetEdit.parse(req.body);
  const actor = actorOf(req);
  const a = await getAssignment(req.params.id);
  if (a.invoicedAt) fail(409, 'This shift has been invoiced; its timesheet is locked.');
  const nextIn = body.checkedInAt !== undefined ? (body.checkedInAt ? new Date(body.checkedInAt) : null) : a.checkedInAt;
  const nextOut = body.checkedOutAt !== undefined ? (body.checkedOutAt ? new Date(body.checkedOutAt) : null) : a.checkedOutAt;
  if (nextIn && nextOut && nextOut < nextIn) fail(400, 'Check-out cannot be before check-in.');
  let hoursWorked = body.hoursWorked !== undefined ? body.hoursWorked : (a.hoursWorked != null ? Number(a.hoursWorked) : null);
  if (body.hoursWorked === undefined && (body.checkedInAt !== undefined || body.checkedOutAt !== undefined) && nextIn && nextOut) {
    hoursWorked = Math.round(((nextOut.getTime() - nextIn.getTime()) / 3600000) * 100) / 100;
  }
  const data: Prisma.BookingUpdateInput = {
    checkedInAt: nextIn, checkedOutAt: nextOut,
    hoursWorked: hoursWorked == null ? null : new Prisma.Decimal(hoursWorked),
    ...(body.breakMins != null ? { breakMins: body.breakMins } : {}),
  };
  // An approved timesheet that is corrected carries the new figure into the shift's hours.
  if (a.status === 'COMPLETED' && hoursWorked != null) {
    const net = Math.max(0, hoursWorked - (body.breakMins ?? a.breakMins ?? 0) / 60);
    const minimum = toNum(a.requirement?.minimumHours) ?? PRICING.minimumChargeHours;
    data.hoursEstimated = new Prisma.Decimal(net);
    data.totalEstimated = new Prisma.Decimal((Number(a.hourlyRateCharged) * Math.max(net, minimum)).toFixed(2));
  }
  await prisma.$transaction(async (tx) => {
    await tx.booking.update({ where: { id: a.id }, data });
    await writeAudit(actor, {
      action: 'TIMESHEET_MODIFIED', entityType: 'OpsBooking', entityId: a.opsBookingId,
      oldValue: { assignmentId: a.id, checkedInAt: a.checkedInAt, checkedOutAt: a.checkedOutAt, hoursWorked: toNum(a.hoursWorked), breakMins: a.breakMins },
      newValue: { assignmentId: a.id, checkedInAt: nextIn, checkedOutAt: nextOut, hoursWorked, breakMins: body.breakMins ?? a.breakMins },
      reason: body.reason,
    }, tx);
  });
  res.json({ ok: true, data: shapeAssignment(await prisma.booking.findUniqueOrThrow({ where: { id: a.id }, include: assignmentInclude })) });
}));

r.post('/assignments/:id/timesheet/client-approval', handle(async (req, res) => {
  const { approvedBy } = z.object({ approvedBy: z.string().trim().min(2).max(200) }).parse(req.body);
  const actor = actorOf(req);
  const a = await getAssignment(req.params.id);
  await prisma.booking.update({ where: { id: a.id }, data: { timesheetClientApprovedAt: new Date(), timesheetClientApprovedBy: approvedBy } });
  await writeAudit(actor, { action: 'TIMESHEET_CLIENT_APPROVED', entityType: 'OpsBooking', entityId: a.opsBookingId, newValue: { assignmentId: a.id, approvedBy } });
  res.json({ ok: true });
}));

r.post('/assignments/:id/timesheet/dispute', handle(async (req, res) => {
  const body = z.object({ reason: optionalText(500), resolve: z.boolean().default(false) }).parse(req.body);
  const actor = actorOf(req);
  const a = await getAssignment(req.params.id);
  if (!body.resolve && !body.reason) fail(400, 'Say what is disputed.');
  await prisma.booking.update({
    where: { id: a.id },
    data: body.resolve
      ? { timesheetDisputedAt: null, timesheetDisputeReason: null }
      : { timesheetDisputedAt: new Date(), timesheetDisputeReason: body.reason ?? null },
  });
  await writeAudit(actor, {
    action: body.resolve ? 'TIMESHEET_DISPUTE_RESOLVED' : 'TIMESHEET_DISPUTED', entityType: 'OpsBooking', entityId: a.opsBookingId,
    oldValue: { assignmentId: a.id, disputeReason: a.timesheetDisputeReason }, newValue: { assignmentId: a.id }, reason: body.reason ?? null,
  });
  res.json({ ok: true });
}));

// Admin approval completes the shift with its net worked hours, the same way
// the existing "complete" action does, so pay and invoice use the approved figure.
r.post('/assignments/:id/timesheet/approve', handle(async (req, res) => {
  const body = z.object({ hours: z.number().min(0).max(24).optional(), note: optionalText(500) }).parse(req.body);
  const actor = actorOf(req);
  const a = await getAssignment(req.params.id);
  if (a.status !== 'CONFIRMED') fail(409, `Only an accepted shift can be approved (this one is ${a.status.toLowerCase()}).`);
  if (a.timesheetDisputedAt) fail(409, 'This timesheet is disputed. Resolve the dispute first.');
  const net = body.hours ?? netWorkedHours(a) ?? Number(a.hoursEstimated ?? 0);
  if (!(net > 0)) fail(400, 'No hours to approve. Enter the hours worked.');
  const minimum = toNum(a.requirement?.minimumHours) ?? PRICING.minimumChargeHours;
  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: a.id },
      data: {
        status: 'COMPLETED', completedAt: new Date(),
        hoursEstimated: new Prisma.Decimal(net),
        totalEstimated: new Prisma.Decimal((Number(a.hourlyRateCharged) * Math.max(net, minimum)).toFixed(2)),
        timesheetAdminApprovedAt: new Date(), timesheetAdminApprovedBy: actor,
      },
    });
    await writeAudit(actor, {
      action: 'TIMESHEET_APPROVED', entityType: 'OpsBooking', entityId: a.opsBookingId,
      oldValue: { assignmentId: a.id, scheduledHours: toNum(a.hoursEstimated), actualHours: toNum(a.hoursWorked), breakMins: a.breakMins },
      newValue: { assignmentId: a.id, approvedHours: net, billableHours: Math.max(net, minimum) },
      reason: body.note ?? null,
    }, tx);
  });
  res.json({ ok: true, data: shapeOpsBooking(await getOpsBooking(a.opsBookingId)) });
}));

export default r;
