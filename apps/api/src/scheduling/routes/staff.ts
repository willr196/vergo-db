import type { FastifyInstance } from '../fastifyShim';
import { z } from 'zod';
import { prisma } from '../../prisma';
import { requireAdmin } from '../fastifyShim';
import { allInRate, dec } from '../costing';

const money = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v) => (v === null || v === undefined || v === '' ? null : String(v)));

/**
 * Not a payroll record. Date of birth, tax code, student loan, NI number and
 * salary belong to the payroll panel - see the note on the Staff model. Adding
 * any of them back here means this app starts holding payroll data again.
 */
const staffBody = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  email: z.string().email('Not a valid email').max(200).nullish().or(z.literal('')),
  phone: z.string().max(50).nullish(),
  hourlyRate: money,
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  notes: z.string().max(5000).nullish(),
});

const blankToNull = (v: unknown) => (v === '' ? null : v);

export async function staffRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAdmin);

  app.get('/api/staff', async (request) => {
    const { status, search } = request.query as { status?: string; search?: string };

    const rows = await prisma.schedStaff.findMany({
      where: {
        ...(status ? { status: status as 'ACTIVE' | 'INACTIVE' } : {}),
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' as const } },
                { lastName: { contains: search, mode: 'insensitive' as const } },
                { email: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      // People are known by their first name here, so that is what the list is
      // alphabetical on; the surname only breaks ties between two Sarahs.
      orderBy: [{ status: 'asc' }, { firstName: 'asc' }, { lastName: 'asc' }],
    });

    // The all-in rate is what a job actually costs, so it is worth showing
    // next to the base rate rather than leaving people to add 12.07% mentally.
    return rows.map((s) => ({
      ...s,
      allInRate: s.hourlyRate ? allInRate(dec(s.hourlyRate.toString())).allInHourly.toFixed(2) : null,
    }));
  });

  /**
   * Shifts an individual can still be booked onto. The actual assignment is
   * still created by /api/jobs/:id/crew, so both booking directions retain
   * the same rate, duplicate and same-day-clash safeguards.
   */
  app.get('/api/staff/:id/open-jobs', async (request, reply) => {
    const { id } = request.params as { id: string };
    const staff = await prisma.schedStaff.findUnique({ where: { id }, select: { id: true } });
    if (!staff) return reply.code(404).send({ error: 'Staff member not found' });

    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const jobs = await prisma.schedJob.findMany({
      where: {
        date: { gte: today },
        status: { in: ['DRAFT', 'CONFIRMED'] },
        assignments: { none: { staffId: id } },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      take: 50,
      include: {
        client: { select: { name: true } },
        _count: { select: { assignments: true } },
      },
    });

    return jobs.map(({ _count, ...job }) => ({ ...job, crewCount: _count.assignments }));
  });

  app.get('/api/staff/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const staff = await prisma.schedStaff.findUnique({
      where: { id },
      include: {
        assignments: {
          include: { job: { include: { client: { select: { name: true } } } } },
          orderBy: { job: { date: 'desc' } },
          take: 50,
        },
      },
    });
    if (!staff) return reply.code(404).send({ error: 'Staff member not found' });

    return {
      ...staff,
      rate: staff.hourlyRate
        ? {
            base: dec(staff.hourlyRate.toString()).toFixed(2),
            ...(() => {
              const r = allInRate(dec(staff.hourlyRate.toString()));
              return { holiday: r.holidayHourly.toFixed(2), allIn: r.allInHourly.toFixed(2) };
            })(),
          }
        : null,
    };
  });

  app.post('/api/staff', async (request, reply) => {
    const parsed = staffBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid staff record' });
    }
    const { email, hourlyRate, ...rest } = parsed.data;

    const staff = await prisma.schedStaff.create({
      data: { ...rest, email: blankToNull(email) as string | null, hourlyRate },
    });
    return reply.code(201).send(staff);
  });

  app.patch('/api/staff/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = staffBody.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid staff record' });
    }

    const current = await prisma.schedStaff.findUnique({ where: { id } });
    if (!current) return reply.code(404).send({ error: 'Staff member not found' });

    const { email, ...rest } = parsed.data;

    const staff = await prisma.schedStaff.update({
      where: { id },
      data: {
        ...rest,
        ...(email !== undefined ? { email: blankToNull(email) as string | null } : {}),
      },
    });
    return staff;
  });

  app.delete('/api/staff/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const assignments = await prisma.schedAssignment.count({ where: { staffId: id } });
    if (assignments > 0) {
      // Keep the work history; mark them inactive instead.
      await prisma.schedStaff.update({ where: { id }, data: { status: 'INACTIVE' } });
      return {
        archived: true,
        reason: `They're on ${assignments} job${assignments === 1 ? '' : 's'}, so they've been made inactive rather than deleted`,
      };
    }
    await prisma.schedStaff.delete({ where: { id } });
    return { deleted: true };
  });
}
