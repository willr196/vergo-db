/**
 * Reading and writing a job's per-day staffing plan.
 *
 * Everything here runs in a transaction because a day's headcount and the
 * people rostered onto it have to move together: dropping a day has to drop
 * its assignments, and any change to headcount has to leave Job.staffNeeded
 * (which gates applications) agreeing with the busiest day.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import {
  type DayInput,
  crewSizeFromDays,
  defaultDaysForJob,
  expandDayKeys,
  fromDayKey,
  normalizeDays,
  toDayKey,
} from '../lib/jobDays';

const assignmentSelect = {
  id: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      staffTier: true,
    },
  },
} satisfies Prisma.JobAssignmentSelect;

const daySelect = {
  id: true,
  date: true,
  staffNeeded: true,
  assignments: { select: assignmentSelect, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.JobDaySelect;

export type ShapedJobDay = {
  id: string;
  date: string;
  staffNeeded: number;
  staffAssigned: number;
  spotsLeft: number;
  assignments: {
    id: string;
    userId: string;
    name: string;
    email: string;
    phone: string | null;
    staffTier: string | null;
  }[];
};

type DayRow = Prisma.JobDayGetPayload<{ select: typeof daySelect }>;

function shapeDay(day: DayRow): ShapedJobDay {
  return {
    id: day.id,
    date: toDayKey(day.date),
    staffNeeded: day.staffNeeded,
    staffAssigned: day.assignments.length,
    spotsLeft: Math.max(0, day.staffNeeded - day.assignments.length),
    assignments: day.assignments.map((assignment) => ({
      id: assignment.id,
      userId: assignment.user.id,
      name: `${assignment.user.firstName} ${assignment.user.lastName}`.trim(),
      email: assignment.user.email,
      phone: assignment.user.phone,
      staffTier: assignment.user.staffTier,
    })),
  };
}

/** Every day of a job, earliest first, with the people rostered onto each. */
export async function getJobDays(jobId: string): Promise<ShapedJobDay[]> {
  const days = await prisma.jobDay.findMany({
    where: { jobId },
    select: daySelect,
    orderBy: { date: 'asc' },
  });
  return days.map(shapeDay);
}

/**
 * Makes the stored days match `days` exactly: new dates are created, existing
 * ones re-counted, and dropped dates deleted along with their assignments.
 *
 * Assignments on days that survive are left alone — an admin changing Tuesday
 * from 4 heads to 6 should not lose the four people already rostered.
 * Passing an empty list clears the plan entirely.
 */
export async function replaceJobDays(jobId: string, days: DayInput[]): Promise<ShapedJobDay[]> {
  const wanted = normalizeDays(days);
  const wantedKeys = new Set(wanted.map((day) => day.date));

  await prisma.$transaction(async (tx) => {
    const existing = await tx.jobDay.findMany({
      where: { jobId },
      select: { id: true, date: true, staffNeeded: true },
    });

    const staleIds = existing
      .filter((day) => !wantedKeys.has(toDayKey(day.date)))
      .map((day) => day.id);
    if (staleIds.length > 0) {
      await tx.jobDay.deleteMany({ where: { id: { in: staleIds } } });
    }

    const byKey = new Map(existing.map((day) => [toDayKey(day.date), day]));
    for (const day of wanted) {
      const current = byKey.get(day.date);
      if (!current) {
        await tx.jobDay.create({
          data: { jobId, date: fromDayKey(day.date), staffNeeded: day.staffNeeded },
        });
      } else if (current.staffNeeded !== day.staffNeeded) {
        await tx.jobDay.update({
          where: { id: current.id },
          data: { staffNeeded: day.staffNeeded },
        });
      }
    }

    const job = await tx.job.findUnique({ where: { id: jobId }, select: { staffNeeded: true } });
    if (job) {
      const crewSize = crewSizeFromDays(wanted, job.staffNeeded);
      if (crewSize !== job.staffNeeded) {
        await tx.job.update({ where: { id: jobId }, data: { staffNeeded: crewSize } });
      }
    }
  });

  return getJobDays(jobId);
}

/**
 * Seeds one day per calendar day of the event for a job that has none yet.
 * Used on create, and as a repair for jobs that predate per-day staffing, so
 * the staffing screen is never blank for a job that has dates.
 */
export async function ensureJobDays(jobId: string): Promise<ShapedJobDay[]> {
  const existing = await getJobDays(jobId);
  if (existing.length > 0) return existing;

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { eventDate: true, eventEndDate: true, staffNeeded: true },
  });
  if (!job) return [];

  const defaults = defaultDaysForJob(job);
  if (defaults.length === 0) return [];

  return replaceJobDays(jobId, defaults);
}

/**
 * Re-fits the day list to a changed event date range without an explicit plan
 * from the caller: days still inside the range keep their headcount and their
 * rostered people, days that fell outside it go, and newly covered days come
 * in at the job's overall headcount.
 */
export async function refitJobDaysToRange(jobId: string): Promise<ShapedJobDay[]> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { eventDate: true, eventEndDate: true, staffNeeded: true },
  });
  if (!job) return [];
  if (!job.eventDate) return replaceJobDays(jobId, []);

  const existing = await prisma.jobDay.findMany({
    where: { jobId },
    select: { date: true, staffNeeded: true },
  });
  const byKey = new Map(existing.map((day) => [toDayKey(day.date), day.staffNeeded]));

  const wanted = expandDayKeys(job.eventDate, job.eventEndDate).map((date) => ({
    date,
    staffNeeded: byKey.get(date) ?? Math.max(1, job.staffNeeded),
  }));

  return replaceJobDays(jobId, wanted);
}

