
/**
 * The week grid and the dashboard summary.
 *
 * The take-home calculator and the weekly pay run used to live here. Both
 * needed dates of birth and tax codes, which moved to the payroll panel.
 */
import type { FastifyInstance } from '../fastifyShim';
import { prisma } from '../../prisma';
import { requireAdmin } from '../fastifyShim';
import { costFor, dec, ZERO } from '../costing';
import { hoursBetween } from '../costingService';

const utcDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Base pay plus holiday. Employer NI is not in it - see JobMargin. */
const COST_LABEL = 'Staff cost including holiday pay, excluding employer NI';

export async function toolRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAdmin);

  /** Week grid: days across, people down. */
  app.get('/api/rota', async (request, reply) => {
    const { weekStart } = request.query as { weekStart?: string };
    if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return reply.code(400).send({ error: 'weekStart must be YYYY-MM-DD' });
    }

    const start = utcDate(weekStart);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);

    const [jobs, staff] = await Promise.all([
      prisma.schedJob.findMany({
        where: { date: { gte: start, lte: end }, status: { not: 'CANCELLED' } },
        include: {
          client: { select: { name: true } },
          assignments: { include: { staff: { select: { id: true } } } },
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      }),
      prisma.schedStaff.findMany({
        where: { status: 'ACTIVE' },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        select: { id: true, firstName: true, lastName: true },
      }),
    ]);

    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      return d.toISOString().slice(0, 10);
    });

    // Weekly hours per person, so anyone heading past 48 is visible.
    const weeklyHours = new Map<string, number>();
    for (const job of jobs) {
      for (const a of job.assignments) {
        weeklyHours.set(a.staff.id, (weeklyHours.get(a.staff.id) ?? 0) + Number(a.hours));
      }
    }

    return {
      weekStart: days[0],
      days,
      staff: staff.map((s) => ({
        ...s,
        name: `${s.firstName} ${s.lastName}`,
        weeklyHours: (weeklyHours.get(s.id) ?? 0).toFixed(2),
        overWorkingTimeLimit: (weeklyHours.get(s.id) ?? 0) > 48,
      })),
      jobs: jobs.map((job) => ({
        id: job.id,
        reference: job.reference,
        title: job.title,
        clientName: job.client?.name ?? null,
        date: job.date.toISOString().slice(0, 10),
        startTime: job.startTime,
        endTime: job.endTime,
        staffIds: job.assignments.map((a) => a.staff.id),
        crewCount: job.assignments.length,
        hours: hoursBetween(job.startTime, job.endTime, job.breakMinutes).toFixed(2),
      })),
    };
  });

  /** What needs attention right now. */
  app.get('/api/dashboard', async () => {
    const today = new Date();
    const todayUtc = utcDate(today.toISOString().slice(0, 10));
    const weekAhead = new Date(todayUtc);
    weekAhead.setUTCDate(weekAhead.getUTCDate() + 7);

    const [upcoming, activeStaff] = await Promise.all([
      prisma.schedJob.findMany({
        where: { date: { gte: todayUtc, lte: weekAhead }, status: { not: 'CANCELLED' } },
        include: {
          client: { select: { name: true } },
          assignments: { include: { staff: true } },
        },
        orderBy: { date: 'asc' },
      }),
      prisma.schedStaff.findMany({ where: { status: 'ACTIVE' } }),
    ]);

    // The minimum wage watch that stood here needed each person's age band.
    // It moved to the payroll panel along with the dates of birth.

    let committedCost = ZERO;
    for (const job of upcoming) {
      for (const a of job.assignments) {
        const rate = a.rateOverride ?? a.staff.hourlyRate;
        if (!rate) continue; // Surfaces in staffWithoutRate instead.
        committedCost = committedCost.plus(
          costFor(dec(a.hours.toString()), dec(rate.toString())).totalCost
        );
      }
    }

    return {
      label: COST_LABEL,
      jobsThisWeek: upcoming.length,
      unstaffedJobs: upcoming
        .filter((j) => j.assignments.length === 0)
        .map((j) => ({
          id: j.id,
          reference: j.reference,
          title: j.title,
          clientName: j.client?.name ?? null,
          date: j.date.toISOString().slice(0, 10),
        })),
      committedWageCost: committedCost.toFixed(2),
      activeStaffCount: activeStaff.length,
      staffWithoutRate: activeStaff
        .filter((s) => !s.hourlyRate)
        .map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` })),
    };
  });
}
