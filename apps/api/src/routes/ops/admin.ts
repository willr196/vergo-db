/**
 * VERGO Ops: dashboard, AWR and direct-hire tracking aids, Historic Payroll
 * Reconstruction, the audit log, settings, retention and CSV exports.
 */

import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../prisma';
import { writeAudit, actorOf, diff } from '../../ops/audit';
import {
  loadWorkers, loadWorker, assignmentInclude, profitAssignment, shapeAssignment, toNum, currentTemplateVersions,
} from '../../ops/service';
import { bookingProfit, COUNTED_STATUSES } from '../../ops/profit';
import { awrWeeks, AWR_LABEL } from '../../ops/awr';
import { toCsv, parseCsv, relevantPeriodEnd, RETENTION_CLASSES } from '../../ops/records';
import { loadOpsSettings, settingsSchemas, loadCommercialReview, OWNER_REVIEW_LABEL, type OpsSettingKey } from '../../ops/settings';
import { clientTermsPositions, cutVersionForSettings } from '../../ops/documentService';
import { kidCounts, contractCounts } from '../../ops/compliance';
import { thresholdsFor } from '../../ops/pension';
import { needsWording, DOC_TYPE_LABELS, type OpsDocType } from '../../ops/documents';
import { dateKey, londonDateKey, addDays, taxYearOf } from '../../ops/time';
import { loadOpsBookings } from './bookings';
import { importLegacy, parsePgDump } from '../../ops/legacyImport';
import { handle, fail, ymd, optionalText, sendCsv, dateOnly } from './common';

const r = Router();

const pounds = (pence: number) => (pence / 100).toFixed(2);

function monthRange(today: string) {
  const start = `${today.slice(0, 7)}-01`;
  const [y, m] = today.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { start, end: addDays(next, -1) };
}

// ── AWR ───────────────────────────────────────────────────────────────────

async function awrRows(today: string) {
  const from = addDays(today, -400);
  const shifts = await prisma.booking.findMany({
    where: { status: { in: ['CONFIRMED', 'COMPLETED'] }, eventDate: { gte: dateOnly(from), lte: dateOnly(today) } },
    select: {
      staffId: true, clientId: true, role: true, eventDate: true,
      requirement: { select: { role: true } },
      staff: { select: { firstName: true, lastName: true } },
      client: { select: { companyName: true, tradingName: true } },
    },
  });
  const groups = new Map<string, { workerId: string; worker: string; clientId: string; client: string; role: string; dates: string[] }>();
  for (const s of shifts) {
    const role = s.role ?? s.requirement?.role ?? 'Role not recorded';
    const key = `${s.staffId}|${s.clientId}|${role.toLowerCase()}`;
    const g = groups.get(key) ?? {
      workerId: s.staffId, worker: `${s.staff.firstName} ${s.staff.lastName}`.trim(),
      clientId: s.clientId, client: s.client.tradingName || s.client.companyName, role, dates: [],
    };
    g.dates.push(dateKey(s.eventDate));
    groups.set(key, g);
  }
  return [...groups.values()]
    .map(({ dates, ...g }) => ({ ...g, ...awrWeeks(dates.map((date) => ({ date })), today) }))
    .filter((row) => row.weeksAccumulated > 0)
    .sort((a, b) => b.weeksAccumulated - a.weeksAccumulated);
}

r.get('/awr', handle(async (_req, res) => {
  const today = londonDateKey(new Date());
  res.json({ ok: true, data: { label: AWR_LABEL, rows: await awrRows(today) } });
}));

// ── Dashboard ─────────────────────────────────────────────────────────────

