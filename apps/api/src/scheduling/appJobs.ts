/**
 * VERGO Scheduling and Admin > Jobs, kept as one set of jobs.
 *
 * Scheduling owns the work: dates, times, venue, client, headcount and crew.
 * Admin > Jobs owns the listing workers see in the app: description, pay,
 * requirements, and whether it is published. So the sync only runs one way for
 * the shared fields, and there is nothing to merge or loop on:
 *
 *  - Every Scheduling run (or single day) with a day still to come gets one
 *    Admin job, as a draft. Its days, times, venue, headcount and crew follow
 *    the Scheduling days that point at it (SchedJob.appJobId).
 *  - An internal Admin job made in Admin, with dates, is pushed into
 *    Scheduling once and from then on follows it like the rest.
 *  - Crew lives on the Scheduling days. A person whose email is a worker
 *    account is also rostered on that day in the app (JobAssignment), which is
 *    derived and rewritten here, never edited on its own.
 *
 * syncAppJobs() does all of it and is safe to call any number of times: it
 * reads both sides, writes only the differences, and calls that overlap are
 * folded into one more run rather than racing.
 */

import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { fromDayKey, toDayKey } from '../lib/jobDays';
import { hoursBetween } from './costingService';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class AppJobError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = 'AppJobError';
  }
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`.trim();

// ── Running it ─────────────────────────────────────────────────────────────

let current: Promise<void> | null = null;
let queued: Promise<void> | null = null;

/** Bring Admin > Jobs into line with Scheduling. Overlapping calls share runs. */
export function syncAppJobs(): Promise<void> {
  if (!current) {
    current = runSync().finally(() => { current = null; });
    return current;
  }
  // A write landed while a run was reading: one more run after it covers it,
  // however many callers asked in the meantime.
  if (!queued) {
    queued = current.catch(() => {}).then(() => { queued = null; return syncAppJobs(); });
  }
  return queued;
}

/** For reads that want fresh data but must still answer if the sync fails. */
export async function syncAppJobsQuietly(): Promise<void> {
  try {
    await syncAppJobs();
  } catch (error) {
    console.error('[SCHEDULING SYNC]', error);
  }
}

async function runSync() {
  await pushAdminJobsToScheduling();
  await linkNewSchedulingRuns();
  await reconcileLinkedJobs();
}

// ── Admin > Jobs into Scheduling ───────────────────────────────────────────

async function nextReferenceNumber(tx: Prisma.TransactionClient): Promise<number> {
  const refs = await tx.schedJob.findMany({ where: { reference: { startsWith: 'VJ-' } }, select: { reference: true } });
  return refs.reduce((max, { reference }) => {
    const n = Number(reference.slice(3));
    return Number.isSafeInteger(n) ? Math.max(max, n) : max;
  }, 0) + 1;
}

const formatReference = (n: number) => `VJ-${String(n).padStart(4, '0')}`;

/** The Scheduling person for a worker account, matched on email, made if missing. */
async function schedStaffForUser(
  tx: Prisma.TransactionClient,
  user: { firstName: string; lastName: string; email: string; phone: string | null },
  rate: Prisma.Decimal | string | number | null,
) {
  const found = await tx.schedStaff.findFirst({ where: { email: { equals: user.email, mode: 'insensitive' } } });
  if (found) {
    if (!found.hourlyRate && rate) return tx.schedStaff.update({ where: { id: found.id }, data: { hourlyRate: rate } });
    return found;
  }
  return tx.schedStaff.create({
    data: { firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone, hourlyRate: rate },
  });
}

/**
 * Internal Admin jobs with a day still to come that Scheduling has never seen
 * (made in Admin, or from before the two were joined) become Scheduling days,
 * one per job day, with the people already rostered on them.
 */
async function pushAdminJobsToScheduling() {
  const jobs = await prisma.job.findMany({
    where: {
      schedSynced: false,
      type: 'INTERNAL',
      status: { not: 'PENDING' },
      days: { some: { date: { gte: todayUtc() } } },
    },
    include: {
      role: { select: { name: true } },
      days: {
        orderBy: { date: 'asc' },
        include: { assignments: { include: { user: { select: { firstName: true, lastName: true, email: true, phone: true } } } } },
      },
    },
  });

  for (const job of jobs) {
    await eachJob(job.id, () => prisma.$transaction(async (tx) => {
      // Claimed first: during a deploy two servers can sync at once, and the
      // second one waits on this row and then finds nothing left to push.
      const claimed = await tx.job.updateMany({ where: { id: job.id, schedSynced: false }, data: { schedSynced: true } });
      if (claimed.count === 0) return;

      let clientId: string | null = null;
      let chargeRate: Prisma.Decimal | number = 0;
      if (job.companyName?.trim()) {
        const name = job.companyName.trim();
        const client = (await tx.schedClient.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } }))
          ?? (await tx.schedClient.create({ data: { name } }));
        clientId = client.id;
        chargeRate = client.defaultChargeRate ?? 0;
      }

      const startTime = job.shiftStart && HHMM.test(job.shiftStart) ? job.shiftStart : '09:00';
      const endTime = job.shiftEnd && HHMM.test(job.shiftEnd) ? job.shiftEnd : '17:00';
      const hours = hoursBetween(startTime, endTime, 0).toFixed(2);
      const rate = job.payType === 'HOURLY' ? job.payRate : null;
      const seriesId = job.days.length > 1 ? randomUUID() : null;
      const start = await nextReferenceNumber(tx);

      for (const [i, day] of job.days.entries()) {
        const sched = await tx.schedJob.create({
          data: {
            reference: formatReference(start + i),
            clientId,
            title: job.title,
            venueName: job.venue ?? job.location,
            date: day.date,
            startTime,
            endTime,
            staffNeeded: day.staffNeeded,
            roleNeeded: job.role.name,
            chargeRate,
            seriesId,
            notes: Number(chargeRate) === 0 ? 'Charge rate needed (made in Admin > Jobs).' : null,
            appJobId: job.id,
          },
        });
        for (const a of day.assignments) {
          const staff = await schedStaffForUser(tx, a.user, rate);
          await tx.schedAssignment.create({ data: { jobId: sched.id, staffId: staff.id, hours } });
        }
      }
    }));
  }
}

/**
 * One job's sync, on its own: a job that fails (a clash on a VJ number with a
 * booking made at the same moment, say) is logged and tried again next time,
 * rather than stopping every other job from syncing.
 */
async function eachJob(id: string, work: () => Promise<unknown>) {
  try {
    await work();
  } catch (error) {
    console.error(`[SCHEDULING SYNC] ${id}:`, error);
  }
}

// ── Scheduling runs into Admin > Jobs ──────────────────────────────────────

/** The role for a Scheduling job's free-text role, or a sensible fallback. */
async function roleIdFor(roleNeeded: string | null): Promise<string | null> {
  const roles = await prisma.role.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
  if (roles.length === 0) return null;
  const wanted = roleNeeded?.trim().toLowerCase();
  const exact = wanted ? roles.find((r) => r.name.toLowerCase() === wanted) : undefined;
  const near = wanted ? roles.find((r) => r.name.toLowerCase().includes(wanted) || wanted.includes(r.name.toLowerCase())) : undefined;
  const general = roles.find((r) => /general|event staff/i.test(r.name));
  return (exact ?? near ?? general ?? roles[0]).id;
}

/**
 * Scheduling days with nothing in Admin yet. A day joins its run's Admin job
 * if the run has one (an ongoing run topped up, say); a run with a day still
 * to come and no Admin job gets a new one, as a draft.
 */
async function linkNewSchedulingRuns() {
  const loose = await prisma.schedJob.findMany({
    where: { appJobId: null, OR: [{ date: { gte: todayUtc() }, status: { not: 'CANCELLED' } }, { seriesId: { not: null } }] },
    include: { client: { select: { name: true } } },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  });
  if (loose.length === 0) return;

  const seriesIds = [...new Set(loose.map((j) => j.seriesId).filter((s): s is string => Boolean(s)))];
  const linkedRuns = seriesIds.length
    ? await prisma.schedJob.findMany({
        where: { seriesId: { in: seriesIds }, appJobId: { not: null } },
        select: { seriesId: true, appJobId: true },
        distinct: ['seriesId'],
      })
    : [];
  const jobForRun = new Map(linkedRuns.map((r) => [r.seriesId!, r.appJobId!]));

  const groups = new Map<string, typeof loose>();
  for (const job of loose) {
    const key = job.seriesId ?? job.id;
    groups.set(key, [...(groups.get(key) ?? []), job]);
  }

  const today = todayUtc();
  for (const [key, days] of groups) {
    const existing = jobForRun.get(key);
    if (existing) {
      await linkDays(prisma, days.map((d) => d.id), existing);
      continue;
    }
    // A run made wholly of past or cancelled days is history, not a listing.
    if (!days.some((d) => d.date >= today && d.status !== 'CANCELLED')) continue;

    const first = days.find((d) => d.date >= today && d.status !== 'CANCELLED') ?? days[0];
    const roleId = await roleIdFor(first.roleNeeded);
    if (!roleId) {
      console.warn('[SCHEDULING SYNC] No roles exist, so no Admin job can be made for', first.reference);
      return;
    }
    const where = first.venueName ?? first.client?.name ?? 'London';
    await eachJob(first.reference, () => prisma.$transaction(async (tx) => {
      const job = await tx.job.create({
        data: {
          title: first.title,
          // Not the board's notes: those are for the office, and this is what
          // workers read once it is published. Written properly before then.
          description: `${first.title}${first.venueName ? ` at ${first.venueName}` : ''}.`,
          location: where,
          venue: first.venueName,
          companyName: first.client?.name ?? null,
          roleId,
          type: 'INTERNAL',
          status: 'DRAFT',
          schedSynced: true,
        },
      });
      // Another server linked these first (two run during a deploy): undo.
      const count = await linkDays(tx, days.map((d) => d.id), job.id);
      if (count !== days.length) throw new Error('Linked elsewhere first; this listing is not needed');
    }));
  }
}

/**
 * Points unlinked Scheduling days at an Admin job. In SQL, not updateMany, so
 * the days keep their updatedAt: linking is not an edit on the board, and a
 * desktop backup's restore decides which side is newer by that timestamp.
 */
function linkDays(db: Prisma.TransactionClient, ids: string[], jobId: string): Promise<number> {
  if (!ids.length) return Promise.resolve(0);
  return db.$executeRaw`UPDATE "sched_job" SET "appJobId" = ${jobId} WHERE "id" IN (${Prisma.join(ids)}) AND "appJobId" IS NULL`;
}

type LinkedJob = Prisma.JobGetPayload<{
  include: {
    schedJobs: { include: { client: { select: { name: true } }; assignments: { include: { staff: { select: { email: true } } } } } };
    days: { include: { assignments: { select: { id: true; userId: true } } } };
  };
}>;

/** Every Admin job that follows Scheduling, rewritten to match its days. */
async function reconcileLinkedJobs() {
  const jobs: LinkedJob[] = await prisma.job.findMany({
    where: { schedSynced: true },
    include: {
      schedJobs: {
        include: { client: { select: { name: true } }, assignments: { include: { staff: { select: { email: true } } } } },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      },
      days: { include: { assignments: { select: { id: true, userId: true } } } },
    },
  });
  if (jobs.length === 0) return;

  const emails = new Set<string>();
  for (const job of jobs) {
    for (const s of job.schedJobs) for (const a of s.assignments) if (a.staff.email) emails.add(a.staff.email.toLowerCase());
  }
  const users = emails.size
    ? await prisma.user.findMany({
        where: { email: { in: [...emails], mode: 'insensitive' }, userType: 'JOB_SEEKER' },
        select: { id: true, email: true },
      })
    : [];
  const userByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));

  for (const job of jobs) await eachJob(job.id, () => reconcileJob(job, userByEmail));
}

async function reconcileJob(job: LinkedJob, userByEmail: Map<string, string>) {
  const today = todayUtc();
  const live = job.schedJobs.filter((s) => s.status !== 'CANCELLED');

  // One app day per date. A run never has two days on one date, but merging
  // keeps this right if one ever does.
  const wanted = new Map<string, { staffNeeded: number; userIds: Set<string> }>();
  for (const s of live) {
    const key = toDayKey(s.date);
    const day = wanted.get(key) ?? { staffNeeded: 0, userIds: new Set<string>() };
    for (const a of s.assignments) {
      const userId = a.staff.email ? userByEmail.get(a.staff.email.toLowerCase()) : undefined;
      if (userId) day.userIds.add(userId);
    }
    day.staffNeeded = Math.max(day.staffNeeded, s.staffNeeded ?? 0, s.assignments.length, 1);
    wanted.set(key, day);
  }

  const shown = live.find((s) => s.date >= today) ?? live[live.length - 1] ?? job.schedJobs[0];
  const busiest = Math.max(1, ...[...wanted.values()].map((d) => d.staffNeeded));
  const fields: Prisma.JobUpdateInput = {};
  if (shown) {
    if (job.title !== shown.title) fields.title = shown.title;
    if ((job.venue ?? null) !== (shown.venueName ?? null)) fields.venue = shown.venueName ?? null;
    const company = shown.client?.name ?? null;
    if ((job.companyName ?? null) !== company) fields.companyName = company;
    if (job.shiftStart !== shown.startTime) fields.shiftStart = shown.startTime;
    if (job.shiftEnd !== shown.endTime) fields.shiftEnd = shown.endTime;
  }
  const keys = [...wanted.keys()].sort();
  const first = keys[0] ? fromDayKey(keys[0]) : null;
  const last = keys.length > 1 ? fromDayKey(keys[keys.length - 1]) : null;
  if ((job.eventDate?.getTime() ?? null) !== (first?.getTime() ?? null)) fields.eventDate = first;
  if ((job.eventEndDate?.getTime() ?? null) !== (last?.getTime() ?? null)) fields.eventEndDate = last;
  if (job.staffNeeded !== busiest) fields.staffNeeded = busiest;
  // Nothing left to work: it comes off the app. Publishing again is a choice.
  if (live.length === 0 && job.status !== 'CLOSED') fields.status = 'CLOSED';

  const have = new Map(job.days.map((d) => [toDayKey(d.date), d]));
  const dropDays = job.days.filter((d) => !wanted.has(toDayKey(d.date))).map((d) => d.id);
  const work: Prisma.PrismaPromise<unknown>[] = [];

  if (Object.keys(fields).length) work.push(prisma.job.update({ where: { id: job.id }, data: fields }));
  if (dropDays.length) work.push(prisma.jobDay.deleteMany({ where: { id: { in: dropDays } } }));

  const newDays: string[] = [];
  for (const [key, day] of wanted) {
    const existing = have.get(key);
    if (!existing) {
      newDays.push(key);
      continue;
    }
    if (existing.staffNeeded !== day.staffNeeded) {
      work.push(prisma.jobDay.update({ where: { id: existing.id }, data: { staffNeeded: day.staffNeeded } }));
    }
    const onDay = new Set(existing.assignments.map((a) => a.userId));
    const off = existing.assignments.filter((a) => !day.userIds.has(a.userId)).map((a) => a.id);
    if (off.length) work.push(prisma.jobAssignment.deleteMany({ where: { id: { in: off } } }));
    const on = [...day.userIds].filter((u) => !onDay.has(u));
    if (on.length) {
      work.push(prisma.jobAssignment.createMany({ data: on.map((userId) => ({ jobDayId: existing.id, userId })), skipDuplicates: true }));
    }
  }
  if (work.length) await prisma.$transaction(work);

  for (const key of newDays) {
    const day = wanted.get(key)!;
    await prisma.jobDay.create({
      data: {
        jobId: job.id,
        date: fromDayKey(key),
        staffNeeded: day.staffNeeded,
        assignments: { create: [...day.userIds].map((userId) => ({ userId })) },
      },
    });
  }
}

// ── People, from Admin > Jobs ──────────────────────────────────────────────

export type PersonInput =
  | { userId: string; hourlyRate?: number | null }
  | { firstName: string; lastName: string; email?: string | null; phone?: string | null; hourlyRate?: number | null; staffId?: undefined; userId?: undefined }
  | { staffId: string; hourlyRate?: number | null; userId?: undefined };

/** The Scheduling days of a linked job a change applies to. */
async function targetDays(jobId: string, dates?: string[]) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true, schedSynced: true, payRate: true, payType: true } });
  if (!job) throw new AppJobError('Job not found', 404);
  if (!job.schedSynced) throw new AppJobError('This job is not on VERGO Scheduling', 409);
  const days = await prisma.schedJob.findMany({
    where: {
      appJobId: jobId,
      status: { not: 'CANCELLED' },
      ...(dates?.length ? { date: { in: dates.map(fromDayKey) } } : { date: { gte: todayUtc() } }),
    },
    orderBy: { date: 'asc' },
  });
  return { job, days };
}

/**
 * Put someone on a job: a worker account, someone already in Scheduling, or a
 * person typed in by hand (who need not have an account). Without dates it is
 * every day still to come. Scheduling's rule holds: no hourly rate, no job.
 */
export async function addPersonToAppJob(jobId: string, person: PersonInput, dates?: string[]) {
  const { job, days } = await targetDays(jobId, dates);
  if (days.length === 0) throw new AppJobError('There are no days to come on this job to put anyone on.', 409);
  const fallbackRate = person.hourlyRate ?? (job.payType === 'HOURLY' ? job.payRate : null);

  const staff = await prisma.$transaction(async (tx) => {
    const found = await findOrMakePerson(tx);
    // Refused inside the transaction, so a person typed in without a rate is
    // not left behind to be made a second time when the rate is given.
    if (!found.hourlyRate) {
      throw new AppJobError(`${fullName(found)} has no hourly rate. Give one here, or set an hourly pay rate on the job.`, 422);
    }
    if (found.status === 'INACTIVE') return tx.schedStaff.update({ where: { id: found.id }, data: { status: 'ACTIVE' } });
    return found;
  });

  async function findOrMakePerson(tx: Prisma.TransactionClient) {
    if ('userId' in person && person.userId) {
      const user = await tx.user.findUnique({ where: { id: person.userId }, select: { firstName: true, lastName: true, email: true, phone: true } });
      if (!user) throw new AppJobError('Worker not found', 404);
      return schedStaffForUser(tx, user, fallbackRate);
    }
    if ('staffId' in person && person.staffId) {
      const found = await tx.schedStaff.findUnique({ where: { id: person.staffId } });
      if (!found) throw new AppJobError('That person no longer exists', 404);
      if (!found.hourlyRate && fallbackRate) return tx.schedStaff.update({ where: { id: found.id }, data: { hourlyRate: fallbackRate } });
      return found;
    }
    const manual = person as Extract<PersonInput, { firstName: string }>;
    const email = manual.email?.trim() || null;
    const existing = email ? await tx.schedStaff.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } }) : null;
    if (existing) {
      if (!existing.hourlyRate && fallbackRate) return tx.schedStaff.update({ where: { id: existing.id }, data: { hourlyRate: fallbackRate } });
      return existing;
    }
    return tx.schedStaff.create({
      data: { firstName: manual.firstName.trim(), lastName: manual.lastName.trim(), email, phone: manual.phone?.trim() || null, hourlyRate: fallbackRate },
    });
  }

  const { count } = await prisma.schedAssignment.createMany({
    data: days.map((d) => ({ jobId: d.id, staffId: staff.id, hours: hoursBetween(d.startTime, d.endTime, d.breakMinutes).toFixed(2) })),
    skipDuplicates: true,
  });
  await syncAppJobsQuietly();
  return { staffId: staff.id, name: fullName(staff), added: count };
}

/** Take someone off a job: the given dates, or every day still to come. */
export async function removePersonFromAppJob(jobId: string, who: { staffId?: string; userId?: string }, dates?: string[]) {
  const { days } = await targetDays(jobId, dates);
  let staffId = who.staffId;
  if (!staffId && who.userId) {
    const user = await prisma.user.findUnique({ where: { id: who.userId }, select: { email: true } });
    const staff = user ? await prisma.schedStaff.findFirst({ where: { email: { equals: user.email, mode: 'insensitive' } }, select: { id: true } }) : null;
    staffId = staff?.id;
  }
  if (!staffId) return { removed: 0 };
  const { count } = await prisma.schedAssignment.deleteMany({ where: { staffId, jobId: { in: days.map((d) => d.id) } } });
  await syncAppJobsQuietly();
  return { removed: count };
}

/** Headcount per day from the staffing screen, written to the Scheduling days. */
export async function setAppJobHeadcounts(jobId: string, plan: { date: string; staffNeeded: number }[]) {
  const all = await prisma.schedJob.findMany({ where: { appJobId: jobId, status: { not: 'CANCELLED' } }, select: { id: true, date: true } });
  const known = new Set(all.map((d) => toDayKey(d.date)));
  const unknown = plan.find((p) => !known.has(p.date));
  if (unknown || plan.length !== known.size) {
    throw new AppJobError('Days on this job are added and removed in VERGO Scheduling. Here you can change how many people each day needs.', 409);
  }
  await prisma.$transaction(
    plan.map((p) => prisma.schedJob.updateMany({ where: { appJobId: jobId, date: fromDayKey(p.date) }, data: { staffNeeded: p.staffNeeded } })),
  );
  await syncAppJobsQuietly();
}

/**
 * The staffing screen for a linked job: each app day with everyone on it in
 * Scheduling, account or not. Ids are the Scheduling person's, for removing.
 */
export async function getLinkedCrewDays(jobId: string) {
  const [days, sched] = await Promise.all([
    prisma.jobDay.findMany({ where: { jobId }, orderBy: { date: 'asc' }, select: { id: true, date: true, staffNeeded: true } }),
    prisma.schedJob.findMany({
      where: { appJobId: jobId, status: { not: 'CANCELLED' } },
      select: {
        id: true, reference: true, date: true,
        assignments: { orderBy: { createdAt: 'asc' }, select: { staff: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } } },
      },
    }),
  ]);
  const emails = sched.flatMap((s) => s.assignments.map((a) => a.staff.email)).filter((e): e is string => Boolean(e));
  const users = emails.length
    ? await prisma.user.findMany({ where: { email: { in: emails, mode: 'insensitive' }, userType: 'JOB_SEEKER' }, select: { id: true, email: true } })
    : [];
  const userByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));
  const byDate = new Map(sched.map((s) => [toDayKey(s.date), s]));

  return days.map((day) => {
    const key = toDayKey(day.date);
    const s = byDate.get(key);
    const assignments = (s?.assignments ?? []).map(({ staff }) => ({
      id: staff.id,
      staffId: staff.id,
      userId: staff.email ? userByEmail.get(staff.email.toLowerCase()) ?? null : null,
      name: fullName(staff),
      email: staff.email ?? '',
      phone: staff.phone,
      staffTier: null,
    }));
    return {
      id: day.id,
      date: key,
      reference: s?.reference ?? null,
      schedJobId: s?.id ?? null,
      staffNeeded: day.staffNeeded,
      staffAssigned: assignments.length,
      spotsLeft: Math.max(0, day.staffNeeded - assignments.length),
      assignments,
    };
  });
}
