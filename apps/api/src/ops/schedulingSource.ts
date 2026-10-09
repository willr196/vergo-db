/**
 * VERGO Scheduling (the desktop tool's screens on the web, briefly) kept
 * its own copy of the desktop tables: sched_client, sched_staff, sched_job,
 * sched_assignment, sched_lead, sched_job_schedule_item. It is now folded into
 * Ops, so this reads those tables in the shape a desktop backup has and hands
 * them to the same importer (Ops > Import > VERGO Scheduling).
 *
 * Rows restored there from a desktop backup kept the desktop's ids, so anything
 * already imported into Ops from that backup is matched in OpsLegacyImport and
 * skipped, not added twice.
 */

import { prisma } from '../prisma';
import type { LegacyData, Row } from './legacyDump';

const DATE_COLUMNS = new Set(['date', 'endDate', 'contactedOn']);

/** As pg gives it to the CLI importer: dates YYYY-MM-DD, money as a string. */
function asDump(row: Record<string, unknown>): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Date && DATE_COLUMNS.has(k)) out[k] = v.toISOString().slice(0, 10);
    else if (v != null && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) out[k] = String(v); // Decimal
    else out[k] = v;
  }
  return out;
}

export async function readSchedulingTables(): Promise<LegacyData> {
  const byCreated = { orderBy: { createdAt: 'asc' as const } };
  const [clients, staff, jobs, assignments, leads, scheduleItems] = await Promise.all([
    prisma.schedClient.findMany(byCreated),
    prisma.schedStaff.findMany(byCreated),
    prisma.schedJob.findMany({ orderBy: [{ date: 'asc' }, { startTime: 'asc' }] }),
    prisma.schedAssignment.findMany(byCreated),
    prisma.schedLead.findMany(byCreated),
    prisma.schedJobScheduleItem.findMany(byCreated),
  ]);
  return {
    clients: clients.map(asDump), staff: staff.map(asDump), jobs: jobs.map(asDump),
    assignments: assignments.map(asDump), leads: leads.map(asDump), scheduleItems: scheduleItems.map(asDump),
  };
}

/** Clients, people, jobs and leads in VERGO Scheduling that are not in Ops yet. */
export async function schedulingRowCount(): Promise<number> {
  const pick = { select: { id: true } };
  const [clients, staff, jobs, leads, imported] = await Promise.all([
    prisma.schedClient.findMany(pick), prisma.schedStaff.findMany(pick), prisma.schedJob.findMany(pick), prisma.schedLead.findMany(pick),
    prisma.opsLegacyImport.findMany({ where: { entity: { in: ['Client', 'Staff', 'Job', 'Lead'] } }, select: { entity: true, legacyId: true } }),
  ]);
  const done = new Set(imported.map((x) => `${x.entity}:${x.legacyId}`));
  const waiting = (entity: string, rows: { id: string }[]) => rows.filter((r) => !done.has(`${entity}:${r.id}`)).length;
  return waiting('Client', clients) + waiting('Staff', staff) + waiting('Job', jobs) + waiting('Lead', leads);
}