r.get('/dashboard', handle(async (_req, res) => {
  const now = new Date();
  const today = londonDateKey(now);
  const month = monthRange(today);
  const horizon = addDays(today, 14);

  const [workers, monthBookings, upcomingOps, standaloneMonth, upcomingAssignments, awaitingTimesheets, awaitingInvoice, invoicedOps, invoicedStandalone, settings, templates, awr] = await Promise.all([
    loadWorkers(),
    loadOpsBookings({ eventDate: { gte: dateOnly(month.start), lte: dateOnly(month.end) }, status: { not: 'CANCELLED' } }),
    loadOpsBookings({ eventDate: { gte: dateOnly(today) }, status: { notIn: ['CANCELLED', 'COMPLETED', 'INVOICED', 'PAID'] } }),
    prisma.booking.findMany({
      where: { opsBookingId: null, eventDate: { gte: dateOnly(month.start), lte: dateOnly(month.end) }, status: { in: [...COUNTED_STATUSES] as any } },
      include: assignmentInclude,
    }),
    prisma.booking.findMany({
      where: { status: { in: ['PENDING', 'CONFIRMED'] }, eventDate: { gte: dateOnly(today), lte: dateOnly(horizon) } },
      include: { ...assignmentInclude, opsBooking: { select: { reference: true, venue: true } }, client: { select: { companyName: true } } },
      orderBy: [{ eventDate: 'asc' }, { shiftStart: 'asc' }],
      take: 100,
    }),
    prisma.booking.count({ where: { status: 'CONFIRMED', eventDate: { lte: dateOnly(today) }, timesheetDisputedAt: null } }),
    prisma.booking.findMany({ where: { status: 'COMPLETED', invoicedAt: null }, select: { id: true, totalEstimated: true, opsBookingId: true } }),
    prisma.opsBooking.findMany({ where: { status: 'INVOICED', paidAt: null }, include: { assignments: { include: assignmentInclude }, costs: true } }),
    prisma.booking.findMany({ where: { opsBookingId: null, invoicedAt: { not: null }, clientPaidAt: null }, select: { totalEstimated: true } }),
    loadOpsSettings(),
    prisma.documentTemplate.findMany({ where: { retiredAt: null }, select: { type: true, body: true, version: true } }),
    awrRows(today),
  ]);

  const active = workers.filter((w) => w.activeStatus === 'ACTIVE');
  const standaloneProfit = bookingProfit(standaloneMonth.map(profitAssignment), []);
  const monthRevenue = monthBookings.reduce((s, b) => s + b.profit.revenuePence, 0) + standaloneProfit.revenuePence;
  const monthLabour = monthBookings.reduce((s, b) => s + b.profit.directLabourCostPence, 0) + standaloneProfit.directLabourCostPence;
  const monthContribution = monthBookings.reduce((s, b) => s + b.profit.grossContributionPence, 0) + standaloneProfit.grossContributionPence;

  const outstandingOpsPence = invoicedOps.reduce((s, b) => s + bookingProfit(b.assignments.map(profitAssignment), b.costs).revenuePence, 0);
  const outstandingStandalonePence = invoicedStandalone.reduce((s, b) => s + Math.round(Number(b.totalEstimated ?? 0) * 100), 0);

  const alerts: Array<{ level: 'danger' | 'warning' | 'info'; message: string; link?: string }> = [];
  const rtwExpired = active.filter((w) => w.rtw.status === 'expired');
  const rtwFollowUp = active.filter((w) => w.rtw.status === 'follow_up_required');
  const rtwUnconfirmed = active.filter((w) => w.rtw.confirmationMissing);
  if (rtwExpired.length) alerts.push({ level: 'danger', message: `${rtwExpired.length} active worker(s) with expired right to work: ${rtwExpired.map((w) => w.name).join(', ')}`, link: '#/rtw' });
  if (rtwFollowUp.length) alerts.push({ level: 'warning', message: `${rtwFollowUp.length} right-to-work follow-up check(s) due`, link: '#/rtw' });
  if (rtwUnconfirmed.length) alerts.push({ level: 'warning', message: `${rtwUnconfirmed.length} worker(s) cleared by a check recorded without confirmation that the prescribed check was performed`, link: '#/rtw' });
  const withPensionAlerts = active.filter((w) => w.pensionAlerts.some((a) => a.level === 'warning' && !a.message.startsWith('No pension status')));
  if (withPensionAlerts.length) alerts.push({ level: 'warning', message: `${withPensionAlerts.length} worker(s) need a pension review`, link: '#/workers?pension=review' });
  if (!settings.pensionDutiesStartDate) alerts.push({ level: 'info', message: 'Workplace pension duties start date not recorded, so age/pay pension alerts are off', link: '#/settings' });
  const year = taxYearOf(today);
  const th = thresholdsFor(settings.pensionThresholds, year);
  if (!th || !th.exact) alerts.push({ level: 'info', message: `Pension thresholds for ${year} not recorded${th ? ` (using ${th.year})` : ''}`, link: '#/settings' });
  else if (!th.thresholds.verified) alerts.push({ level: 'info', message: `Pension thresholds for ${year} not marked verified`, link: '#/settings' });
  for (const t of templates) {
    if (needsWording(t.body)) alerts.push({ level: 'warning', message: `${DOC_TYPE_LABELS[t.type as OpsDocType]} needs VERGO's approved wording before it can be issued`, link: '#/documents' });
  }
  const consumer = upcomingOps.filter((b) => b.consumerTermsRequired);
  if (consumer.length) alerts.push({ level: 'warning', message: `${consumer.length} upcoming private consumer booking(s): separate consumer terms required (${consumer.map((b) => b.reference).join(', ')})`, link: '#/bookings' });
  const overrides = active.filter((w) => w.readiness.overridden);
  if (overrides.length) alerts.push({ level: 'info', message: `${overrides.length} worker(s) marked ready by override`, link: '#/workers?ready=overridden' });

  const awrWarn = awr.filter((a) => a.level !== 'none');

  // Documents & Terms counts. Business clients only: private consumers never get the B2B Terms.
  const businessClients = await prisma.client.findMany({
    where: { clientType: { not: 'PRIVATE_CONSUMER' }, OR: [{ status: 'APPROVED' }, { opsBookings: { some: {} } }, { clientDocuments: { some: {} } }] },
    select: { id: true },
  });
  const termsPositions = [...(await clientTermsPositions(businessClients.map((c) => c.id))).values()];
  const commercial = await loadCommercialReview(settings.clientCommercialTerms);
  if (!commercial.reviewed) alerts.push({ level: 'warning', message: `${OWNER_REVIEW_LABEL}: transfer fee, extended hire, payment and cancellation defaults. Terms of Business cannot be issued until confirmed.`, link: '#/settings' });
  if (settings.payFrequency !== 'monthly') alerts.push({ level: 'info', message: `Pay frequency in Settings is ${settings.payFrequency.replace('_', '-')}, but the KID and employment agreement say workers are paid monthly. Check which is right.`, link: '#/settings' });

  res.json({
    ok: true,
    data: {
      today,
      month,
      workers: {
        active: active.length,
        ready: active.filter((w) => w.readiness.ready).length,
        blocked: active.filter((w) => !w.readiness.ready).length,
        rtwExpired: active.filter((w) => w.rtw.expiryBucket === 'expired').length,
        rtwWithin30: active.filter((w) => w.rtw.expiryBucket === 'within_30').length,
        rtwWithin60: active.filter((w) => w.rtw.expiryBucket === 'within_60').length,
        rtwNoCheck: active.filter((w) => w.rtw.expiryBucket === 'no_check').length,
        contractsNotAccepted: active.filter((w) => w.contract.status !== 'accepted').length,
        contractsNotIssued: active.filter((w) => w.contract.status === 'not_issued' || w.contract.status === 'superseded').length,
        kidsNotIssued: active.filter((w) => w.kid.status !== 'issued').length,
        missingKid: active.filter((w) => !kidCounts(w.kid)).length,
        missingAgreement: active.filter((w) => !contractCounts(w.contract)).length,
        onSupersededContract: active.filter((w) => w.contract.status === 'superseded' || (w.contract.status === 'accepted' && (w.contract.newerVersionAvailable || w.contract.reacceptanceRequired))).length,
        pensionNotAssessed: active.filter((w) => w.pensionStatus === 'NOT_ASSESSED').length,
      },
      assignments: {
        upcoming: upcomingAssignments.length,
        upcomingList: upcomingAssignments.slice(0, 15).map((a) => ({ ...shapeAssignment(a), reference: a.opsBooking?.reference ?? null, venue: a.opsBooking?.venue ?? a.venue, client: a.client.companyName })),
        unfilledSlots: upcomingOps.reduce((s, b) => s + b.staffing.unfilled, 0),
        timesheetsAwaitingApproval: awaitingTimesheets,
        completedAwaitingInvoice: awaitingInvoice.length,
      },
      invoices: {
        outstandingCount: invoicedOps.length + invoicedStandalone.length,
        outstandingPence: outstandingOpsPence + outstandingStandalonePence,
      },
      money: {
        isEstimate: true,
        revenuePence: monthRevenue,
        directLabourPence: monthLabour,
        grossContributionPence: monthContribution,
        averageGrossMargin: monthRevenue > 0 ? monthContribution / monthRevenue : null,
      },
      terms: {
        clientsWithoutCurrentTerms: termsPositions.filter((t) => !(t.status === 'accepted' && !t.newerVersionAvailable)).length,
        clientsOnSupersededTerms: termsPositions.filter((t) => t.acceptedVersion != null && (t.newerVersionAvailable || t.status === 'reacceptance_required')).length,
        commercialReviewed: commercial.reviewed,
      },
      awr: { label: AWR_LABEL, warning: awrWarn.filter((a) => a.level === 'warning').length, review: awrWarn.filter((a) => a.level === 'review_required').length, rows: awrWarn.slice(0, 10) },
      alerts,
    },
  });
}));

