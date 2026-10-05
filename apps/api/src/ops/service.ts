/**
 * Loads workers and bookings for VERGO Ops and decorates them with the
 * computed positions (RTW, documents, Ready for Work, pension alerts, profit).
 * Everything is loaded in bulk so a list of 300 workers is a handful of
 * queries, not 300 of them.
 */

import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../prisma';
import { summariseChecks, isCheckCurrent } from '../services/rightToWork';
import { PRICING, ON_COSTS } from '../config/pricing';
import {
  opsRtwStatus, rtwExpiryBucket, contractPosition, kidPosition, computeReadiness, docPackStatus, type IssuedDoc, type VersionInfo,
} from './compliance';
import { pensionAlerts, type PayFrequency } from './pension';
import { bookingProfit, type ProfitAssignment, type ProfitExtra } from './profit';
import { afterMidnightHours, dateKey, londonClock, londonDateKey, addDays } from './time';
import { loadOpsSettings, type OpsSettings } from './settings';
import type { OpsDocType } from './documents';
import { versionInfo, ensureDefaultTemplates } from './documentService';

export { ensureDefaultTemplates };

export const toNum = (v: Prisma.Decimal | number | null | undefined) => (v == null ? null : Number(v));
export const toPence = (v: Prisma.Decimal | number | null | undefined) => (v == null ? 0 : Math.round(Number(v) * 100));

// ── Workers ───────────────────────────────────────────────────────────────

/** Roster members, plus anyone else given an Ops profile. */
export const WORKER_WHERE: Prisma.UserWhereInput = {
  userType: 'JOB_SEEKER',
  OR: [{ staffTier: { not: null } }, { workerProfile: { isNot: null } }],
};

const workerInclude = {
  workerProfile: true,
  applicant: {
    select: {
      id: true, dateOfBirth: true, preferredRoles: true,
      rightToWorkChecks: {
        orderBy: { checkedAt: 'desc' as const },
        select: {
          id: true, method: true, outcome: true, documentType: true, reference: true, validFrom: true,
          expiresAt: true, checkedAt: true, checkedBy: true, performedBy: true,
          prescribedCheckConfirmed: true, followUpDue: true, notes: true, documentKey: true,
        },
      },
    },
  },
  workerDocuments: {
    where: { type: { in: ['ZERO_HOURS_AGREEMENT', 'KEY_INFORMATION_DOCUMENT'] as OpsDocType[] } },
    select: { id: true, type: true, status: true, version: true, issuedAt: true, acceptedAt: true, acknowledgedAt: true },
  },
} satisfies Prisma.UserInclude;

export type WorkerRow = Prisma.UserGetPayload<{ include: typeof workerInclude }>;

export async function currentTemplateVersions(): Promise<Record<string, number>> {
  const rows = await prisma.documentTemplate.groupBy({ by: ['type'], _max: { version: true }, where: { retiredAt: null } });
  return Object.fromEntries(rows.map((r) => [r.type, r._max.version ?? 0]));
}

interface WorkerContext {
  versions: Record<string, VersionInfo>;
  settings: OpsSettings;
  today: string;
  now: Date;
  firstLast: Map<string, { first: Date | null; last: Date | null }>;
  periodEarnings: Map<string, number>;
}

/** Highest estimated pay (wages + holiday) in any of the last three pay periods, per worker. */
async function recentPeriodEarnings(userIds: string[], frequency: PayFrequency, today: string) {
  const days = { weekly: 7, fortnightly: 14, four_weekly: 28, monthly: 31 }[frequency];
  const from = addDays(today, -days * 3);
  const rows = await prisma.booking.findMany({
    where: { staffId: { in: userIds }, status: 'COMPLETED', eventDate: { gte: new Date(`${from}T00:00:00Z`) } },
    select: { staffId: true, eventDate: true, hoursEstimated: true, staffPayRate: true },
  });
  const byWorker = new Map<string, number[]>();
  for (const row of rows) {
    const age = Math.floor((Date.parse(`${today}T00:00:00Z`) - row.eventDate.getTime()) / 86400000);
    const period = Math.min(2, Math.max(0, Math.floor(age / days)));
    const hours = Math.max(Number(row.hoursEstimated ?? 0), PRICING.minimumChargeHours);
    const wage = toPence(row.staffPayRate) * hours;
    const list = byWorker.get(row.staffId) ?? [0, 0, 0];
    list[period] += Math.round(wage * (1 + ON_COSTS.holidayAccrualRate));
    byWorker.set(row.staffId, list);
  }
  return new Map([...byWorker].map(([id, list]) => [id, Math.max(...list)]));
}

