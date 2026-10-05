/**
 * VERGO Ops worker documents and client Terms of Business, against a real
 * database: the onboarding order, acceptance through the secure links,
 * version retention, the booking gate, assignment confirmations, and that a
 * link (or no session) can never reach anyone else's documents.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import { prisma, resetDatabase, disconnect, csrfHeaders, inject } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ADMIN_TEST_SESSION_ID } = require('../testing/csrf');

/** The Ops API as an admin, the Ops API with no session, and the public link routes. */
function createApp() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const opsApi = require('../routes/ops').default;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const links = require('../routes/documentLinks');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cookieParser = require('cookie-parser');
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use((req: any, _res: any, next: any) => {
    const as = req.headers['x-test-as'];
    if (as === 'admin') req.session = { id: ADMIN_TEST_SESSION_ID, username: 'will', isAdmin: true };
    else if (typeof as === 'string' && as.startsWith('worker:')) req.session = { id: 'w', isUser: true, userId: as.slice(7) };
    else req.session = undefined;
    next();
  });
  app.use('/api/v1/ops', opsApi);
  app.use('/d', links.pages);
  app.use('/api/v1/document-links', links.api);
  return app;
}

const app = createApp();
const admin = (method: string, url: string, body?: unknown) =>
  inject(app, { method, url: `/api/v1/ops${url}`, headers: { ...csrfHeaders(), 'x-test-as': 'admin' }, body });
const anon = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  inject(app, { method, url, headers, body });
const ok = (res: { statusCode: number; body: any }, status = 200) => {
  assert.equal(res.statusCode, status, JSON.stringify(res.body).slice(0, 500));
  return res.body.data;
};

test.beforeEach(async () => {
  await resetDatabase();
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "DocumentLink", "ClientDocument", "WorkerDocument", "DocumentTemplate", "OpsSetting", "AuditLog", "OpsBooking", "OpsRequirement", "WorkerProfile", "Applicant", "RightToWorkCheck" RESTART IDENTITY CASCADE');
});

test.after(async () => {
  await disconnect();
});

let n = 0;
async function newWorker(name = 'Ana') {
  n += 1;
  return ok(await admin('POST', '/workers', { firstName: name, lastName: 'Silva', email: `${name.toLowerCase()}${n}@example.com`, phone: '07700900000' }), 201);
}
async function newClient(clientType = 'BUSINESS_HIRER', name = 'Acme Events Ltd') {
  n += 1;
  return ok(await admin('POST', '/clients', { companyName: name, contactName: 'Jo Bloggs', email: `client${n}@example.com`, clientType, industry: 'Corporate events' }), 201);
}
/** Everything except the documents, so readiness turns only on the KID and agreement. */
async function makeOtherwiseReady(workerId: string) {
  ok(await admin('POST', `/workers/${workerId}/rtw-checks`, {
    method: 'DOCUMENT', performedOn: '2026-09-01', performedBy: 'Will', outcome: 'PASS', prescribedCheckConfirmed: true, documentType: 'UK passport',
  }), 201);
  ok(await admin('PATCH', `/workers/${workerId}`, { emergencyContactName: 'Sam', emergencyContactPhone: '07700900001', payrollStatus: 'ACTIVE' }));
}
const tokenOf = (link: { path: string }) => link.path.replace('/d/', '');
const linkApi = (token: string) => `/api/v1/document-links/${token}`;

// ── Worker onboarding ─────────────────────────────────────────────────────