// ── Direct hire / transfer tracking ───────────────────────────────────────

r.get('/direct-hire', handle(async (_req, res) => {
  const today = londonDateKey(new Date());
  const [spans, tracked] = await Promise.all([
    prisma.booking.groupBy({
      by: ['staffId', 'clientId'],
      where: { status: { in: ['CONFIRMED', 'COMPLETED'] } },
      _min: { eventDate: true }, _max: { eventDate: true },
    }),
    prisma.directHireTracking.findMany({ include: { user: { select: { firstName: true, lastName: true } }, client: { select: { companyName: true } } } }),
  ]);
  const ids = { users: [...new Set(spans.map((s) => s.staffId))], clients: [...new Set(spans.map((s) => s.clientId))] };
  const [users, clients] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids.users } }, select: { id: true, firstName: true, lastName: true } }),
    prisma.client.findMany({ where: { id: { in: ids.clients } }, select: { id: true, companyName: true } }),
  ]);
  const userName = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
  const clientName = new Map(clients.map((c) => [c.id, c.companyName]));
  const trackedBy = new Map(tracked.map((t) => [`${t.userId}|${t.clientId}`, t]));

  const rows = spans.map((s) => {
    const first = dateKey(s._min.eventDate!);
    const last = dateKey(s._max.eventDate!);
    const estimatedEnd = relevantPeriodEnd(first, last);
    const t = trackedBy.get(`${s.staffId}|${s.clientId}`);
    return {
      userId: s.staffId, worker: userName.get(s.staffId) ?? s.staffId,
      clientId: s.clientId, client: clientName.get(s.clientId) ?? s.clientId,
      firstAssignmentDate: first, lastAssignmentDate: last,
      estimatedRelevantPeriodEnd: estimatedEnd,
      withinRelevantPeriod: today <= (t?.relevantPeriodEnd ? dateKey(t.relevantPeriodEnd) : estimatedEnd),
      tracking: t ? { ...t, relevantPeriodEnd: t.relevantPeriodEnd ? dateKey(t.relevantPeriodEnd) : null, lastAssignmentDate: t.lastAssignmentDate ? dateKey(t.lastAssignmentDate) : null } : null,
    };
  }).filter((row) => row.withinRelevantPeriod || row.tracking)
    .sort((a, b) => b.lastAssignmentDate.localeCompare(a.lastAssignmentDate));
  res.json({ ok: true, data: { label: 'Transfer / direct-hire tracking aid — review required', rows } });
}));

