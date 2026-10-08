/**
 * A demo VERGO Ops world for clicking through by hand: workers in every
 * compliance state, clients on and off Terms, bookings from paid invoices to
 * drafts, timesheets awaiting approval and in dispute, an AWR warning, payroll
 * history and leads.
 *
 *   npm run seed:ops-demo
 *
 * Local databases only (guard-db-target.js). Everything goes through the real
 * Ops API in this process, so it is validated, audit-logged and shaped exactly
 * as the office would make it. Demo people use @example.com and "Demo" names,
 * and nothing is emailed (the Resend key is cleared before anything loads).
 * It runs once; a second run stops if the demo client is already there.
 */

process.env.RESEND_API_KEY = '';

import type { AddressInfo } from 'node:net';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require('express');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cookieParser = require('cookie-parser');

const MARKER_EMAIL = 'acme.demo@example.com';

async function main() {
  const { prisma } = await import('../src/prisma');
  const { csrfHeaders, ADMIN_TEST_SESSION_ID } = await import('../src/testing/csrf');
  const { londonDateKey, addDays } = await import('../src/ops/time');
  const opsApi = (await import('../src/routes/ops')).default;

  if (await prisma.client.findUnique({ where: { email: MARKER_EMAIL } })) {
    console.log('The Ops demo data is already in this database. Nothing added.');
    await prisma.$disconnect();
    return;
  }

  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());
  app.use((req: any, _res: any, next: any) => {
    req.session = { id: ADMIN_TEST_SESSION_ID, username: 'demo-seed', isAdmin: true };
    next();
  });
  app.use('/api/v1/ops', opsApi);
  app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ ok: false, error: String(err?.message ?? err) }));
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/ops`;

  async function call(method: string, url: string, body?: unknown, expect = [200, 201]) {
    const res = await fetch(base + url, {
      method,
      headers: { 'content-type': 'application/json', ...csrfHeaders() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json: any = await res.json().catch(() => null);
    if (!expect.includes(res.status)) throw new Error(`${method} ${url} -> ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
    return json?.data;
  }

  const today = londonDateKey(new Date());
  const day = (n: number) => addDays(today, n);

  // ── Settings the documents need ──────────────────────────────────────
  await call('POST', '/commercial-terms/review', { confirm: true });

  // ── Workers ──────────────────────────────────────────────────────────
  async function worker(first: string, roles: string[]) {
    const w = await call('POST', '/workers', { firstName: first, lastName: 'Demo', email: `${first.toLowerCase()}.demo@example.com`, phone: '07700900123' });
    await call('PATCH', `/workers/${w.id}`, { roles, defaultPayRate: 13.5, availabilityNotes: 'Evenings and weekends' });
    return w.id as string;
  }
  async function rtw(id: string, validUntil: string | null = null) {
    await call('POST', `/workers/${id}/rtw-checks`, {
      method: 'SHARE_CODE', performedOn: day(-40), performedBy: 'Will', outcome: 'PASS', prescribedCheckConfirmed: true,
      validUntil, followUpDue: validUntil ? addDays(validUntil, -7) : null, evidenceReference: 'Profile PDF in RTW folder (demo)',
    });
  }
  async function contactAndPayroll(id: string) {
    await call('PATCH', `/workers/${id}`, { emergencyContactName: 'Sam Demo', emergencyContactPhone: '07700900999', payrollStatus: 'ACTIVE', pensionStatus: 'NOT_ELIGIBLE_CURRENTLY' });
  }
  async function documents(id: string, agree: boolean) {
    await call('POST', `/workers/${id}/documents/pack`, {});
    if (!agree) return;
    const agreement = await prisma.workerDocument.findFirstOrThrow({ where: { userId: id, type: 'ZERO_HOURS_AGREEMENT', status: 'ISSUED' } });
    await call('POST', `/documents/${agreement.id}/accept`, { acceptedName: 'Demo Worker', method: 'Signed copy emailed back (demo)' });
  }
  async function ready(id: string, validUntil: string | null = null) {
    await rtw(id, validUntil);
    await contactAndPayroll(id);
    await documents(id, true);
  }

  const ana = await worker('Ana', ['Waiting staff', 'Bar staff']);
  await ready(ana);
  const ben = await worker('Ben', ['Bar staff']);
  await ready(ben);
  const cat = await worker('Cat', ['Waiting staff']);
  await ready(cat, day(20)); // right to work runs out within 30 days
  const dev = await worker('Dev', ['Kitchen porter']); // nothing recorded: no right-to-work check
  await contactAndPayroll(dev);
  const eve = await worker('Eve', ['Waiting staff']);
  await rtw(eve);
  await contactAndPayroll(eve);
  await documents(eve, false); // pack issued, agreement not yet agreed
  const finn = await worker('Finn', ['Host']);
  await rtw(finn);
  await call('POST', `/workers/${finn}/ready-override`, { active: true, reason: 'Long-standing worker, agreement signed on paper (demo)' });
  const gus = await worker('Gus', ['Runner']);
  await ready(gus);
  await call('POST', `/workers/${gus}/rtw-block`, { blocked: true, reason: 'Home Office letter received (demo)' });
  const hana = await worker('Hana', ['Waiting staff']);
  await call('PATCH', `/workers/${hana}`, { activeStatus: 'INACTIVE' });

  // ── Clients ──────────────────────────────────────────────────────────
  const acme = await call('POST', '/clients', {
    companyName: 'Acme Demo Events Ltd', contactName: 'Jo Demo', email: MARKER_EMAIL, phone: '02079460000',
    clientType: 'BUSINESS_HIRER', industry: 'Corporate events', paymentTerms: '14 days', defaultChargeRate: 22,
    billingAddress: '1 Demo Street, London EC1A 1AA', venueAddresses: ['The Demo Hall, London'],
  });
  const terms = await call('POST', `/clients/${acme.id}/terms/issue`, {});
  await call('POST', `/client-terms/${terms.document.id}/accept`, {
    legalBusinessName: 'Acme Demo Events Ltd', acceptedByName: 'Jo Demo', typedName: 'Jo Demo', method: 'Signed PDF by email (demo)', authorityConfirmed: true,
  });
  const riverside = await call('POST', '/clients', {
    companyName: 'Riverside Demo Venue Ltd', contactName: 'Kim Demo', email: 'riverside.demo@example.com', clientType: 'VENUE', industry: 'Wedding venue',
  });
  await call('POST', `/clients/${riverside.id}/terms/issue`, {}); // issued, not yet accepted
  const priv = await call('POST', '/clients', {
    companyName: 'Mrs P Demo (private party)', contactName: 'Pat Demo', email: 'pat.demo@example.com', clientType: 'PRIVATE_CONSUMER',
  });

  // ── Bookings ─────────────────────────────────────────────────────────
  async function booking(clientId: string, date: string, extra: Record<string, unknown> = {}, requirement: Record<string, unknown> | null = { role: 'Waiting staff', quantity: 2, clientChargeRate: 22, workerPayRate: 13.5 }) {
    return call('POST', '/bookings', {
      clientId, status: 'CONFIRMED', eventDate: date, startTime: '18:00', expectedFinish: '23:30', venue: 'The Demo Hall', address: '1 Demo Street, London',
      eventType: 'Corporate dinner', onSiteContactName: 'Jo Demo', onSiteContactPhone: '07700900555', vergoLead: 'Will',
      ...(requirement ? { requirement } : {}), ...extra,
    });
  }
  async function assign(b: any, workerId: string, status = 'CONFIRMED', overrideReason?: string, requirementIndex = 0) {
    const out = await call('POST', `/bookings/${b.id}/assignments`, { requirementId: b.requirements[requirementIndex].id, workerId, status, overrideReason });
    return out.assignmentId as string;
  }
  const approve = (id: string, hours?: number) => call('POST', `/assignments/${id}/timesheet/approve`, hours ? { hours } : {});

  // Paid: nine days ago.
  const paid = await booking(acme.id, day(-9), { eventType: 'Product launch' });
  for (const id of [await assign(paid, ana), await assign(paid, cat)]) await approve(id);
  await call('POST', `/bookings/${paid.id}/invoice`, { invoiceRef: 'DEMO-INV-001' });
  await call('POST', `/bookings/${paid.id}/paid`, {});

  // Invoiced, waiting for payment: three days ago, with a charge and a cost.
  const owed = await booking(acme.id, day(-3), { eventType: 'Awards night', expectedFinish: '01:00' });
  const o1 = await assign(owed, ana);
  const o2 = await assign(owed, ben, 'CONFIRMED', 'Swapped onto waiting staff for the night (demo)');
  await call('POST', `/assignments/${o1}/timesheet/client-approval`, { approvedBy: 'Jo Demo' });
  await approve(o1);
  await approve(o2, 6);
  await call('POST', `/bookings/${owed.id}/costs`, { kind: 'CHARGE', category: 'charge', description: 'Late finish fee', amount: 40 });
  await call('POST', `/bookings/${owed.id}/costs`, { kind: 'COST', category: 'equipment', description: 'Glassware hire', amount: 35 });
  await call('POST', `/bookings/${owed.id}/invoice`, { invoiceRef: 'DEMO-INV-002' });

  // Worked yesterday: timesheets awaiting approval, one in dispute.
  const yesterday = await booking(acme.id, day(-1), { eventType: 'Charity gala' });
  const y1 = await assign(yesterday, ana);
  const y2 = await assign(yesterday, cat);
  const checkIn = new Date(`${day(-1)}T17:00:00Z`);
  await call('PATCH', `/assignments/${y1}/timesheet`, { checkedInAt: checkIn.toISOString(), checkedOutAt: new Date(checkIn.getTime() + 6 * 3600000).toISOString(), reason: 'From the venue sign-in sheet (demo)' });
  await call('POST', `/assignments/${y2}/timesheet/dispute`, { reason: 'Client says Cat left at 22:30 (demo)' });

  // Coming up: part staffed, one offer not yet accepted.
  const soon = await booking(acme.id, day(3), { eventType: 'Summer party' }, { role: 'Bar staff', quantity: 3, clientChargeRate: 23, workerPayRate: 14, breakMins: 30, dressCode: 'All black', duties: 'Bar service', healthSafetyRisks: 'Glass, wet floors', riskControls: 'Briefing on arrival' });
  await assign(soon, ben);
  await assign(soon, ana, 'PENDING');
  await call('POST', `/bookings/${soon.id}/schedule`, { time: '16:30', title: 'Staff arrive, briefing', assignee: 'Ben', notes: 'Back door on the side street (demo)' });
  await call('POST', `/bookings/${soon.id}/schedule`, { time: '18:00', title: 'Doors open, drinks reception' });

  // Venue with Terms issued but not accepted: a gate warning, and nobody on it yet.
  await booking(riverside.id, day(7), { eventType: 'Wedding', venue: 'Riverside Demo Venue' }, { role: 'Waiting staff', quantity: 4, clientChargeRate: 21, workerPayRate: 13.5 });

  // Private consumer: quoted, consumer terms flagged.
  await booking(priv.id, day(10), { status: 'QUOTED', eventType: '50th birthday', venue: 'Private house' }, { role: 'Bar staff', quantity: 1, clientChargeRate: 25, workerPayRate: 14 });

  // A draft with no roles yet.
  await booking(acme.id, day(14), { status: 'DRAFT', eventType: 'Christmas party (tbc)' }, null);

  // Ana on the same Acme role every week for ten weeks: the AWR aid warns.
  for (let week = 11; week >= 2; week--) {
    const b = await booking(acme.id, day(-7 * week + 1), { eventType: 'Weekly staff lunch', startTime: '11:00', expectedFinish: '15:00' }, { role: 'Bar staff', quantity: 1, clientChargeRate: 22, workerPayRate: 13.5 });
    await approve(await assign(b, ana));
  }

  // ── Payroll history, leads ───────────────────────────────────────────
  const header = 'worker_name,worker_email,payment_date,hours,base_pay,holiday_pay,gross_transferred,notes,payroll_corrected,fps_submitted,hmrc_reconciled';
  const csv = [
    header,
    `Ana Demo,ana.demo@example.com,${day(-60)},24,324.00,39.11,363.11,Bank transfer (demo),yes,yes,no`,
    `Ben Demo,ben.demo@example.com,${day(-60)},12,162.00,19.55,181.55,Bank transfer (demo),yes,no,no`,
    `Former Demo Worker,,${day(-90)},8,104.00,12.55,116.55,Paid before payroll (demo),no,no,no`,
  ].join('\n');
  await call('POST', '/payroll-history/import', { csv, commit: true });

  await call('POST', '/leads', { company: 'Northside Demo Catering', contactName: 'Lee Demo', contactEmail: 'lee.demo@example.com', contactedOn: day(-5), channel: 'PHONE', notes: 'Wants 6 waiting staff in December (demo)' });
  await call('POST', '/leads', { company: 'Studio Demo Productions', contactName: 'Ray Demo', contactedOn: day(-2), stage: 'REPLIED', notes: 'Film crew catering, 3 weeks (demo)' });

  server.close();
  await prisma.$disconnect();
  console.log(`Ops demo data added. Log in and open /ops.
  Workers: Ana, Ben (ready), Cat (RTW ends in 20 days), Dev (no RTW), Eve (agreement not agreed),
           Finn (ready by override), Gus (RTW blocked), Hana (inactive) - all "Demo".
  Clients: Acme Demo Events (Terms accepted), Riverside Demo Venue (Terms issued), Mrs P Demo (private).
  Bookings: one paid, one invoiced, yesterday's awaiting timesheets (one disputed), upcoming part-staffed,
            a venue on the terms gate, a private quote, a draft, and ten weekly shifts behind an AWR warning.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