test('the KID is issued before the agreement, and the agreement cannot be issued without it', async () => {
  const w = await newWorker();
  const early = await admin('POST', `/workers/${w.id}/documents`, { type: 'ZERO_HOURS_AGREEMENT' });
  assert.equal(early.statusCode, 400);
  assert.match(early.body.error, /Key Information Document first/);

  const pack = ok(await admin('POST', `/workers/${w.id}/documents/pack`, {}), 201);
  assert.deepEqual(pack.issued.map((x: any) => x.type), ['KEY_INFORMATION_DOCUMENT', 'ZERO_HOURS_AGREEMENT']);
  const docs = await prisma.workerDocument.findMany({ where: { userId: w.id }, orderBy: { issuedAt: 'asc' } });
  assert.equal(docs[0].type, 'KEY_INFORMATION_DOCUMENT');
  assert.ok(docs[0].issuedAt <= docs[1].issuedAt);
  assert.ok(docs[0].renderedBody.startsWith('# KEY INFORMATION DOCUMENT'));
  assert.ok(docs[1].renderedBody.includes('Ana Silva'));
  assert.ok(!docs[0].renderedBody.includes('[not recorded'), 'every KID placeholder filled');
  assert.ok(!docs[1].renderedBody.includes('[not recorded'), 'every agreement placeholder filled');

  const again = ok(await admin('POST', `/workers/${w.id}/documents/pack`, {}), 201);
  assert.deepEqual(again.issued, [], 'nothing reissued when the worker already has the current versions');
  const actions = (await prisma.auditLog.findMany({ where: { entityId: w.id } })).map((a) => a.action);
  assert.ok(actions.includes('KID_ISSUED') && actions.includes('CONTRACT_ISSUED'));
});

test('a worker acknowledges the KID, then agrees the agreement through their link', async () => {
  const w = await newWorker();
  await makeOtherwiseReady(w.id);
  const before = ok(await admin('GET', `/workers/${w.id}`));
  assert.equal(before.readiness.ready, false);
  assert.ok(before.readiness.missing.includes('Key Information Document not issued'), 'existing worker shows the missing KID');
  assert.ok(before.readiness.missing.includes('Zero-hours agreement not issued'));

  const pack = ok(await admin('POST', `/workers/${w.id}/documents/pack`, {}), 201);
  const token = tokenOf(pack.link);
  const state = ok(await anon('GET', linkApi(token)));
  const kidId = state.kid.id;
  const agreementId = state.pending.id;

  const mid = ok(await admin('GET', `/workers/${w.id}`));
  assert.deepEqual(mid.readiness.missing, ['Zero-hours agreement issued but not accepted'], 'KID issued counts; agreement not yet');

  // The agreement does not open until the KID is acknowledged.
  const tooSoon = await anon('POST', `${linkApi(token)}/agreement/${agreementId}/accept`, { agree: true, typedName: 'Ana Silva' });
  assert.equal(tooSoon.statusCode, 409);

  // A single "I agree" is not enough: the statement box and the typed name are both required.
  assert.equal((await anon('POST', `${linkApi(token)}/kid/${kidId}/acknowledge`, {})).statusCode, 400);
  ok(await anon('POST', `${linkApi(token)}/kid/${kidId}/acknowledge`, { acknowledged: true }));
  assert.equal((await anon('POST', `${linkApi(token)}/agreement/${agreementId}/accept`, { typedName: 'Ana Silva' })).statusCode, 400);
  assert.equal((await anon('POST', `${linkApi(token)}/agreement/${agreementId}/accept`, { agree: true, typedName: '' })).statusCode, 400);

  ok(await anon('POST', `${linkApi(token)}/agreement/${agreementId}/accept`, { agree: true, typedName: '  Ana   Silva ' }, { 'x-test-as': `worker:${w.id}` }));

  const agreed = await prisma.workerDocument.findUniqueOrThrow({ where: { id: agreementId } });
  assert.equal(agreed.status, 'ACCEPTED');
  assert.equal(agreed.acceptedName, 'Ana Silva');
  assert.equal(agreed.acceptanceStatement, 'I confirm I have read and agree to the VERGO Zero-Hours Employment Agreement.');
  assert.match(agreed.acceptanceMethod!, /secure link/);
  assert.equal(agreed.acceptedAuthUserId, w.id, 'signed-in worker identity recorded');
  assert.ok(agreed.acceptedViaLinkId);
  assert.ok(agreed.acceptedAt! >= agreed.issuedAt);
  const kid = await prisma.workerDocument.findUniqueOrThrow({ where: { id: kidId } });
  assert.ok(kid.acknowledgedAt && kid.issuedAt <= agreed.acceptedAt!);

  const after = ok(await admin('GET', `/workers/${w.id}`));
  assert.equal(after.readiness.ready, true);
  assert.equal(after.documentPack, 'current');

  const audit = await prisma.auditLog.findMany({ where: { entityId: w.id, action: { in: ['KID_ACKNOWLEDGED', 'CONTRACT_AGREED'] } } });
  assert.equal(audit.length, 2);
  assert.ok(!JSON.stringify(audit).includes('Ana Silva'), 'no typed name in the audit log');

  // Agreeing twice does nothing.
  assert.equal((await anon('POST', `${linkApi(token)}/agreement/${agreementId}/accept`, { agree: true, typedName: 'Ana Silva' })).statusCode, 409);
});