r.put('/direct-hire', handle(async (req, res) => {
  const body = z.object({
    userId: z.string().min(1), clientId: z.string().min(1),
    lastAssignmentDate: ymd.nullable().optional(),
    relevantPeriodEnd: ymd.nullable().optional(),
    directHireReported: z.boolean().optional(),
    extendedHireOption: z.boolean().optional(),
    transferFeeStatus: z.enum(['NOT_APPLICABLE', 'POSSIBLE', 'INVOICED', 'PAID', 'WAIVED']).optional(),
    notes: optionalText(1000),
  }).parse(req.body);
  const actor = actorOf(req);
  const before = await prisma.directHireTracking.findUnique({ where: { userId_clientId: { userId: body.userId, clientId: body.clientId } } });
  const data = {
    ...(body.lastAssignmentDate !== undefined ? { lastAssignmentDate: body.lastAssignmentDate ? dateOnly(body.lastAssignmentDate) : null } : {}),
    ...(body.relevantPeriodEnd !== undefined ? { relevantPeriodEnd: body.relevantPeriodEnd ? dateOnly(body.relevantPeriodEnd) : null } : {}),
    ...(body.directHireReported !== undefined ? { directHireReported: body.directHireReported, directHireReportedAt: body.directHireReported ? (before?.directHireReportedAt ?? new Date()) : null } : {}),
    ...(body.extendedHireOption !== undefined ? { extendedHireOption: body.extendedHireOption } : {}),
    ...(body.transferFeeStatus ? { transferFeeStatus: body.transferFeeStatus } : {}),
    ...(body.notes !== undefined ? { notes: body.notes } : {}),
  };
  const row = await prisma.directHireTracking.upsert({
    where: { userId_clientId: { userId: body.userId, clientId: body.clientId } },
    create: { userId: body.userId, clientId: body.clientId, ...data },
    update: data,
  });
  await writeAudit(actor, { action: 'DIRECT_HIRE_UPDATED', entityType: 'Client', entityId: body.clientId, oldValue: before, newValue: { userId: body.userId, ...data } });
  res.json({ ok: true, data: row });
}));

// ── Historic Payroll Reconstruction ───────────────────────────────────────
// Organises what was actually paid, for Basic PAYE Tools, payroll software or
// an accountant. It never produces FPS files, tax codes or tax due.

const paymentBody = z.object({
  userId: z.string().nullable().optional(),
  workerName: z.string().trim().min(1).max(200),
  paymentDate: ymd,
  hours: z.number().min(0).max(1000).nullable().optional(),
  basePay: z.number().min(0).max(1_000_000).nullable().optional(),
  holidayPay: z.number().min(0).max(1_000_000).nullable().optional(),
  grossTransferred: z.number().min(0).max(1_000_000),
  notes: optionalText(1000),
  payrollCorrected: z.boolean().optional(),
  fpsSubmitted: z.boolean().optional(),
  hmrcReconciled: z.boolean().optional(),
});

async function assertWorkerId(userId: string | null | undefined) {
  if (!userId) return;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { userType: true } });
  if (!user || user.userType !== 'JOB_SEEKER') fail(404, 'No worker with that id. Leave the payment unlinked and keep the name.');
}

function shapePayment(p: Prisma.HistoricPaymentGetPayload<{}>) {
  return { ...p, paymentDate: dateKey(p.paymentDate), hours: toNum(p.hours), basePay: toNum(p.basePay), holidayPay: toNum(p.holidayPay), grossTransferred: toNum(p.grossTransferred) };
}

async function listPayments(q: { userId?: string; from?: string; to?: string }) {
  const rows = await prisma.historicPayment.findMany({
    where: {
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.from || q.to ? { paymentDate: { ...(q.from ? { gte: dateOnly(q.from) } : {}), ...(q.to ? { lte: dateOnly(q.to) } : {}) } } : {}),
    },
    orderBy: [{ paymentDate: 'desc' }, { workerName: 'asc' }],
    take: 5000,
  });
  return rows.map(shapePayment);
}