async function workerContext(userIds: string[]): Promise<WorkerContext> {
  const now = new Date();
  const today = londonDateKey(now);
  const [versions, settings, spans] = await Promise.all([
    versionInfo(),
    loadOpsSettings(),
    prisma.booking.groupBy({
      by: ['staffId'],
      where: { staffId: { in: userIds }, status: { in: ['CONFIRMED', 'COMPLETED'] } },
      _min: { eventDate: true },
      _max: { eventDate: true },
    }),
  ]);
  const periodEarnings = await recentPeriodEarnings(userIds, settings.payFrequency, today);
  const firstLast = new Map(spans.map((s) => [s.staffId, { first: s._min.eventDate, last: s._max.eventDate }]));
  return { versions, settings, today, now, firstLast, periodEarnings };
}

export function shapeWorker(user: WorkerRow, ctx: WorkerContext) {
  const profile = user.workerProfile;
  const checks = user.applicant?.rightToWorkChecks ?? [];
  const summary = summariseChecks(checks, ctx.now);
  const clearingCheck = checks.find((c) => isCheckCurrent(c, ctx.now)) ?? null;
  const rtwStatus = opsRtwStatus({
    summary,
    followUpDue: clearingCheck?.followUpDue ?? null,
    blocked: profile?.rtwBlocked ?? false,
  }, ctx.now);

  const docsOf = (type: string): IssuedDoc[] => user.workerDocuments
    .filter((d) => d.type === type)
    .map((d) => ({ status: d.status, version: d.version, issuedAt: d.issuedAt, acceptedAt: d.acceptedAt, acknowledgedAt: d.acknowledgedAt }));
  const contract = contractPosition(docsOf('ZERO_HOURS_AGREEMENT'), ctx.versions.ZERO_HOURS_AGREEMENT ?? { current: null });
  const kid = kidPosition(docsOf('KEY_INFORMATION_DOCUMENT'), ctx.versions.KEY_INFORMATION_DOCUMENT ?? { current: null });

  const activeStatus = profile?.activeStatus ?? 'ACTIVE';
  const payrollStatus = profile?.payrollStatus ?? 'NOT_ADDED';
  const readiness = computeReadiness({
    activeStatus,
    rtwStatus,
    contractStatus: contract.status,
    kidStatus: kid.status,
    contractReacceptanceRequired: contract.reacceptanceRequired,
    kidReissueRequired: kid.reacceptanceRequired,
    email: user.email,
    phone: user.phone,
    emergencyContactName: profile?.emergencyContactName ?? null,
    emergencyContactPhone: profile?.emergencyContactPhone ?? null,
    payrollStatus,
    override: { active: profile?.readyOverride ?? false, reason: profile?.readyOverrideReason ?? null },
  });

  const pensionStatus = profile?.pensionStatus ?? 'NOT_ASSESSED';
  const dob = user.applicant?.dateOfBirth ?? null;
  const alerts = pensionAlerts({
    pensionStatus,
    dateOfBirth: dob,
    recentPeriodEarningsPence: ctx.periodEarnings.get(user.id) ?? 0,
    today: ctx.today,
    frequency: ctx.settings.payFrequency,
    statePensionAge: ctx.settings.statePensionAge,
    table: ctx.settings.pensionThresholds,
    dutiesStartDate: ctx.settings.pensionDutiesStartDate,
  });

  const span = ctx.firstLast.get(user.id);
  const roles = profile?.roles?.length ? profile.roles : (user.applicant?.preferredRoles ?? []);

  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    name: `${user.firstName} ${user.lastName}`.trim(),
    email: user.email,
    phone: user.phone,
    dateOfBirth: dob ? dateKey(dob) : null,
    staffTier: user.staffTier,
    availabilityStatus: user.availabilityStatus,
    /** The app's availability switch means something only once the worker has logged in. */
    usesApp: user.lastLoginAt != null,
    hasProfile: Boolean(profile),
    applicantId: user.applicant?.id ?? null,
    activeStatus,
    roles,
    qualifications: profile?.qualifications ?? [],
    experienceNotes: profile?.experienceNotes ?? null,
    internalNotes: profile?.internalNotes ?? null,
    rating: profile?.internalRating ?? (user.staffRating != null ? Math.round(Number(user.staffRating)) : null),
    availabilityNotes: profile?.availabilityNotes ?? null,
    defaultPayRate: toNum(profile?.defaultPayRate),
    emergencyContactName: profile?.emergencyContactName ?? null,
    emergencyContactPhone: profile?.emergencyContactPhone ?? null,
    rtw: {
      status: rtwStatus,
      label: summary.label,
      expiresAt: summary.expiresAt ? dateKey(summary.expiresAt) : null,
      expiryBucket: rtwExpiryBucket(summary, ctx.now),
      checkedAt: summary.checkedAt,
      checkedBy: summary.checkedBy,
      followUpDue: clearingCheck?.followUpDue ? dateKey(clearingCheck.followUpDue) : null,
      confirmationMissing: clearingCheck != null && clearingCheck.prescribedCheckConfirmed !== true,
      blocked: profile?.rtwBlocked ?? false,
      blockedReason: profile?.rtwBlockedReason ?? null,
      checks: checks.map((c) => ({
        id: c.id, method: c.method, outcome: c.outcome, documentType: c.documentType,
        evidenceReference: c.reference, validFrom: c.validFrom, expiresAt: c.expiresAt,
        checkedAt: c.checkedAt, checkedBy: c.checkedBy, performedBy: c.performedBy,
        prescribedCheckConfirmed: c.prescribedCheckConfirmed, followUpDue: c.followUpDue,
        notes: c.notes, hasDocument: Boolean(c.documentKey),
      })),
    },
    contract,
    kid,
    documentPack: docPackStatus(kid, contract),
    payrollStatus,
    payrollExternalReference: profile?.payrollExternalReference ?? null,
    pensionStatus,
    pensionLastAssessedAt: profile?.pensionLastAssessedAt ?? null,
    pensionNotes: profile?.pensionNotes ?? null,
    pensionAlerts: alerts,
    readiness,
    readyOverride: {
      active: profile?.readyOverride ?? false,
      reason: profile?.readyOverrideReason ?? null,
      by: profile?.readyOverrideBy ?? null,
      at: profile?.readyOverrideAt ?? null,
    },
    firstAssignmentDate: span?.first ? dateKey(span.first) : null,
    lastAssignmentDate: span?.last ? dateKey(span.last) : null,
  };
}