test('versions are kept: a new template version never changes what was agreed, or moves the acceptance', async () => {
  const w = await newWorker();
  await makeOtherwiseReady(w.id);
  const pack = ok(await admin('POST', `/workers/${w.id}/documents/pack`, {}), 201);
  const token = tokenOf(pack.link);
  const s = ok(await anon('GET', linkApi(token)));
  ok(await anon('POST', `${linkApi(token)}/kid/${s.kid.id}/acknowledge`, { acknowledged: true }));
  ok(await anon('POST', `${linkApi(token)}/agreement/${s.pending.id}/accept`, { agree: true, typedName: 'Ana Silva' }));
  const v1 = await prisma.workerDocument.findUniqueOrThrow({ where: { id: s.pending.id } });

  const templates = ok(await admin('GET', '/templates'));
  const current = templates.find((t: any) => t.type === 'ZERO_HOURS_AGREEMENT' && t.current);
  ok(await admin('POST', '/templates', { type: 'ZERO_HOURS_AGREEMENT', title: current.title, body: current.body + '\nA clarification.\n', changeNote: 'Clarify wording', effectiveDate: '2026-10-04' }), 201);

  const stillV1 = await prisma.workerDocument.findUniqueOrThrow({ where: { id: v1.id } });
  assert.equal(stillV1.renderedBody, v1.renderedBody, 'agreed text never edited');
  assert.equal(stillV1.status, 'ACCEPTED');
  assert.equal(stillV1.version, current.version);
  const view = ok(await admin('GET', `/workers/${w.id}`));
  assert.equal(view.contract.version, current.version);
  assert.equal(view.contract.newerVersionAvailable, true);
  assert.equal(view.readiness.ready, true, 'a non-material change leaves the agreement in force');
  assert.equal(view.documentPack, 'outdated');

  // Issuing the new version leaves the old acceptance in place until the new one is agreed.
  const reissue = ok(await admin('POST', `/workers/${w.id}/documents/pack`, {}), 201);
  assert.deepEqual(reissue.issued.map((x: any) => x.type), ['ZERO_HOURS_AGREEMENT']);
  const afterIssue = await prisma.workerDocument.findUniqueOrThrow({ where: { id: v1.id } });
  assert.equal(afterIssue.status, 'ACCEPTED', 'old acceptance not silently moved or cancelled');
  const v2 = await prisma.workerDocument.findFirstOrThrow({ where: { userId: w.id, type: 'ZERO_HOURS_AGREEMENT', status: 'ISSUED' } });
  assert.equal(v2.version, current.version + 1);
  assert.equal(v2.acceptedAt, null);
  assert.equal(ok(await admin('GET', `/workers/${w.id}`)).contract.version, current.version, 'the agreed version is still the one that counts');

  // A material change: the old agreement stops counting until the new version is agreed.
  const latest = ok(await admin('GET', '/templates')).find((t: any) => t.type === 'ZERO_HOURS_AGREEMENT' && t.current);
  ok(await admin('POST', '/templates', { type: 'ZERO_HOURS_AGREEMENT', title: latest.title, body: latest.body + '\nNew notice terms.\n', changeNote: 'Notice change', requiresReacceptance: true }), 201);
  const blocked = ok(await admin('GET', `/workers/${w.id}`));
  assert.equal(blocked.readiness.ready, false);
  assert.ok(blocked.readiness.missing.some((m: string) => /changed materially/.test(m)));
  const audit = await prisma.auditLog.findMany({ where: { action: 'CONTRACT_VERSION_SUPERSEDED' } });
  assert.equal(audit.length, 2);
});