r.get('/payroll-history', handle(async (req, res) => {
  const q = z.object({ userId: z.string().optional(), from: ymd.optional(), to: ymd.optional() }).parse(req.query);
  const rows = await listPayments(q);
  const totals = rows.reduce((t, p) => ({
    gross: t.gross + (p.grossTransferred ?? 0), base: t.base + (p.basePay ?? 0), holiday: t.holiday + (p.holidayPay ?? 0),
    notCorrected: t.notCorrected + (p.payrollCorrected ? 0 : 1), notFps: t.notFps + (p.fpsSubmitted ? 0 : 1), notReconciled: t.notReconciled + (p.hmrcReconciled ? 0 : 1),
  }), { gross: 0, base: 0, holiday: 0, notCorrected: 0, notFps: 0, notReconciled: 0 });
  res.json({ ok: true, data: { rows, totals } });
}));

r.post('/payroll-history', handle(async (req, res) => {
  const body = paymentBody.parse(req.body);
  const actor = actorOf(req);
  await assertWorkerId(body.userId);
  const row = await prisma.historicPayment.create({ data: { ...body, userId: body.userId || null, paymentDate: dateOnly(body.paymentDate), createdBy: actor } });
  await writeAudit(actor, { action: 'HISTORIC_PAYMENT_ADDED', entityType: 'HistoricPayment', entityId: row.id, newValue: body });
  res.status(201).json({ ok: true, data: shapePayment(row) });
}));

r.patch('/payroll-history/:id', handle(async (req, res) => {
  const body = paymentBody.partial().parse(req.body);
  const actor = actorOf(req);
  const before = await prisma.historicPayment.findUnique({ where: { id: req.params.id } });
  if (!before) fail(404, 'Payment not found');
  await assertWorkerId(body.userId);
  const row = await prisma.historicPayment.update({
    where: { id: before.id },
    data: { ...body, ...(body.paymentDate ? { paymentDate: dateOnly(body.paymentDate) } : {}) },
  });
  const changes = diff(shapePayment(before) as Record<string, unknown>, body as Record<string, unknown>);
  if (changes.changed) await writeAudit(actor, { action: 'HISTORIC_PAYMENT_UPDATED', entityType: 'HistoricPayment', entityId: row.id, ...changes });
  res.json({ ok: true, data: shapePayment(row) });
}));

const PAYMENT_HEADERS = ['worker_name', 'worker_email', 'payment_date', 'hours', 'base_pay', 'holiday_pay', 'gross_transferred', 'notes', 'payroll_corrected', 'fps_submitted', 'hmrc_reconciled'];

function parseDate(value: string): string | null {
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}
const parseMoney = (v: string) => (v.trim() === '' ? null : Number(v.replace(/[£,\s]/g, '')));
const parseBool = (v: string) => /^(y|yes|true|1)$/i.test(v.trim());