export type WorkerView = ReturnType<typeof shapeWorker>;

export async function loadWorkers(where: Prisma.UserWhereInput = {}): Promise<WorkerView[]> {
  const users = await prisma.user.findMany({
    where: { AND: [WORKER_WHERE, where] },
    include: workerInclude,
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  const ctx = await workerContext(users.map((u) => u.id));
  return users.map((u) => shapeWorker(u, ctx));
}

export async function loadWorker(id: string): Promise<WorkerView | null> {
  const [worker] = await loadWorkers({ id });
  return worker ?? null;
}

/**
 * The Applicant row that holds a worker's right-to-work history and date of
 * birth. Links an unlinked applicant with the same email rather than making a
 * second one; refuses if that applicant already belongs to someone else.
 */
export async function ensureApplicant(userId: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, applicantId: true, email: true, firstName: true, lastName: true, phone: true } });
  if (!user) throw Object.assign(new Error('Worker not found'), { statusCode: 404 });
  if (user.applicantId) return user.applicantId;
  const existing = await db.applicant.findUnique({ where: { email: user.email }, select: { id: true, user: { select: { id: true } } } });
  if (existing?.user && existing.user.id !== user.id) {
    throw Object.assign(new Error('An applicant record with this email belongs to another account.'), { statusCode: 409 });
  }
  const applicantId = existing?.id ?? (await db.applicant.create({
    data: { firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone },
    select: { id: true },
  })).id;
  await db.user.update({ where: { id: user.id }, data: { applicantId } });
  return applicantId;
}

/** A password nobody knows. The worker can set their own through the normal reset flow. */
export async function unusablePasswordHash() {
  return bcrypt.hash(randomBytes(32).toString('hex'), 12);
}

// ── Bookings and profit ───────────────────────────────────────────────────

export const assignmentInclude = {
  staff: { select: { id: true, firstName: true, lastName: true, niLiable: true, pensionEnrolled: true } },
  requirement: true,
} satisfies Prisma.BookingInclude;

export type AssignmentRow = Prisma.BookingGetPayload<{ include: typeof assignmentInclude }>;

