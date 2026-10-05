/**
 * VERGO Ops documents and terms: the pure rules. The flows against a real
 * database are in src/__integration__/opsDocuments.test.ts.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  contractPosition, kidPosition, docPackStatus, computeReadiness, clientTermsPosition, clientTermsGate,
  type ReadinessInput, type IssuedDoc,
} from '../ops/compliance';
import { assignmentWarnings, canProceed, type AssignmentCheckInput } from '../ops/assignments';
import {
  DEFAULT_TEMPLATES, kidExampleValues, cancellationLines, commercialTermsValues, templateKeys, renderTemplate,
  companyValues, variablesFor,
} from '../ops/documents';
import { DEFAULT_SETTINGS, commercialTermsHash } from '../ops/settings';

const d = (status: IssuedDoc['status'], version: number, issued: string, accepted?: string, acknowledged?: string): IssuedDoc =>
  ({ status, version, issuedAt: new Date(issued), acceptedAt: accepted ? new Date(accepted) : null, acknowledgedAt: acknowledged ? new Date(acknowledged) : null });

// ── Positions ─────────────────────────────────────────────────────────────

test('issuing a newer agreement does not cancel the one already agreed', () => {
  const p = contractPosition([d('ACCEPTED', 1, '2026-09-01', '2026-09-02'), d('ISSUED', 2, '2026-10-01')], { current: 2 });
  assert.equal(p.status, 'accepted');
  assert.equal(p.version, 1, 'the agreed version still counts');
  assert.equal(p.pendingVersion, 2);
  assert.equal(p.newerVersionAvailable, true);
  assert.equal(p.reacceptanceRequired, false);
});

test('a material change makes an older agreement stop counting', () => {
  const p = contractPosition([d('ACCEPTED', 1, '2026-09-01', '2026-09-02')], { current: 3, minAcceptable: 3 });
  assert.equal(p.status, 'accepted');
  assert.equal(p.reacceptanceRequired, true);
  const notMaterial = contractPosition([d('ACCEPTED', 1, '2026-09-01', '2026-09-02')], { current: 3, minAcceptable: 1 });
  assert.equal(notMaterial.reacceptanceRequired, false);
});

test('the KID position carries the acknowledgement', () => {
  const p = kidPosition([d('ISSUED', 2, '2026-10-01', undefined, '2026-10-02')], { current: 2 });
  assert.equal(p.status, 'issued');
  assert.deepEqual(p.acknowledgedAt, new Date('2026-10-02'));
  assert.equal(kidPosition([], { current: 2 }).status, 'not_issued');
});

test('documents outstanding: both, KID, contract, outdated, current', () => {
  const none = kidPosition([], { current: 1 });
  const kid = kidPosition([d('ISSUED', 1, '2026-10-01')], { current: 1 });
  const oldKid = kidPosition([d('ISSUED', 1, '2026-10-01')], { current: 2 });
  const noContract = contractPosition([], { current: 1 });
  const issuedContract = contractPosition([d('ISSUED', 1, '2026-10-01')], { current: 1 });
  const agreed = contractPosition([d('ACCEPTED', 1, '2026-10-01', '2026-10-02')], { current: 1 });
  assert.equal(docPackStatus(none, noContract), 'both_missing');
  assert.equal(docPackStatus(none, agreed), 'kid_missing');
  assert.equal(docPackStatus(kid, issuedContract), 'contract_missing');
  assert.equal(docPackStatus(oldKid, agreed), 'outdated');
  assert.equal(docPackStatus(kid, agreed), 'current');
});

// ── Ready for Work ────────────────────────────────────────────────────────

const READY: ReadinessInput = {
  activeStatus: 'ACTIVE', rtwStatus: 'valid', contractStatus: 'accepted', kidStatus: 'issued',
  email: 'a@b.com', phone: '07700900000', emergencyContactName: 'Sam', emergencyContactPhone: '07700900001',
  payrollStatus: 'ACTIVE', override: { active: false, reason: null },
};

test('Ready for Work is blocked when the KID is missing', () => {
  const r = computeReadiness({ ...READY, kidStatus: 'not_issued' });
  assert.equal(r.ready, false);
  assert.deepEqual(r.missing, ['Key Information Document not issued']);
});

test('Ready for Work is blocked when the agreement is missing or only issued', () => {
  assert.deepEqual(computeReadiness({ ...READY, contractStatus: 'not_issued' }).missing, ['Zero-hours agreement not issued']);
  assert.deepEqual(computeReadiness({ ...READY, contractStatus: 'issued' }).missing, ['Zero-hours agreement issued but not accepted']);
});

test('Ready for Work is blocked after a material change until the new version is agreed', () => {
  const r = computeReadiness({ ...READY, contractReacceptanceRequired: true });
  assert.equal(r.ready, false);
  assert.match(r.missing[0], /changed materially/);
  assert.equal(computeReadiness(READY).ready, true);
});

// ── Client terms ──────────────────────────────────────────────────────────

test('a private consumer never has the B2B Terms, whatever is on file', () => {
  const p = clientTermsPosition({ clientType: 'PRIVATE_CONSUMER', docs: [d('ACCEPTED', 1, '2026-10-01', '2026-10-02')], versions: { current: 1 } });
  assert.equal(p.status, 'consumer_terms_required');
  const gate = clientTermsGate(p);
  assert.equal(gate.ok, false);
  assert.match(gate.message!, /^Consumer booking terms required/);
});

test('business client terms: not issued, issued, accepted, older, material change', () => {
  const pos = (docs: IssuedDoc[], versions = { current: 2, minAcceptable: 1 as number | null }) => clientTermsPosition({ clientType: 'VENUE', docs, versions });
  assert.equal(pos([]).status, 'not_issued');
  assert.equal(pos([d('ISSUED', 2, '2026-10-01')]).status, 'issued');
  const older = pos([d('ACCEPTED', 1, '2026-09-01', '2026-09-02'), d('ISSUED', 2, '2026-10-01')]);
  assert.equal(older.status, 'accepted');
  assert.equal(older.acceptedVersion, 1);
  assert.equal(older.pendingVersion, 2);
  assert.equal(older.newerVersionAvailable, true);
  assert.equal(pos([d('ACCEPTED', 1, '2026-09-01', '2026-09-02')], { current: 2, minAcceptable: 2 }).status, 'reacceptance_required');
});

test('the booking gate warns until the business Terms are accepted', () => {
  const gate = (status: IssuedDoc['status']) => clientTermsGate(clientTermsPosition({ clientType: 'BUSINESS_HIRER', docs: [d(status, 1, '2026-10-01', status === 'ACCEPTED' ? '2026-10-02' : undefined)], versions: { current: 1 } }));
  assert.equal(gate('ISSUED').ok, false);
  assert.match(gate('ISSUED').message!, /^Client Terms not accepted/);
  assert.equal(gate('ACCEPTED').ok, true);
});

test('supplying staff without accepted terms needs a written reason, but is not blocked outright', () => {
  const base: AssignmentCheckInput = {
    rtwStatus: 'valid', contractStatus: 'accepted', kidStatus: 'issued', activeStatus: 'ACTIVE', availabilityStatus: null,
    availabilityWindows: [], shiftDate: '2026-10-10', overlaps: [], requiredRole: null, workerRoles: [], requiredQualifications: [], workerQualifications: [],
  };
  const warnings = assignmentWarnings({ ...base, clientTerms: { ok: false, message: 'Client Terms not accepted: not issued yet.' } });
  assert.deepEqual(warnings.map((w) => w.code), ['client_terms']);
  assert.equal(warnings[0].blocking, false);
  assert.deepEqual(canProceed(warnings, null), { ok: false, needsReason: true });
  assert.deepEqual(canProceed(warnings, 'Terms agreed by phone, signed copy to follow'), { ok: true, needsReason: false });
  assert.deepEqual(assignmentWarnings({ ...base, clientTerms: { ok: true, message: null } }), []);
});

// ── Wording and frozen values ─────────────────────────────────────────────

test('the KID carries the required title, explanation and facts', () => {
  const body = DEFAULT_TEMPLATES.KEY_INFORMATION_DOCUMENT.body;
  assert.ok(body.startsWith('# KEY INFORMATION DOCUMENT\n\nThis document contains key information relating to your relationship with VERGO'));
  for (const fact of ['zero-hours contract of employment', 'Normally monthly, on the last working day', 'does not charge you a fee', 'student loan', 'rolled-up holiday pay', 'Workplace pension']) {
    assert.ok(body.includes(fact), fact);
  }
});

test('the agreement and the KID are separate documents', () => {
  const agreement = DEFAULT_TEMPLATES.ZERO_HOURS_AGREEMENT.body;
  assert.ok(agreement.startsWith('# VERGO ZERO-HOURS EMPLOYMENT AGREEMENT'));
  assert.ok(!agreement.includes('KEY INFORMATION DOCUMENT'));
  assert.ok(!/exclusiv/i.test(agreement.replace('does not restrict you from working elsewhere', '')), 'no exclusivity clause');
});

test('the KID pay example never invents a tax result', () => {
  const v = kidExampleValues(DEFAULT_SETTINGS.kidPayExample);
  assert.match(v['example.incomeTax'], /Not illustrated/);
  assert.match(v['example.netPay'], /less the deductions/);
  const filled = kidExampleValues({ hours: 10, hourlyRate: 12.5, holidayPayPercent: 12.07, incomeTax: 0, employeeNi: 0, pension: 1, otherDeductions: null, note: null });
  assert.equal(filled['example.basePay'], '£125.00');
  assert.equal(filled['example.holidayPay'], '£15.09');
  assert.equal(filled['example.grossPay'], '£140.09');
  assert.match(filled['example.netPay'], /Gross pay less/, 'other deductions not given, so no net figure');
  const all = kidExampleValues({ hours: 10, hourlyRate: 12.5, holidayPayPercent: 12.07, incomeTax: 0, employeeNi: 0, pension: 1, otherDeductions: 0, note: null });
  assert.equal(all['example.netPay'], '£139.09 (illustrative)');
});

test('commercial terms render into the Terms and every placeholder is filled', () => {
  const values = commercialTermsValues(DEFAULT_SETTINGS.clientCommercialTerms);
  assert.equal(cancellationLines([{ withinHours: 48, percent: 10 }, { withinHours: 24, percent: 25 }]),
    '- Cancelled within 24 hours of the start: 25% of the Charges for the cancelled shifts\n- Cancelled within 48 hours of the start: 10% of the Charges for the cancelled shifts\n- Cancelled more than 48 hours before the start: no charge');
  const body = DEFAULT_TEMPLATES.CLIENT_TERMS_OF_BUSINESS.body;
  const rendered = renderTemplate(body, { ...companyValues(), ...values, today: 'today', 'doc.version': 1, 'doc.effectiveDate': 'today', 'client.legalName': 'Acme Ltd' });
  assert.ok(!rendered.includes('[not recorded'), rendered.match(/\[not recorded[^\]]*\]/)?.[0]);
  assert.ok(rendered.includes('15% of the Worker\'s anticipated gross remuneration for the first 12 months'));
  assert.ok(rendered.includes('extended period of hire'));
  assert.ok(rendered.includes('8 weeks'));
  assert.ok(rendered.includes('No transfer fee is payable for an Engagement that begins after the Relevant Period'));
  assert.ok(rendered.includes('National Insurance number, passport or right-to-work documents, or bank details'));
});

test('every placeholder in the worker documents has a value at issue', () => {
  const worker = { 'worker.name': 'Ana Silva', 'worker.firstName': 'Ana', 'worker.email': 'a@b.com', 'worker.phone': '07700900000' };
  for (const type of ['KEY_INFORMATION_DOCUMENT', 'ZERO_HOURS_AGREEMENT'] as const) {
    const frozen = variablesFor(type, DEFAULT_SETTINGS)?.values ?? {};
    const keys = templateKeys(DEFAULT_TEMPLATES[type].body);
    const known = { ...companyValues(), ...frozen, ...worker, today: 'x', 'doc.version': '1', 'doc.effectiveDate': 'x' };
    assert.deepEqual(keys.filter((k) => !(k in known)), [], type);
  }
});

test('the owner review fingerprint changes when any commercial term changes', () => {
  const base = DEFAULT_SETTINGS.clientCommercialTerms;
  const h = commercialTermsHash(base);
  assert.equal(h, commercialTermsHash({ ...base, cancellation: [...base.cancellation].reverse() }), 'tier order does not matter');
  assert.notEqual(h, commercialTermsHash({ ...base, transferFeePercent: 20 }));
  assert.notEqual(h, commercialTermsHash({ ...base, cancellation: [{ withinHours: 48, percent: 15 }, { withinHours: 24, percent: 25 }] }));
});