r.post('/payroll-history/import', handle(async (req, res) => {
  const { csv, commit } = z.object({ csv: z.string().min(1).max(2_000_000), commit: z.boolean().default(false) }).parse(req.body);
  const actor = actorOf(req);
  const table = parseCsv(csv);
  if (table.length < 2) fail(400, 'The CSV needs a header row and at least one payment.');
  const header = table[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const col = (name: string) => header.indexOf(name);
  for (const required of ['worker_name', 'payment_date', 'gross_transferred']) {
    if (col(required) < 0) fail(400, `Missing column "${required}". Expected: ${PAYMENT_HEADERS.join(', ')}`);
  }
  const workers = await prisma.user.findMany({ where: { userType: 'JOB_SEEKER' }, select: { id: true, email: true, firstName: true, lastName: true } });
  const byEmail = new Map(workers.map((w) => [w.email.toLowerCase(), w.id]));
  const byName = new Map<string, string | null>();
  for (const w of workers) {
    const key = `${w.firstName} ${w.lastName}`.trim().toLowerCase();
    byName.set(key, byName.has(key) ? null : w.id); // ambiguous names don't auto-match
  }

  const parsed = table.slice(1).map((cells, i) => {
    const get = (name: string) => (col(name) >= 0 ? (cells[col(name)] ?? '').trim() : '');
    const errors: string[] = [];
    const paymentDate = parseDate(get('payment_date'));
    if (!paymentDate) errors.push('payment_date must be YYYY-MM-DD or DD/MM/YYYY');
    const gross = parseMoney(get('gross_transferred'));
    if (gross == null || !Number.isFinite(gross) || gross < 0) errors.push('gross_transferred must be a number');
    const nums = ['hours', 'base_pay', 'holiday_pay'].map((n) => parseMoney(get(n)));
    if (nums.some((n) => n != null && (!Number.isFinite(n) || n < 0))) errors.push('hours, base_pay and holiday_pay must be numbers');
    const workerName = get('worker_name');
    if (!workerName) errors.push('worker_name is required');
    const email = get('worker_email').toLowerCase();
    const userId = (email && byEmail.get(email)) || byName.get(workerName.toLowerCase()) || null;
    return {
      line: i + 2, errors, userId, matched: Boolean(userId),
      data: {
        workerName, paymentDate: paymentDate ?? '', hours: nums[0], basePay: nums[1], holidayPay: nums[2], grossTransferred: gross ?? 0,
        notes: get('notes') || null, payrollCorrected: parseBool(get('payroll_corrected')), fpsSubmitted: parseBool(get('fps_submitted')), hmrcReconciled: parseBool(get('hmrc_reconciled')),
      },
    };
  });

  // The same worker, date and amount already on file is treated as a duplicate.
  const valid = parsed.filter((p) => p.errors.length === 0);
  const existing = valid.length ? await prisma.historicPayment.findMany({
    where: { paymentDate: { in: [...new Set(valid.map((p) => dateOnly(p.data.paymentDate)))] } },
    select: { workerName: true, paymentDate: true, grossTransferred: true },
  }) : [];
  const seen = new Set(existing.map((e) => `${e.workerName.toLowerCase()}|${dateKey(e.paymentDate)}|${Number(e.grossTransferred).toFixed(2)}`));
  const rows = parsed.map((p) => {
    const key = `${p.data.workerName.toLowerCase()}|${p.data.paymentDate}|${p.data.grossTransferred.toFixed(2)}`;
    const duplicate = seen.has(key);
    seen.add(key);
    return { ...p, duplicate };
  });

  const toCreate = rows.filter((p) => p.errors.length === 0 && !p.duplicate);
  let created = 0;
  let batch: string | null = null;
  if (commit) {
    if (rows.some((p) => p.errors.length)) fail(400, 'Fix the rows with errors before importing.', { rows });
    batch = `import-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}`;
    await prisma.$transaction(async (tx) => {
      const result = await tx.historicPayment.createMany({
        data: toCreate.map((p) => ({ ...p.data, userId: p.userId, paymentDate: dateOnly(p.data.paymentDate), importBatch: batch, createdBy: actor })),
      });
      created = result.count;
      await writeAudit(actor, { action: 'HISTORIC_PAYMENTS_IMPORTED', entityType: 'HistoricPayment', entityId: batch!, newValue: { created, skippedDuplicates: rows.filter((p) => p.duplicate).length } }, tx);
    });
  }
  res.json({ ok: true, data: { rows, committed: commit, created, batch, headers: PAYMENT_HEADERS } });
}));

// ── Import from the desktop tool ──────────────────────────────────────────

const ENTITY_WORDS: Record<string, string> = {
  Client: 'Clients', Staff: 'Staff', Job: 'Jobs', Assignment: 'People on jobs', JobSeries: 'Ongoing jobs', Lead: 'Leads', JobScheduleItem: 'Running order lines',
};

r.get('/legacy-import', handle(async (_req, res) => {
  const rows = await prisma.opsLegacyImport.groupBy({ by: ['entity'], _count: { _all: true }, _max: { createdAt: true } });
  res.json({
    ok: true,
    data: rows.map((x) => ({ entity: x.entity, label: ENTITY_WORDS[x.entity] ?? x.entity, count: x._count._all, lastAt: x._max.createdAt }))
      .sort((a, b) => Object.keys(ENTITY_WORDS).indexOf(a.entity) - Object.keys(ENTITY_WORDS).indexOf(b.entity)),
  });
}));

/** Preview (commit false) or import a backup file from the desktop tool. */
r.post('/legacy-import', handle(async (req, res) => {
  const body = z.object({ sql: z.string().min(1).max(4_500_000), commit: z.boolean().default(false) }).parse(req.body);
  let data;
  try { data = parsePgDump(body.sql); } catch (error: any) { fail(400, error.message); }
  const actor = actorOf(req);
  const result = await importLegacy(data, { commit: body.commit, actor });
  if (body.commit) {
    await writeAudit(actor, { action: 'LEGACY_IMPORT', entityType: 'OpsLegacyImport', entityId: 'vergo_admin', newValue: { source: result.source, counts: result.counts } });
  }
  res.json({ ok: true, data: result });
}));

// ── Audit log ─────────────────────────────────────────────────────────────

r.get('/audit', handle(async (req, res) => {
  const q = z.object({
    entityType: z.string().max(40).optional(), entityId: z.string().max(40).optional(),
    action: z.string().max(80).optional(), actor: z.string().max(100).optional(),
    limit: z.coerce.number().int().min(1).max(1000).default(200),
  }).parse(req.query);
  const rows = await prisma.auditLog.findMany({
    where: {
      ...(q.entityType ? { entityType: q.entityType } : {}), ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.action ? { action: q.action } : {}), ...(q.actor ? { actor: q.actor } : {}),
    },
    orderBy: { at: 'desc' }, take: q.limit,
  });
  res.json({ ok: true, data: rows });
}));

// ── Settings and retention ────────────────────────────────────────────────

r.get('/settings', handle(async (_req, res) => {
  const settings = await loadOpsSettings();
  const today = londonDateKey(new Date());
  res.json({ ok: true, data: { settings, currentTaxYear: taxYearOf(today), templateVersions: await currentTemplateVersions() } });
}));