/** Worked hours net of the unpaid break, when attendance is recorded. */
export function netWorkedHours(row: { hoursWorked: Prisma.Decimal | null; breakMins: number | null }): number | null {
  if (row.hoursWorked == null) return null;
  return Math.max(0, Number(row.hoursWorked) - (row.breakMins ?? 0) / 60);
}

export function profitAssignment(row: AssignmentRow): ProfitAssignment {
  const worked = netWorkedHours(row);
  const completed = row.status === 'COMPLETED';
  const hours = completed ? Number(row.hoursEstimated ?? 0) : worked ?? Number(row.hoursEstimated ?? 0);
  const startClock = row.checkedInAt ? londonClock(row.checkedInAt) : row.shiftStart;
  const endClock = row.checkedOutAt ? londonClock(row.checkedOutAt) : row.shiftEnd;
  let midnight = 0;
  try { midnight = afterMidnightHours(startClock, endClock); } catch { midnight = 0; }
  const req = row.requirement;
  return {
    status: row.status,
    hours,
    hoursAreActual: completed || worked != null,
    minimumHours: toNum(req?.minimumHours) ?? null,
    clientRatePence: toPence(row.hourlyRateCharged),
    payRatePence: toPence(row.staffPayRate),
    afterMidnightHours: midnight,
    afterMidnightMultiplier: toNum(req?.afterMidnightMultiplier),
    niLiable: row.staff.niLiable,
    pensionEnrolled: row.staff.pensionEnrolled,
    travelPence: toPence(req?.travelContribution),
    expensesPence: toPence(req?.expenses),
  };
}

export function opsBookingProfit(booking: {
  assignments: AssignmentRow[];
  costs: Array<{ kind: 'CHARGE' | 'COST'; category: string; amountPence: number }>;
  actualWagesPence: number | null;
  actualHolidayPayPence: number | null;
  actualEmployerCostsPence: number | null;
}) {
  const extras: ProfitExtra[] = booking.costs.map((c) => ({ kind: c.kind, category: c.category, amountPence: c.amountPence }));
  return bookingProfit(booking.assignments.map(profitAssignment), extras, {
    wagesPence: booking.actualWagesPence,
    holidayPayPence: booking.actualHolidayPayPence,
    employerCostsPence: booking.actualEmployerCostsPence,
  });
}

export const opsBookingInclude = {
  client: { select: { id: true, companyName: true, tradingName: true, clientType: true, industry: true, termsAcceptedAt: true, termsVersion: true, defaultChargeRate: true } },
  requirements: { orderBy: { createdAt: 'asc' as const } },
  costs: { orderBy: { createdAt: 'asc' as const } },
  assignments: { include: assignmentInclude, orderBy: { createdAt: 'asc' as const } },
  series: { select: { id: true, weekdays: true, startsOn: true, endsOn: true, active: true, aheadWeeks: true, generatedThrough: true, patternBookingId: true, patternBooking: { select: { reference: true } } } },
} satisfies Prisma.OpsBookingInclude;

export type OpsBookingRow = Prisma.OpsBookingGetPayload<{ include: typeof opsBookingInclude }>;

/** Assignments that fill a slot: offered, accepted or done. */
export const FILLING_STATUSES = new Set(['PENDING', 'CONFIRMED', 'COMPLETED']);

export function staffingOf(booking: OpsBookingRow) {
  const required = booking.requirements.reduce((s, r) => s + r.quantity, 0);
  const filled = booking.assignments.filter((a) => FILLING_STATUSES.has(a.status)).length;
  const confirmed = booking.assignments.filter((a) => a.status === 'CONFIRMED' || a.status === 'COMPLETED').length;
  return { required, filled, confirmed, unfilled: Math.max(0, required - filled), fullyStaffed: required > 0 && confirmed >= required };
}