test('an admin-recorded agreement needs the KID issued first and is never backdated before issue', async () => {
  const w = await newWorker();
  ok(await admin('POST', `/workers/${w.id}/documents`, { type: 'KEY_INFORMATION_DOCUMENT' }), 201);
  const doc = ok(await admin('POST', `/workers/${w.id}/documents`, { type: 'ZERO_HOURS_AGREEMENT' }), 201);
  const backdated = await admin('POST', `/documents/${doc.id}/accept`, { acceptedName: 'Ana Silva', method: 'Typed name in email reply', acceptedAt: '2020-01-01T10:00:00.000Z' });
  assert.equal(backdated.statusCode, 400);
  const recorded = ok(await admin('POST', `/documents/${doc.id}/accept`, { acceptedName: 'Ana Silva', method: 'Typed name in email reply' }));
  assert.equal(recorded.status, 'ACCEPTED');
  assert.match(recorded.acceptanceMethod, /^Recorded by admin:/);
  assert.equal(recorded.acceptanceRecordedBy, 'will');
});

// ── Client Terms ──────────────────────────────────────────────────────────

test('business client Terms: owner review first, then issue and acceptance through the link', async () => {
  const c = await newClient();
  const blocked = await admin('POST', `/clients/${c.id}/terms/issue`, {});
  assert.equal(blocked.statusCode, 409);
  assert.match(blocked.body.error, /Commercial term — owner review required/);

  ok(await admin('POST', '/commercial-terms/review', { confirm: true }));
  const issued = ok(await admin('POST', `/clients/${c.id}/terms/issue`, {}), 201);
  const token = tokenOf(issued.link);
  const before = ok(await admin('GET', `/clients/${c.id}/terms`));
  assert.equal(before.position.status, 'issued');
  assert.equal(before.gate.ok, false);

  const page = await anon('GET', `/d/${token}`);
  assert.equal(page.statusCode, 200);
  assert.ok(page.raw.includes('TERMS OF BUSINESS FOR TEMPORARY STAFF SUPPLY'));

  const state = ok(await anon('GET', linkApi(token)));
  const missingAuthority = await anon('POST', `${linkApi(token)}/terms/${state.pending.id}/accept`, { legalBusinessName: 'Acme Events Ltd', acceptedByName: 'Jo Bloggs', typedName: 'Jo Bloggs' });
  assert.equal(missingAuthority.statusCode, 400);
  ok(await anon('POST', `${linkApi(token)}/terms/${state.pending.id}/accept`, {
    authorised: true, legalBusinessName: 'Acme Events Ltd', acceptedByName: 'Jo Bloggs', jobTitle: 'Operations Manager', typedName: 'Jo Bloggs',
  }));

  const doc = await prisma.clientDocument.findUniqueOrThrow({ where: { id: state.pending.id } });
  assert.equal(doc.status, 'ACCEPTED');
  assert.equal(doc.legalBusinessName, 'Acme Events Ltd');
  assert.equal(doc.acceptedByJobTitle, 'Operations Manager');
  assert.equal(doc.typedName, 'Jo Bloggs');
  assert.match(doc.acceptanceStatement!, /^I confirm that I am authorised to accept these Terms of Business on behalf of the hirer/);
  assert.ok(doc.renderedBody.includes('15%') && doc.renderedBody.includes('8 weeks'));
  const after = ok(await admin('GET', `/clients/${c.id}/terms`));
  assert.equal(after.position.status, 'accepted');
  assert.equal(after.gate.ok, true);
  const actions = (await prisma.auditLog.findMany({ where: { entityId: c.id } })).map((a) => a.action);
  assert.ok(actions.includes('CLIENT_TERMS_ISSUED') && actions.includes('CLIENT_TERMS_ACCEPTED'));

  // Changing the commercial terms makes a new, material version: the acceptance stays on v1, and needs redoing.
  const settings = ok(await admin('GET', '/settings'));
  const put = await admin('PUT', '/settings/clientCommercialTerms', { value: { ...settings.settings.clientCommercialTerms, transferFeePercent: 20 } });
  assert.equal(put.statusCode, 200);
  assert.equal(put.body.newVersion.type, 'CLIENT_TERMS_OF_BUSINESS');
  const stale = ok(await admin('GET', `/clients/${c.id}/terms`));
  assert.equal(stale.position.status, 'reacceptance_required');
  assert.equal(stale.position.acceptedVersion, doc.version);
  assert.equal((await prisma.clientDocument.findUniqueOrThrow({ where: { id: doc.id } })).renderedBody, doc.renderedBody);
  assert.equal((await admin('POST', `/clients/${c.id}/terms/issue`, {})).statusCode, 409, 'new figures need the owner review again');
});

