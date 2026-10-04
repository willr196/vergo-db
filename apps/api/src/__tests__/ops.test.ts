import test from 'node:test';
import assert from 'node:assert/strict';

import { computeReadiness, opsRtwStatus, rtwExpiryBucket, contractPosition, kidPosition, looksLikeShareCode, type ReadinessInput } from '../ops/compliance';
import { bookingProfit, type ProfitAssignment } from '../ops/profit';
import { findOverlaps, assignmentWarnings, canProceed, type AssignmentCheckInput } from '../ops/assignments';
import { awrWeeks, AWR_LABEL } from '../ops/awr';
import { pensionAlerts, thresholdsFor, periodThresholdPence } from '../ops/pension';
import { shiftInterval, londonInstant, afterMidnightHours, weekStartKey, taxYearOf, ageOn } from '../ops/time';
import { toCsv, parseCsv, relevantPeriodEnd } from '../ops/records';
import { renderTemplate, needsWording, DEFAULT_TEMPLATES } from '../ops/documents';

// ── Ready for Work ─────────────────────────────────────────────────────────

const READY: ReadinessInput = {
  activeStatus: 'ACTIVE', rtwStatus: 'valid', contractStatus: 'accepted', kidStatus: 'issued',
  email: 'a@b.com', phone: '07700900000', emergencyContactName: 'Sam', emergencyContactPhone: '07700900001',
  payrollStatus: 'ACTIVE', override: { active: false, reason: null },
};

test('a worker with everything in place is ready', () => {
  const r = computeReadiness(READY);
  assert.equal(r.ready, true);
  assert.equal(r.computedReady, true);
  assert.deepEqual(r.missing, []);
});

test('readiness lists exactly what is missing', () => {
  const r = computeReadiness({ ...READY, rtwStatus: 'expired', contractStatus: 'issued', kidStatus: 'not_issued', emergencyContactPhone: '  ', payrollStatus: 'PENDING' });
  assert.equal(r.ready, false);
  assert.deepEqual(r.missing, [
    'Right to work has expired',
    'Zero-hours agreement issued but not accepted',
    'Key Information Document not issued',
    'Emergency contact missing',
    'Payroll onboarding pending',
  ]);
});

test('an inactive worker is never computed ready', () => {
  assert.equal(computeReadiness({ ...READY, activeStatus: 'INACTIVE' }).computedReady, false);
});

test('an override needs a reason, and keeps the missing list visible', () => {
  const noReason = computeReadiness({ ...READY, kidStatus: 'not_issued', override: { active: true, reason: '  ' } });
  assert.equal(noReason.ready, false);
  const withReason = computeReadiness({ ...READY, kidStatus: 'not_issued', override: { active: true, reason: 'KID sent by post, awaiting scan' } });
  assert.equal(withReason.ready, true);
  assert.equal(withReason.overridden, true);
  assert.equal(withReason.computedReady, false);
  assert.deepEqual(withReason.missing, ['Key Information Document not issued']);
});

// ── Right to work ──────────────────────────────────────────────────────────

const NOW = new Date('2026-10-03T12:00:00Z');

test('RTW status follows the check history, a block and a due follow-up', () => {
  const passed = { status: 'PASSED' as const, expiresAt: new Date('2027-01-01T00:00:00Z') };
  assert.equal(opsRtwStatus({ summary: passed, followUpDue: null, blocked: false }, NOW), 'valid');
  assert.equal(opsRtwStatus({ summary: passed, followUpDue: new Date('2026-10-01T00:00:00Z'), blocked: false }, NOW), 'follow_up_required');
  assert.equal(opsRtwStatus({ summary: passed, followUpDue: null, blocked: true }, NOW), 'blocked');
  assert.equal(opsRtwStatus({ summary: { status: 'FAILED', expiresAt: null }, followUpDue: null, blocked: false }, NOW), 'blocked');
  assert.equal(opsRtwStatus({ summary: { status: 'EXPIRED', expiresAt: null }, followUpDue: null, blocked: false }, NOW), 'expired');
  assert.equal(opsRtwStatus({ summary: { status: 'NOT_CHECKED', expiresAt: null }, followUpDue: null, blocked: false }, NOW), 'not_checked');
});