r.put('/settings/:key', handle(async (req, res) => {
  const key = req.params.key as OpsSettingKey;
  const schema = settingsSchemas[key];
  if (!schema) fail(404, 'Unknown setting');
  const value = (schema as z.ZodTypeAny).parse(req.body?.value);
  const actor = actorOf(req);
  const before = await prisma.opsSetting.findUnique({ where: { key } });
  await prisma.opsSetting.upsert({ where: { key }, create: { key, value: value as Prisma.InputJsonValue, updatedBy: actor }, update: { value: value as Prisma.InputJsonValue, updatedBy: actor } });
  if (JSON.stringify(before?.value ?? null) !== JSON.stringify(value)) {
    await writeAudit(actor, { action: 'SETTING_CHANGED', entityType: 'OpsSetting', entityId: key, oldValue: before?.value ?? null, newValue: value });
  }
  // These values are frozen into the KID and the Terms of Business, so a change is a new version.
  let newVersion: { type: string; version: number } | null = null;
  if ((key === 'kidPayExample' || key === 'clientCommercialTerms') && JSON.stringify(before?.value ?? null) !== JSON.stringify(value)) {
    const type = key === 'kidPayExample' ? 'KEY_INFORMATION_DOCUMENT' : 'CLIENT_TERMS_OF_BUSINESS';
    const created = await cutVersionForSettings(type, actor);
    if (created) newVersion = { type, version: created.version };
  }
  res.json({ ok: true, data: await loadOpsSettings(), newVersion });
}));

r.get('/retention', handle(async (_req, res) => {
  res.json({ ok: true, data: { classes: RETENTION_CLASSES, note: 'VERGO Ops never deletes these records automatically. Retention periods are for a person to apply, with advice.' } });
}));

// Everything held about one worker, for a subject access request or a records request.
r.get('/workers/:id/export', handle(async (req, res) => {
  const worker = await loadWorker(req.params.id);
  if (!worker) fail(404, 'Worker not found');
  const actor = actorOf(req);
  const [documents, assignments, payments, availability, audit] = await Promise.all([
    prisma.workerDocument.findMany({ where: { userId: worker.id } }),
    prisma.booking.findMany({ where: { staffId: worker.id }, include: { opsBooking: { select: { reference: true } }, client: { select: { companyName: true } } } }),
    prisma.historicPayment.findMany({ where: { userId: worker.id } }),
    prisma.availability.findMany({ where: { userId: worker.id } }),
    prisma.auditLog.findMany({ where: { entityType: 'Worker', entityId: worker.id } }),
  ]);
  await writeAudit(actor, { action: 'WORKER_RECORDS_EXPORTED', entityType: 'Worker', entityId: worker.id });
  res.setHeader('Content-Disposition', `attachment; filename="worker-${worker.id}.json"`);
  res.json({ exportedAt: new Date().toISOString(), exportedBy: actor, worker, documents, assignments, payments, availability, audit });
}));

// ── CSV exports ───────────────────────────────────────────────────────────
// Sensitive details (date of birth, emergency contacts, internal notes) stay
// out of the master list; the compliance export carries status, not evidence.