test('a private consumer never receives the B2B Terms', async () => {
  const c = await newClient('PRIVATE_CONSUMER', 'Pat Jones');
  ok(await admin('POST', '/commercial-terms/review', { confirm: true }));
  const issue = await admin('POST', `/clients/${c.id}/terms/issue`, {});
  assert.equal(issue.statusCode, 400);
  assert.match(issue.body.error, /private consumer/);
  assert.equal((await admin('POST', `/clients/${c.id}/terms-link`, {})).statusCode, 400);
  assert.equal(await prisma.clientDocument.count({ where: { clientId: c.id } }), 0);
  const record = await admin('POST', `/clients/${c.id}/terms`, { action: 'accepted', version: 'v1', date: '2026-10-01', acceptedBy: 'Pat', consumerTerms: true });
  assert.equal(record.statusCode, 400, 'a B2B version cannot be recorded as consumer terms');
  const terms = ok(await admin('GET', `/clients/${c.id}/terms`));
  assert.equal(terms.position.status, 'consumer_terms_required');
  assert.match(terms.gate.message, /^Consumer booking terms required/);
});

// ── Bookings ──────────────────────────────────────────────────────────────

async function bookingFor(clientId: string) {
  return ok(await admin('POST', '/bookings', { clientId, eventDate: '2026-11-20', startTime: '18:00', expectedFinish: '23:00', venue: 'The Hall', address: '1 High St, London' }), 201);
}

test('a booking warns when the business client has not accepted the Terms, and supplying staff needs a reason', async () => {
  const c = await newClient();
  const b = await bookingFor(c.id);
  assert.ok(b.warnings.some((x: string) => x.startsWith('Client Terms not accepted')), JSON.stringify(b.warnings));
  assert.equal(b.advancePaymentRequired, true, 'a first booking defaults to payment in advance');

  const consumer = await newClient('PRIVATE_CONSUMER', 'Pat Jones');
  const cb = await bookingFor(consumer.id);
  assert.ok(cb.warnings.some((x: string) => x.startsWith('Consumer booking terms required')));

  const w = await newWorker();
  await makeOtherwiseReady(w.id);
  const withReq = ok(await admin('POST', `/bookings/${b.id}/requirements`, { role: 'Waiting staff', quantity: 1, clientChargeRate: 22, workerPayRate: 13, duties: 'Serve canapés', healthSafetyRisks: 'Hot plates', riskControls: 'Gloves provided' }), 201);
  const requirementId = withReq.requirements[0].id;
  const attempt = await admin('POST', `/bookings/${b.id}/assignments`, { requirementId, workerId: w.id, status: 'CONFIRMED' });
  assert.equal(attempt.statusCode, 409);
  assert.ok(attempt.body.warnings.some((x: any) => x.code === 'client_terms' && !x.blocking));
  ok(await admin('POST', `/bookings/${b.id}/assignments`, { requirementId, workerId: w.id, status: 'CONFIRMED', overrideReason: 'Terms agreed by phone, signed copy to follow' }), 201);
});