test('RTW expiry warnings fall into expired, 30 and 60 day buckets', () => {
  const at = (d: string) => ({ status: 'PASSED' as const, expiresAt: new Date(`${d}T00:00:00Z`) });
  assert.equal(rtwExpiryBucket(at('2026-10-02'), NOW), 'expired');
  assert.equal(rtwExpiryBucket(at('2026-10-03'), NOW), 'within_30');
  assert.equal(rtwExpiryBucket(at('2026-11-02'), NOW), 'within_30');
  assert.equal(rtwExpiryBucket(at('2026-11-03'), NOW), 'within_60');
  assert.equal(rtwExpiryBucket(at('2026-12-02'), NOW), 'within_60');
  assert.equal(rtwExpiryBucket(at('2026-12-03'), NOW), 'later');
  assert.equal(rtwExpiryBucket({ status: 'PASSED', expiresAt: null }, NOW), 'no_expiry');
  assert.equal(rtwExpiryBucket({ status: 'NOT_CHECKED', expiresAt: null }, NOW), 'no_check');
  assert.equal(rtwExpiryBucket({ status: 'EXPIRED', expiresAt: new Date('2026-09-01') }, NOW), 'expired');
});

test('share codes are recognised so they are never stored', () => {
  assert.equal(looksLikeShareCode('W2X 4Y6 Z8A'), true);
  assert.equal(looksLikeShareCode('w2x4y6z8a'), true);
  assert.equal(looksLikeShareCode('Profile PDF, RTW folder'), false);
  assert.equal(looksLikeShareCode('123456789'), false);
});

// ── Document version status ───────────────────────────────────────────────

const doc = (status: 'ISSUED' | 'ACCEPTED' | 'SUPERSEDED' | 'WITHDRAWN', version: number, issued: string, accepted?: string) =>
  ({ status, version, issuedAt: new Date(issued), acceptedAt: accepted ? new Date(accepted) : null });

test('contract status: none, issued, accepted, superseded', () => {
  assert.equal(contractPosition([], 1).status, 'not_issued');
  assert.equal(contractPosition([doc('ISSUED', 1, '2026-09-01')], 1).status, 'issued');
  const accepted = contractPosition([doc('SUPERSEDED', 1, '2026-08-01'), doc('ACCEPTED', 2, '2026-09-01', '2026-09-02')], 2);
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.version, 2);
  assert.equal(accepted.newerVersionAvailable, false);
  assert.equal(contractPosition([doc('SUPERSEDED', 1, '2026-08-01')], 2).status, 'superseded');
  assert.equal(contractPosition([doc('WITHDRAWN', 1, '2026-08-01')], 2).status, 'not_issued');
});

test('an accepted older version is flagged when a newer template exists', () => {
  const p = contractPosition([doc('ACCEPTED', 1, '2026-08-01', '2026-08-02')], 3);
  assert.equal(p.status, 'accepted');
  assert.equal(p.newerVersionAvailable, true);
});

test('KID status: issued or not, never accepted', () => {
  assert.equal(kidPosition([], 1).status, 'not_issued');
  assert.equal(kidPosition([doc('ISSUED', 1, '2026-09-01')], 1).status, 'issued');
  assert.equal(kidPosition([doc('SUPERSEDED', 1, '2026-09-01')], 1).status, 'superseded');
});

test('templates with gaps cannot be issued, and missing values show as gaps', () => {
  assert.equal(needsWording(DEFAULT_TEMPLATES.KEY_INFORMATION_DOCUMENT.body), true);
  assert.equal(needsWording(DEFAULT_TEMPLATES.ZERO_HOURS_AGREEMENT.body), true);
  assert.equal(needsWording(DEFAULT_TEMPLATES.ASSIGNMENT_CONFIRMATION.body), false);
  assert.equal(renderTemplate('Hi {{worker.name}}, {{ missing }}', { 'worker.name': 'Ana' }), 'Hi Ana, [not recorded: missing]');
});

// ── Assignment overlap and warnings ───────────────────────────────────────

