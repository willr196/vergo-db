/**
 * Bring a desktop vergo_admin backup into VERGO Scheduling, row for row.
 *
 * Scheduling has the desktop tool's exact structure, so a backup maps
 * straight onto it, ids included. Rows are matched by id:
 * - not here yet: added;
 * - edited more recently on the desktop (updatedAt): the desktop copy wins;
 * - edited more recently here, or unchanged: kept as it is.
 * Nothing is ever deleted, so restoring the same backup twice changes nothing.
 *
 * Before writing, rows that would collide with a different row here on a
 * unique field (a VJ reference, a person's email, the same person twice on a
 * job) are listed, and the restore refuses until they are sorted out.
 */

import { prisma } from '../prisma';
import { parsePgDump, type LegacyData, type Row } from '../ops/legacyDump';

type TableKey = keyof LegacyData;

const ORDER: TableKey[] = ['clients', 'staff', 'jobs', 'assignments', 'scheduleItems', 'leads'];
const LABELS: Record<TableKey, string> = {
  clients: 'Clients', staff: 'People', jobs: 'Jobs', assignments: 'People on jobs', scheduleItems: 'Running order lines', leads: 'Outreach',
};
/** Columns each table has here. Anything else in an old or newer backup is ignored. */
const COLUMNS: Record<TableKey, string[]> = {
  clients: ['id', 'name', 'contactName', 'contactEmail', 'contactPhone', 'defaultChargeRate', 'notes', 'archived', 'createdAt', 'updatedAt'],
  staff: ['id', 'firstName', 'lastName', 'email', 'phone', 'hourlyRate', 'status', 'notes', 'createdAt', 'updatedAt'],
  jobs: ['id', 'reference', 'clientId', 'title', 'venueName', 'date', 'startTime', 'endTime', 'breakMinutes', 'endDate', 'ongoing', 'repeatDays', 'seriesId',
    'staffNeeded', 'roleNeeded', 'chargeRate', 'status', 'invoiceStatus', 'notes', 'createdAt', 'updatedAt'],
  assignments: ['id', 'jobId', 'staffId', 'hours', 'rateOverride', 'notes', 'createdAt', 'updatedAt'],
  scheduleItems: ['id', 'jobId', 'time', 'title', 'assignee', 'notes', 'createdAt', 'updatedAt'],
  leads: ['id', 'company', 'contactName', 'contactEmail', 'contactPhone', 'contactedOn', 'channel', 'stage', 'notes', 'clientId', 'createdAt', 'updatedAt'],
};
const DATE_ONLY = new Set(['date', 'endDate', 'contactedOn']);

function delegate(key: TableKey): any {
  return {
    clients: prisma.schedClient, staff: prisma.schedStaff, jobs: prisma.schedJob,
    assignments: prisma.schedAssignment, scheduleItems: prisma.schedJobScheduleItem, leads: prisma.schedLead,
  }[key];
}

function shape(key: TableKey, row: Row) {
  const out: Record<string, unknown> = {};
  for (const c of COLUMNS[key]) {
    if (!(c in row)) continue;
    const v = row[c];
    // Jobs made before the desktop had runs carry a NULL list; here it is the empty one.
    if (c === 'repeatDays') out[c] = v ?? [];
    else out[c] = DATE_ONLY.has(c) && typeof v === 'string' ? new Date(`${v}T00:00:00.000Z`) : v;
  }
  return out;
}

export interface RestorePlan {
  tables: { key: TableKey; label: string; inBackup: number; add: number; update: number; keep: number }[];
  conflicts: string[];
}

async function plan(data: LegacyData) {
  const result: RestorePlan = { tables: [], conflicts: [] };
  const writes: { key: TableKey; create: Record<string, unknown>[]; update: Record<string, unknown>[] }[] = [];
  for (const key of ORDER) {
    const rows = data[key].map((r) => shape(key, r));
    const existing: { id: string; updatedAt: Date }[] = rows.length
      ? await delegate(key).findMany({ where: { id: { in: rows.map((r) => r.id as string) } }, select: { id: true, updatedAt: true } })
      : [];
    const byId = new Map(existing.map((e) => [e.id, e.updatedAt]));
    const create: Record<string, unknown>[] = [];
    const update: Record<string, unknown>[] = [];
    let keep = 0;
    for (const row of rows) {
      const here = byId.get(row.id as string);
      if (!here) create.push(row);
      else if (row.updatedAt instanceof Date && row.updatedAt > here) update.push(row);
      else keep += 1;
    }
    result.tables.push({ key, label: LABELS[key], inBackup: rows.length, add: create.length, update: update.length, keep });
    writes.push({ key, create, update });
  }

  // Unique fields held by a different row here.
  const incoming = (key: TableKey) => { const w = writes.find((x) => x.key === key)!; return [...w.create, ...w.update]; };
  for (const job of incoming('jobs')) {
    const other = await prisma.schedJob.findFirst({ where: { reference: job.reference as string, id: { not: job.id as string } }, select: { title: true } });
    if (other) result.conflicts.push(`Job ${job.reference} (${job.title}) in the backup, but ${job.reference} here is "${other.title}". Renumber one of them first.`);
  }
  for (const person of incoming('staff')) {
    if (!person.email) continue;
    const other = await prisma.schedStaff.findFirst({ where: { email: person.email as string, id: { not: person.id as string } }, select: { firstName: true, lastName: true } });
    if (other) result.conflicts.push(`${person.firstName} ${person.lastName} in the backup has the email ${person.email}, which ${other.firstName} ${other.lastName} already has here.`);
  }
  for (const a of incoming('assignments')) {
    const other = await prisma.schedAssignment.findFirst({ where: { jobId: a.jobId as string, staffId: a.staffId as string, id: { not: a.id as string } }, select: { id: true } });
    if (other) result.conflicts.push('The same person is on the same job both in the backup and here (added separately). Remove one, then restore again.');
  }
  for (const lead of incoming('leads')) {
    if (!lead.clientId) continue;
    const other = await prisma.schedLead.findFirst({ where: { clientId: lead.clientId as string, id: { not: lead.id as string } }, select: { company: true } });
    if (other) result.conflicts.push(`Outreach to ${lead.company} in the backup became a client that "${other.company}" here also points at.`);
  }
  result.conflicts = [...new Set(result.conflicts)];
  return { result, writes };
}

export async function restoreFromBackup(sql: string, commit: boolean): Promise<RestorePlan & { committed: boolean }> {
  const data = parsePgDump(sql);
  const { result, writes } = await plan(data);
  if (!commit || result.conflicts.length) return { ...result, committed: false };

  await prisma.$transaction(async (tx) => {
    const d = (key: TableKey): any => ({
      clients: tx.schedClient, staff: tx.schedStaff, jobs: tx.schedJob,
      assignments: tx.schedAssignment, scheduleItems: tx.schedJobScheduleItem, leads: tx.schedLead,
    }[key]);
    for (const w of writes) {
      if (w.create.length) await d(w.key).createMany({ data: w.create });
      for (const row of w.update) {
        const { id, ...rest } = row;
        await d(w.key).update({ where: { id }, data: rest });
      }
    }
  }, { timeout: 120_000 });
  return { ...result, committed: true };
}