test('an assignment confirmation is generated from the booking and the worker can see it', async () => {
  const c = await newClient();
  const b = await bookingFor(c.id);
  const w = await newWorker();
  await makeOtherwiseReady(w.id);
  const withReq = ok(await admin('POST', `/bookings/${b.id}/requirements`, { role: 'Bartender', quantity: 1, clientChargeRate: 24, workerPayRate: 14.5, breakMins: 30, duties: 'Cocktail bar', dressCode: 'All black', healthSafetyRisks: 'Broken glass', riskControls: 'Dustpan and gloves at each bar' }), 201);
  const made = ok(await admin('POST', `/bookings/${b.id}/assignments`, { requirementId: withReq.requirements[0].id, workerId: w.id, status: 'CONFIRMED', overrideReason: 'Testing the confirmation' }), 201);
  const doc = ok(await admin('POST', `/assignments/${made.assignmentId}/confirmation`), 201);
  const saved = await prisma.workerDocument.findUniqueOrThrow({ where: { id: doc.id } });
  for (const part of [b.reference, 'Acme Events Ltd', 'Corporate events', 'Bartender', '£14.50 per hour', 'Broken glass', 'Dustpan and gloves', 'All black', 'About 5h', '30-minute unpaid break', '1 High St, London', 'VERGO contact']) {
    assert.ok(saved.renderedBody.includes(part), part);
  }
  assert.ok(saved.bodySha256);
  assert.equal(await prisma.auditLog.count({ where: { action: 'ASSIGNMENT_CONFIRMATION_ISSUED', entityId: w.id } }), 1);

  const link = ok(await admin('POST', `/workers/${w.id}/document-link`, {}), 201);
  const state = ok(await anon('GET', linkApi(tokenOf(link))));
  assert.deepEqual(state.confirmations.map((x: any) => x.id), [doc.id]);
  const view = await anon('GET', `/d/${tokenOf(link)}/doc/${doc.id}`);
  assert.equal(view.statusCode, 200);
  assert.ok(view.raw.includes('Assignment confirmation'));
});

// ── Access ────────────────────────────────────────────────────────────────

test('without an admin session the Ops document routes are refused', async () => {
  const w = await newWorker();
  for (const [method, url] of [['GET', '/documents-terms'], ['POST', `/workers/${w.id}/documents/pack`], ['GET', '/templates'], ['POST', '/commercial-terms/review']]) {
    const res = await anon(method, `/api/v1/ops${url}`, {});
    assert.equal(res.statusCode, 401, `${method} ${url}`);
  }
  const asWorker = await anon('GET', '/api/v1/ops/documents-terms', undefined, { 'x-test-as': `worker:${w.id}` });
  assert.equal(asWorker.statusCode, 401, 'a worker session is not an admin session');
  assert.equal((await anon('GET', '/d/not-a-real-token')).statusCode, 404);
  assert.equal((await anon('GET', `${linkApi('x'.repeat(43))}`)).statusCode, 404);
});