test('overlap detection, including shifts past midnight; touching is not overlap', () => {
  const late = { id: 'a', label: 'late', ...shiftInterval('2026-10-03', '18:00', '01:00') };
  assert.equal(findOverlaps(shiftInterval('2026-10-04', '00:30', '04:00'), [late]).length, 1);
  assert.equal(findOverlaps(shiftInterval('2026-10-04', '01:00', '05:00'), [late]).length, 0);
  assert.equal(findOverlaps(shiftInterval('2026-10-03', '12:00', '18:00'), [late]).length, 0);
  assert.equal(findOverlaps(shiftInterval('2026-10-03', '17:00', '19:00'), [late]).length, 1);
});

const CHECK: AssignmentCheckInput = {
  rtwStatus: 'valid', contractStatus: 'accepted', kidStatus: 'issued', activeStatus: 'ACTIVE',
  availabilityStatus: 'AVAILABLE', availabilityWindows: [], shiftDate: '2026-10-10', overlaps: [],
  requiredRole: 'Bar staff', workerRoles: ['bar staff', 'Waiting staff'], requiredQualifications: ['Personal Licence'], workerQualifications: ['personal licence'],
};

test('a clean worker raises no warnings', () => {
  assert.deepEqual(assignmentWarnings(CHECK), []);
  assert.deepEqual(canProceed([], null), { ok: true, needsReason: false });
});

test('RTW blocks outright; other warnings need a reason', () => {
  const blocked = assignmentWarnings({ ...CHECK, rtwStatus: 'expired' });
  assert.equal(blocked[0].code, 'rtw');
  assert.equal(blocked[0].blocking, true);
  assert.equal(canProceed(blocked, 'urgent cover needed').ok, false);

  const soft = assignmentWarnings({
    ...CHECK, kidStatus: 'not_issued', availabilityWindows: [{ from: '2026-11-01', to: '2026-11-30' }],
    requiredRole: 'Chef', requiredQualifications: ['Food Hygiene L2'],
    overlaps: [{ id: 'x', label: 'other shift', start: new Date(), end: new Date() }],
  });
  assert.deepEqual(soft.map((w) => w.code), ['documents', 'unavailable', 'overlap', 'role', 'qualification']);
  assert.ok(soft.every((w) => !w.blocking));
  assert.deepEqual(canProceed(soft, null), { ok: false, needsReason: true });
  assert.deepEqual(canProceed(soft, 'Client asked for her by name'), { ok: true, needsReason: false });
});

// ── Booking profitability ─────────────────────────────────────────────────

const shift = (over: Partial<ProfitAssignment> = {}): ProfitAssignment => ({
  status: 'COMPLETED', hours: 6, hoursAreActual: true, minimumHours: null,
  clientRatePence: 1850, payRatePence: 1271, afterMidnightHours: 0, afterMidnightMultiplier: 1.25,
  niLiable: false, pensionEnrolled: false, travelPence: 0, expensesPence: 0, ...over,
});

test('profit: revenue, wages, holiday pay and contribution for a simple shift', () => {
  const p = bookingProfit([shift()], []);
  assert.equal(p.revenuePence, 11100); // 6 × £18.50
  assert.equal(p.workerWagesPence, 7626); // 6 × £12.71
  assert.equal(p.holidayPayPence, 920); // 12.07%
  assert.equal(p.employerCostsPence, 0);
  assert.equal(p.grossContributionPence, 11100 - 7626 - 920);
  assert.ok(Math.abs((p.grossMargin ?? 0) - (11100 - 7626 - 920) / 11100) < 1e-9);
  assert.equal(p.isEstimate, true, 'estimate until actual payroll is entered');
});

test('profit: the minimum applies to charge and pay, and uplift applies after midnight', () => {
  const p = bookingProfit([shift({ hours: 3, afterMidnightHours: 1 })], []);
  assert.equal(p.billableHours, 4);
  assert.equal(p.revenue.hoursPence, 7400);
  assert.equal(p.revenue.afterMidnightPence, Math.round(1850 * 1 * 0.25));
  assert.equal(p.workerWagesPence, 5084);
});