r.get('/exports/:name', handle(async (req, res) => {
  const actor = actorOf(req);
  const name = req.params.name.replace(/\.csv$/, '');
  const today = londonDateKey(new Date());
  let csv: string;

  switch (name) {
    case 'workers': {
      const workers = await loadWorkers();
      csv = toCsv(
        ['id', 'first_name', 'last_name', 'email', 'phone', 'active_status', 'roles', 'ready', 'availability', 'rating', 'first_assignment', 'last_assignment'],
        workers.map((w) => [w.id, w.firstName, w.lastName, w.email, w.phone, w.activeStatus, w.roles.join('; '), w.readiness.ready ? 'yes' : 'no', w.availabilityStatus, w.rating, w.firstAssignmentDate, w.lastAssignmentDate]),
      );
      break;
    }
    case 'compliance': {
      const workers = await loadWorkers();
      csv = toCsv(
        ['id', 'name', 'ready', 'ready_override', 'missing', 'rtw_status', 'rtw_valid_until', 'rtw_follow_up_due', 'rtw_checked_at', 'contract_status', 'contract_version', 'contract_accepted_at', 'kid_status', 'kid_version', 'kid_issued_at', 'payroll_status', 'pension_status', 'pension_last_assessed'],
        workers.map((w) => [w.id, w.name, w.readiness.ready ? 'yes' : 'no', w.readiness.overridden ? 'yes' : 'no', w.readiness.missing.join('; '), w.rtw.status, w.rtw.expiresAt, w.rtw.followUpDue, w.rtw.checkedAt ? dateKey(w.rtw.checkedAt) : null, w.contract.status, w.contract.version, w.contract.acceptedAt, w.kid.status, w.kid.version, w.kid.issuedAt, w.payrollStatus, w.pensionStatus, w.pensionLastAssessedAt]),
      );
      break;
    }
    case 'bookings':
    case 'profitability': {
      const bookings = await loadOpsBookings({});
      csv = name === 'bookings'
        ? toCsv(
          ['reference', 'client', 'event_type', 'venue', 'date', 'start', 'expected_finish', 'status', 'required', 'filled', 'consumer_terms_required', 'invoice_ref'],
          bookings.map((b) => [b.reference, b.client.companyName, b.eventType, b.venue, b.eventDate, b.startTime, b.expectedFinish, b.status, b.staffing.required, b.staffing.filled, b.consumerTermsRequired ? 'yes' : 'no', b.invoiceRef]),
        )
        : toCsv(
          ['reference', 'client', 'date', 'status', 'basis', 'revenue', 'worker_wages', 'holiday_pay', 'employer_costs', 'travel_expenses', 'other_worker_costs', 'other_direct_costs', 'gross_contribution', 'gross_margin_pct'],
          bookings.map((b) => [b.reference, b.client.companyName, b.eventDate, b.status, b.profit.isEstimate ? 'ESTIMATE' : 'actual', pounds(b.profit.revenuePence), pounds(b.profit.workerWagesPence), pounds(b.profit.holidayPayPence), pounds(b.profit.employerCostsPence), pounds(b.profit.workerTravelExpensesPence), pounds(b.profit.otherWorkerCostsPence), pounds(b.profit.otherDirectCostsPence), pounds(b.profit.grossContributionPence), b.profit.grossMargin == null ? '' : (b.profit.grossMargin * 100).toFixed(1)]),
        );
      break;
    }
    case 'assignments':
    case 'timesheets': {
      const rows = await prisma.booking.findMany({
        where: name === 'timesheets' ? { timesheetAdminApprovedAt: { not: null } } : { opsBookingId: { not: null } },
        include: { ...assignmentInclude, opsBooking: { select: { reference: true } }, client: { select: { companyName: true } } },
        orderBy: { eventDate: 'asc' },
      });
      const shaped = rows.map((row) => ({ ...shapeAssignment(row), reference: row.opsBooking?.reference ?? '', client: row.client.companyName }));
      csv = name === 'assignments'
        ? toCsv(
          ['id', 'booking', 'client', 'worker', 'role', 'date', 'planned_start', 'planned_finish', 'status', 'pay_rate', 'client_charge_rate', 'holiday_pay_method', 'override_reason'],
          shaped.map((a) => [a.id, a.reference, a.client, a.worker.name, a.role, a.date, a.plannedStart, a.plannedFinish, a.status, a.payRate, a.clientChargeRate, a.holidayPayMethod, a.warningOverrideReason]),
        )
        : toCsv(
          ['id', 'booking', 'client', 'worker', 'role', 'date', 'scheduled_hours', 'actual_hours', 'break_mins', 'billable_hours', 'payable_hours', 'pay_rate', 'client_approved_by', 'admin_approved_by', 'admin_approved_at', 'disputed'],
          shaped.map((a) => [a.id, a.reference, a.client, a.worker.name, a.role, a.date, a.scheduledHours, a.actualHours, a.breakMins, a.billableHours, a.billableHours, a.payRate, a.timesheet.clientApprovedBy, a.timesheet.adminApprovedBy, a.timesheet.adminApprovedAt, a.timesheet.disputedAt ? 'yes' : 'no']),
        );
      break;
    }
    case 'payroll-history': {
      const rows = await listPayments({});
      csv = toCsv(
        [...PAYMENT_HEADERS.filter((h) => h !== 'worker_email'), 'import_batch', 'id'],
        rows.map((p) => [p.workerName, p.paymentDate, p.hours, p.basePay, p.holidayPay, p.grossTransferred, p.notes, p.payrollCorrected ? 'yes' : 'no', p.fpsSubmitted ? 'yes' : 'no', p.hmrcReconciled ? 'yes' : 'no', p.importBatch, p.id]),
      );
      break;
    }
    case 'invoices': {
      const [ops, standalone] = await Promise.all([
        prisma.opsBooking.findMany({ where: { invoicedAt: { not: null }, paidAt: null }, include: { client: { select: { companyName: true } }, assignments: { include: assignmentInclude }, costs: true } }),
        prisma.booking.findMany({ where: { opsBookingId: null, invoicedAt: { not: null }, clientPaidAt: null }, include: { client: { select: { companyName: true } } } }),
      ]);
      csv = toCsv(
        ['source', 'reference', 'invoice_ref', 'client', 'event_date', 'invoiced_at', 'amount', 'days_outstanding'],
        [
          ...ops.map((b) => ['ops', b.reference, b.invoiceRef, b.client.companyName, dateKey(b.eventDate), b.invoicedAt, pounds(bookingProfit(b.assignments.map(profitAssignment), b.costs).revenuePence), Math.floor((Date.now() - b.invoicedAt!.getTime()) / 86400000)]),
          ...standalone.map((b) => ['shift', b.id, b.invoiceRef, b.client.companyName, dateKey(b.eventDate), b.invoicedAt, Number(b.totalEstimated ?? 0).toFixed(2), Math.floor((Date.now() - b.invoicedAt!.getTime()) / 86400000)]),
        ],
      );
      break;
    }
    default:
      fail(404, 'Unknown export');
  }

  await writeAudit(actor, { action: 'EXPORT_DOWNLOADED', entityType: 'Export', entityId: name });
  sendCsv(res, `vergo-${name}-${today}.csv`, csv);
}));

export default r;