test('revoked and expired links stop working', async () => {
  const w = await newWorker();
  const link = ok(await admin('POST', `/workers/${w.id}/document-link`, {}), 201);
  ok(await anon('GET', linkApi(tokenOf(link))));
  ok(await admin('POST', `/workers/${w.id}/document-links/revoke`));
  assert.equal((await anon('GET', linkApi(tokenOf(link)))).statusCode, 404);
  const fresh = ok(await admin('POST', `/workers/${w.id}/document-link`, {}), 201);
  await prisma.documentLink.updateMany({ where: { userId: w.id, revokedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await anon('GET', `/d/${tokenOf(fresh)}`)).statusCode, 404);
});

test("a worker's link cannot reach another worker's documents", async () => {
  const a = await newWorker('Ana');
  const b = await newWorker('Ben');
  const linkA = ok(await admin('POST', `/workers/${a.id}/documents/pack`, {}), 201);
  ok(await admin('POST', `/workers/${b.id}/documents/pack`, {}), 201);
  const bDocs = await prisma.workerDocument.findMany({ where: { userId: b.id } });
  const bKid = bDocs.find((x) => x.type === 'KEY_INFORMATION_DOCUMENT')!;
  const bAgreement = bDocs.find((x) => x.type === 'ZERO_HOURS_AGREEMENT')!;
  const t = tokenOf(linkA.link);

  assert.equal((await anon('GET', `/d/${t}/doc/${bKid.id}`)).statusCode, 404);
  assert.equal((await anon('POST', `${linkApi(t)}/kid/${bKid.id}/acknowledge`, { acknowledged: true })).statusCode, 404);
  assert.equal((await anon('POST', `${linkApi(t)}/agreement/${bAgreement.id}/accept`, { agree: true, typedName: 'Ana Silva' })).statusCode, 404);
  const untouched = await prisma.workerDocument.findMany({ where: { userId: b.id } });
  assert.ok(untouched.every((x) => x.acknowledgedAt == null && x.status === 'ISSUED'));
  const page = await anon('GET', `/d/${t}`);
  assert.ok(page.raw.includes('Hi Ana') && !page.raw.includes('Ben'));
});

test("a client's link cannot reach another client's Terms, or a worker's documents", async () => {
  ok(await admin('POST', '/commercial-terms/review', { confirm: true }));
  const c1 = await newClient('BUSINESS_HIRER', 'First Co Ltd');
  const c2 = await newClient('VENUE', 'Second Venue Ltd');
  const l1 = ok(await admin('POST', `/clients/${c1.id}/terms/issue`, {}), 201);
  ok(await admin('POST', `/clients/${c2.id}/terms/issue`, {}), 201);
  const other = await prisma.clientDocument.findFirstOrThrow({ where: { clientId: c2.id } });
  const t = tokenOf(l1.link);
  assert.equal((await anon('GET', `/d/${t}/doc/${other.id}`)).statusCode, 404);
  const steal = await anon('POST', `${linkApi(t)}/terms/${other.id}/accept`, { authorised: true, legalBusinessName: 'First Co Ltd', acceptedByName: 'X Y', typedName: 'X Y' });
  assert.equal(steal.statusCode, 404);
  assert.equal((await prisma.clientDocument.findUniqueOrThrow({ where: { id: other.id } })).status, 'ISSUED');

  const w = await newWorker();
  ok(await admin('POST', `/workers/${w.id}/documents/pack`, {}), 201);
  const kid = await prisma.workerDocument.findFirstOrThrow({ where: { userId: w.id, type: 'KEY_INFORMATION_DOCUMENT' } });
  assert.equal((await anon('GET', `/d/${t}/doc/${kid.id}`)).statusCode, 404);
  assert.equal((await anon('POST', `${linkApi(t)}/kid/${kid.id}/acknowledge`, { acknowledged: true })).statusCode, 404);
});

test('the Documents & Terms overview counts what is outstanding', async () => {
  const w = await newWorker();
  await newClient();
  const d = ok(await admin('GET', '/documents-terms'));
  assert.equal(d.counts.workersMissingKid, 1);
  assert.equal(d.counts.workersMissingAgreement, 1);
  assert.equal(d.counts.clientsWithoutCurrentTerms, 1);
  assert.equal(d.workers.find((x: any) => x.id === w.id).documentPack, 'both_missing');
  assert.equal(d.commercialReview.reviewed, false);
  ok(await admin('POST', `/workers/${w.id}/documents/pack`, {}), 201);
  const after = ok(await admin('GET', '/documents-terms'));
  assert.equal(after.counts.workersMissingKid, 0);
  assert.equal(after.counts.outstandingAcceptances, 1);
  assert.equal(after.workers.find((x: any) => x.id === w.id).documentPack, 'contract_missing');
});