test('profit: declined, cancelled and no-show shifts are not counted', () => {
  const p = bookingProfit([shift(), shift({ status: 'REJECTED' }), shift({ status: 'CANCELLED' }), shift({ status: 'NO_SHOW' })], []);
  assert.equal(p.countedAssignments, 1);
});

test('profit: employer NI and pension only for flagged workers; costs and charges included', () => {
  const p = bookingProfit(
    [shift({ niLiable: true, pensionEnrolled: true, travelPence: 500, expensesPence: 200 })],
    [{ kind: 'CHARGE', category: 'charge', amountPence: 5000 }, { kind: 'COST', category: 'equipment', amountPence: 1200 }, { kind: 'COST', category: 'worker_other', amountPence: 300 }],
  );
  const base = 7626 + 920;
  assert.equal(p.employerCosts.niPence, Math.round(base * 0.138));
  assert.equal(p.employerCosts.pensionPence, Math.round(base * 0.03));
  assert.equal(p.revenuePence, 11100 + 5000);
  assert.equal(p.otherDirectCostsPence, 1200);
  assert.equal(p.otherWorkerCostsPence, 300);
  assert.equal(p.workerTravelExpensesPence, 700);
  assert.equal(p.grossContributionPence, p.revenuePence - p.directLabourCostPence - 1200);
});

test('profit: actual payroll figures replace the estimates', () => {
  const p = bookingProfit([shift()], [], { wagesPence: 8000, holidayPayPence: 966, employerCostsPence: 0 });
  assert.equal(p.workerWagesPence, 8000);
  assert.equal(p.holidayPayPence, 966);
  assert.equal(p.isEstimate, false);
  assert.deepEqual(p.basis, { wages: 'actual', holidayPay: 'actual', employerCosts: 'actual' });
  assert.equal(bookingProfit([shift({ hoursAreActual: false })], [], { wagesPence: 1, holidayPayPence: 1, employerCostsPence: 1 }).isEstimate, true);
});

test('profit: no revenue gives no margin rather than dividing by zero', () => {
  assert.equal(bookingProfit([], []).grossMargin, null);
});

// ── AWR ───────────────────────────────────────────────────────────────────

function weekly(start: string, count: number, gapAfter?: number, gapWeeks = 0) {
  const out: { date: string }[] = [];
  let t = Date.parse(`${start}T00:00:00Z`);
  for (let i = 0; i < count; i++) {
    out.push({ date: new Date(t).toISOString().slice(0, 10) });
    t += 7 * 86400000;
    if (gapAfter != null && i === gapAfter) t += gapWeeks * 7 * 86400000;
  }
  return out;
}

test('AWR: counts calendar weeks, warns at 10 and asks for review at 12', () => {
  assert.equal(awrWeeks(weekly('2026-06-01', 9), '2026-08-03').level, 'none');
  const ten = awrWeeks(weekly('2026-06-01', 10), '2026-08-10');
  assert.equal(ten.weeksAccumulated, 10);
  assert.equal(ten.level, 'warning');
  const twelve = awrWeeks(weekly('2026-06-01', 12), '2026-08-24');
  assert.equal(twelve.level, 'review_required');
  assert.equal(twelve.firstQualifyingDate, '2026-06-01');
  assert.equal(twelve.label, AWR_LABEL);
});

test('AWR: two shifts in one week count once', () => {
  assert.equal(awrWeeks([{ date: '2026-06-01' }, { date: '2026-06-06' }], '2026-06-10').weeksAccumulated, 1);
});

test('AWR: a six-week gap pauses, a seven-week gap resets', () => {
  const paused = awrWeeks(weekly('2026-03-02', 10, 4, 6), '2026-07-01');
  assert.equal(paused.weeksAccumulated, 10);
  assert.equal(paused.resetOccurred, false);
  const reset = awrWeeks(weekly('2026-03-02', 10, 4, 7), '2026-07-08');
  assert.equal(reset.weeksAccumulated, 5);
  assert.equal(reset.resetOccurred, true);
});