export function shapeOpsBooking(booking: OpsBookingRow) {
  const profit = opsBookingProfit(booking);
  return {
    id: booking.id,
    reference: booking.reference,
    status: booking.status,
    client: booking.client,
    bookingType: booking.bookingType,
    eventType: booking.eventType,
    venue: booking.venue,
    address: booking.address,
    eventDate: dateKey(booking.eventDate),
    startTime: booking.startTime,
    expectedFinish: booking.expectedFinish,
    actualFinish: booking.actualFinish,
    guestNumbers: booking.guestNumbers,
    onSiteContactName: booking.onSiteContactName,
    onSiteContactPhone: booking.onSiteContactPhone,
    vergoLead: booking.vergoLead,
    notes: booking.notes,
    consumerTermsRequired: booking.consumerTermsRequired,
    advancePaymentRequired: booking.advancePaymentRequired,
    paymentTermsDays: booking.paymentTermsDays,
    termsVersionAtBooking: booking.termsVersionAtBooking,
    invoiceRef: booking.invoiceRef,
    invoicedAt: booking.invoicedAt,
    paidAt: booking.paidAt,
    series: booking.series ? {
      id: booking.series.id,
      weekdays: booking.series.weekdays,
      startsOn: dateKey(booking.series.startsOn),
      endsOn: booking.series.endsOn ? dateKey(booking.series.endsOn) : null,
      active: booking.series.active,
      aheadWeeks: booking.series.aheadWeeks,
      generatedThrough: booking.series.generatedThrough ? dateKey(booking.series.generatedThrough) : null,
      patternBookingId: booking.series.patternBookingId,
      patternReference: booking.series.patternBooking.reference,
    } : null,
    actualPayroll: {
      wagesPence: booking.actualWagesPence,
      holidayPayPence: booking.actualHolidayPayPence,
      employerCostsPence: booking.actualEmployerCostsPence,
      note: booking.actualPayrollNote,
      recordedBy: booking.actualPayrollRecordedBy,
      recordedAt: booking.actualPayrollRecordedAt,
    },
    requirements: booking.requirements.map((r) => ({
      ...r,
      clientChargeRate: toNum(r.clientChargeRate),
      workerPayRate: toNum(r.workerPayRate),
      minimumHours: toNum(r.minimumHours),
      afterMidnightMultiplier: toNum(r.afterMidnightMultiplier),
      travelContribution: toNum(r.travelContribution),
      expenses: toNum(r.expenses),
      overtimeChargeRate: toNum(r.overtimeChargeRate),
      overtimeAfterHours: toNum(r.overtimeAfterHours),
    })),
    costs: booking.costs,
    assignments: booking.assignments.map(shapeAssignment),
    staffing: staffingOf(booking),
    profit,
  };
}

export function shapeAssignment(a: AssignmentRow) {
  const net = netWorkedHours(a);
  const status = a.status === 'CANCELLED' && a.replacedByBookingId ? 'REPLACED' : a.status;
  return {
    id: a.id,
    status,
    rawStatus: a.status,
    opsBookingId: a.opsBookingId,
    requirementId: a.requirementId,
    worker: { id: a.staff.id, name: `${a.staff.firstName} ${a.staff.lastName}`.trim() },
    role: a.role ?? a.requirement?.role ?? null,
    date: dateKey(a.eventDate),
    plannedStart: a.shiftStart,
    plannedFinish: a.shiftEnd,
    actualStart: a.checkedInAt,
    actualFinish: a.checkedOutAt,
    breakMins: a.breakMins,
    scheduledHours: toNum(a.hoursEstimated),
    actualHours: toNum(a.hoursWorked),
    netWorkedHours: net,
    billableHours: (() => {
      const hours = a.status === 'COMPLETED' ? Number(a.hoursEstimated ?? 0) : net ?? Number(a.hoursEstimated ?? 0);
      return Math.max(hours, toNum(a.requirement?.minimumHours) ?? PRICING.minimumChargeHours);
    })(),
    payRate: toNum(a.staffPayRate),
    clientChargeRate: toNum(a.hourlyRateCharged),
    holidayPayMethod: a.holidayPayMethod,
    warningOverrideReason: a.warningOverrideReason,
    replacedByBookingId: a.replacedByBookingId,
    timesheet: {
      clientApprovedAt: a.timesheetClientApprovedAt,
      clientApprovedBy: a.timesheetClientApprovedBy,
      adminApprovedAt: a.timesheetAdminApprovedAt,
      adminApprovedBy: a.timesheetAdminApprovedBy,
      disputedAt: a.timesheetDisputedAt,
      disputeReason: a.timesheetDisputeReason,
    },
    invoicedAt: a.invoicedAt,
    clientPaidAt: a.clientPaidAt,
  };
}

export async function nextBookingReference(eventYear: number): Promise<string> {
  const prefix = `VB-${eventYear}-`;
  const last = await prisma.opsBooking.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: 'desc' },
    select: { reference: true },
  });
  const n = last ? Number(last.reference.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(4, '0')}`;
}

export { loadOpsSettings };