export class JobStaffingError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'JobStaffingError';
    this.status = status;
  }
}

/**
 * Rosters a worker onto one day. Refuses to overfill the day — the headcount
 * is the point of the feature, so raise it deliberately rather than by
 * accident. Assigning someone already on the day is a no-op, not an error.
 */
export async function assignStaffToDay(jobId: string, dayId: string, userId: string) {
  const day = await prisma.jobDay.findFirst({
    where: { id: dayId, jobId },
    select: { id: true, staffNeeded: true, _count: { select: { assignments: true } } },
  });
  if (!day) throw new JobStaffingError('Day not found on this job', 404);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new JobStaffingError('Worker not found', 404);

  const already = await prisma.jobAssignment.findUnique({
    where: { jobDayId_userId: { jobDayId: day.id, userId } },
    select: { id: true },
  });
  if (already) return getJobDays(jobId);

  if (day._count.assignments >= day.staffNeeded) {
    throw new JobStaffingError(
      `This day is already full (${day.staffNeeded} needed). Raise the headcount first.`,
      409,
    );
  }

  await prisma.jobAssignment.create({ data: { jobDayId: day.id, userId } });
  return getJobDays(jobId);
}

/** Takes a worker off one day. Removing someone who isn't on it is a no-op. */
export async function unassignStaffFromDay(jobId: string, dayId: string, userId: string) {
  const day = await prisma.jobDay.findFirst({ where: { id: dayId, jobId }, select: { id: true } });
  if (!day) throw new JobStaffingError('Day not found on this job', 404);

  await prisma.jobAssignment.deleteMany({ where: { jobDayId: day.id, userId } });
  return getJobDays(jobId);
}

export type StaffScheduleJob = {
  jobId: string;
  title: string;
  status: string;
  location: string;
  venue: string | null;
  companyName: string | null;
  roleName: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
  payRate: string | null;
  payType: string;
  days: { assignmentId: string; jobDayId: string; date: string; staffNeeded: number }[];
};

/** Every job day a worker is rostered onto, soonest first, grouped by job. */
export async function getStaffSchedule(userId: string) {
  const assignments = await prisma.jobAssignment.findMany({
    where: { userId },
    select: {
      id: true,
      jobDay: {
        select: {
          id: true,
          date: true,
          staffNeeded: true,
          job: {
            select: {
              id: true,
              title: true,
              status: true,
              location: true,
              venue: true,
              companyName: true,
              shiftStart: true,
              shiftEnd: true,
              payRate: true,
              payType: true,
              role: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: { jobDay: { date: 'asc' } },
  });

  const byJob = new Map<string, StaffScheduleJob>();

  for (const assignment of assignments) {
    const { job } = assignment.jobDay;
    if (!byJob.has(job.id)) {
      byJob.set(job.id, {
        jobId: job.id,
        title: job.title,
        status: job.status,
        location: job.location,
        venue: job.venue,
        companyName: job.companyName,
        roleName: job.role?.name ?? null,
        shiftStart: job.shiftStart,
        shiftEnd: job.shiftEnd,
        payRate: job.payRate ? job.payRate.toString() : null,
        payType: job.payType,
        days: [],
      });
    }
    byJob.get(job.id)!.days.push({
      assignmentId: assignment.id,
      jobDayId: assignment.jobDay.id,
      date: toDayKey(assignment.jobDay.date),
      staffNeeded: assignment.jobDay.staffNeeded,
    });
  }

  const jobs = [...byJob.values()].sort((a, b) => a.days[0].date.localeCompare(b.days[0].date));
  const today = toDayKey(new Date());
  const allDates = jobs.flatMap((job) => job.days.map((day) => day.date));
  const upcoming = allDates.filter((date) => date >= today).sort();

  return {
    jobs,
    totals: {
      jobCount: jobs.length,
      dayCount: allDates.length,
      upcomingDayCount: upcoming.length,
      nextDate: upcoming[0] ?? null,
    },
  };
}

/**
 * Workers an admin can put on this job: everyone who applied and hasn't been
 * rejected or withdrawn, confirmed people first since those are who you
 * actually roster.
 */
export async function getJobCandidates(jobId: string) {
  const applications = await prisma.jobApplication.findMany({
    where: { jobId, status: { notIn: ['REJECTED', 'WITHDRAWN'] } },
    select: {
      status: true,
      user: {
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, staffTier: true },
      },
    },
  });

  const rank: Record<string, number> = { CONFIRMED: 0, SHORTLISTED: 1, REVIEWED: 2, PENDING: 3 };

  return applications
    .map((application) => ({
      userId: application.user.id,
      name: `${application.user.firstName} ${application.user.lastName}`.trim(),
      email: application.user.email,
      phone: application.user.phone,
      staffTier: application.user.staffTier,
      applicationStatus: application.status,
    }))
    .sort((a, b) => {
      const byStatus = (rank[a.applicationStatus] ?? 9) - (rank[b.applicationStatus] ?? 9);
      return byStatus !== 0 ? byStatus : a.name.localeCompare(b.name);
    });
}