test('AWR: the count lapses once the current gap passes six weeks', () => {
  const run = weekly('2026-06-01', 11);
  const stillOn = awrWeeks(run, '2026-09-27');
  assert.equal(stillOn.weeksAccumulated, 11);
  assert.equal(stillOn.resetsIfNoWorkBy, '2026-10-04');
  const lapsed = awrWeeks(run, '2026-10-05');
  assert.equal(lapsed.weeksAccumulated, 0);
  assert.equal(lapsed.level, 'none');
});

// ── Pension alerts ────────────────────────────────────────────────────────

const TABLE = { '2025-26': { lowerQualifyingAnnual: 6240, earningsTriggerAnnual: 10000, upperQualifyingAnnual: 50270, verified: false } };
const pensionBase = {
  pensionStatus: 'NOT_ELIGIBLE_CURRENTLY', dateOfBirth: new Date('1998-05-01T00:00:00Z'), recentPeriodEarningsPence: 0,
  today: '2026-10-03', frequency: 'weekly' as const, statePensionAge: 66, table: TABLE, dutiesStartDate: '2025-01-01',
};

test('pension: no status is always an alert, and nothing runs before the duties start date', () => {
  assert.equal(pensionAlerts({ ...pensionBase, pensionStatus: 'NOT_ASSESSED', dutiesStartDate: null })[0].message, 'No pension status recorded.');
  assert.equal(pensionAlerts({ ...pensionBase, recentPeriodEarningsPence: 50000, dutiesStartDate: '2027-01-01' }).length, 0);
});

test('pension: pay above the trigger flags a possible eligible jobholder, using the latest thresholds on file', () => {
  assert.equal(periodThresholdPence(10000, 'weekly'), 19200);
  const alerts = pensionAlerts({ ...pensionBase, recentPeriodEarningsPence: 25000 });
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].message, /eligible jobholder/);
  assert.match(alerts[0].message, /using 2025-26 thresholds/);
  assert.equal(pensionAlerts({ ...pensionBase, pensionStatus: 'ENROLLED', recentPeriodEarningsPence: 25000 }).length, 0);
  assert.match(pensionAlerts({ ...pensionBase, recentPeriodEarningsPence: 15000 })[0].message, /opt in/);
  assert.equal(thresholdsFor(TABLE, '2024-25'), null);
});

// ── Time, CSV and direct hire ─────────────────────────────────────────────

test('London times are right either side of the clock change', () => {
  assert.equal(londonInstant('2026-07-01', '18:00').toISOString(), '2026-07-01T17:00:00.000Z');
  assert.equal(londonInstant('2026-12-01', '18:00').toISOString(), '2026-12-01T18:00:00.000Z');
  // Clocks go back 25 Oct 2026: a 22:00–06:00 shift that night is nine real hours.
  const night = shiftInterval('2026-10-24', '22:00', '06:00');
  assert.equal((night.end.getTime() - night.start.getTime()) / 3600000, 9);
  assert.equal(afterMidnightHours('20:00', '02:30'), 2.5);
  assert.equal(afterMidnightHours('09:00', '17:00'), 0);
  assert.equal(weekStartKey('2026-10-04'), '2026-09-28');
  assert.equal(taxYearOf('2026-04-05'), '2025-26');
  assert.equal(taxYearOf('2026-04-06'), '2026-27');
  assert.equal(ageOn(new Date('2004-10-04T00:00:00Z'), '2026-10-03'), 21);
});

test('CSV export neutralises formulas and round-trips through the parser', () => {
  const csv = toCsv(['name', 'note'], [['=HYPERLINK("x")', 'a, "b"\nc'], ['-5', null]]);
  const rows = parseCsv(csv);
  assert.deepEqual(rows[1], ['\'=HYPERLINK("x")', 'a, "b"\nc']);
  assert.deepEqual(rows[2], ['-5', '']);
});

test('direct hire: relevant period is the later of 14 weeks from first or 8 weeks after last', () => {
  assert.equal(relevantPeriodEnd('2026-01-05', '2026-01-10'), '2026-04-13');
  assert.equal(relevantPeriodEnd('2026-01-05', '2026-06-01'), '2026-07-28');
});
