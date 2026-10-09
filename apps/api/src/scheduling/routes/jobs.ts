import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from '../fastifyShim';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../prisma';
import { requireAdmin } from '../fastifyShim';
import { hoursBetween, costFor, marginFor, type CostLine } from '../costingService';
import { dec, type Decimal } from '../costing';
import {
  ScheduleError,
  daysInRun,
  horizonFrom,
  isoDate,
  parseRepeatDays,
  utcDate,
} from '../schedule';

const money = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v) => (v === null || v === undefined || v === '' ? null : String(v)));

const time = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be HH:MM');

const selectedDate = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Each date must be YYYY-MM-DD'),
  // A note belongs to the individual day, rather than the whole booking.
  notes: z.string().max(5000).nullish(),
});

/** A line on the event running order, independent from staffing and pay. */
const scheduleItemBody = z.object({
  time: time.nullish(),
  title: z.string().trim().min(1, 'Schedule item is required').max(200),
  assignee: z.string().trim().max(100).nullish(),
  notes: z.string().trim().max(2000).nullish(),
});

const jobBody = z.object({
  // Optional. An empty string from the form's "no client" option means the
  // same as absent, and both store as null rather than as ''.
  clientId: z
    .string()
    .nullish()
    .transform((v) => (v === null || v === undefined || v === '' ? null : v)),
  title: z.string().min(1, 'Title is required').max(200),
  // References remain in the VJ-0001 format so manual corrections cannot
  // break the automatic sequence used for the next job.
  reference: z.string().trim().toUpperCase().regex(/^VJ-\d{4,}$/, 'Reference must look like VJ-0001').max(50).optional(),
  venueName: z.string().max(200).nullish(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  // The last day of a run. Absent means a single day, which stays the usual case.
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be YYYY-MM-DD')
    .nullish()
    .transform((v) => (v === null || v === undefined || v === '' ? null : v)),
  ongoing: z.boolean().optional(),
  repeatDays: z.array(z.number()).nullish(),
  // Non-consecutive dates selected while making one booking. Each is still
  // saved as a normal Job, so the rota and payroll continue to work per day.
  selectedDates: z.array(selectedDate).min(1, 'Add at least one date').nullish(),
  startTime: time,
  endTime: time,
  breakMinutes: z.number().int().min(0).max(600).optional(),
  // How many people the event needs and what as. Null clears the target.
  staffNeeded: z.number().int().min(0).max(999).nullish(),
  roleNeeded: z.string().max(100).nullish(),
  chargeRate: z.union([z.number(), z.string()]).transform(String),
  status: z.enum(['DRAFT', 'CONFIRMED', 'COMPLETED', 'CANCELLED']).optional(),
  invoiceStatus: z.enum(['NOT_INVOICED', 'INVOICED', 'PAID']).optional(),
  notes: z.string().max(5000).nullish(),
});


/**
 * Today at UTC midnight, to compare against dates stored as @db.Date.
 *
 * Local midnight would land on the wrong side of the boundary through British
 * Summer Time - 00:30 on the 8th in London is still the 7th in UTC - and quietly
 * shift which days count as past.
 */
function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const formatReference = (n: number) => `VJ-${String(n).padStart(4, '0')}`;

/**
 * The next free number in the VJ-0001 sequence.
 *
 * A run needs a block of them, and asking for one at a time does not work: this
 * reads the highest reference already stored, and nothing is stored until the
 * transaction commits, so every day would be handed the same number and the
 * unique index would reject the lot. Callers take a starting number and count
 * up from it themselves.
 */
async function nextReferenceNumber(): Promise<number> {
  const references = await prisma.schedJob.findMany({
    where: { reference: { startsWith: 'VJ-' } },
    select: { reference: true },
  });
  const highest = references.reduce((max, { reference }) => {
    const number = Number(reference.slice(3));
    return Number.isSafeInteger(number) ? Math.max(max, number) : max;
  }, 0);
  return highest + 1;
}

async function nextReference(): Promise<string> {
  return formatReference(await nextReferenceNumber());
}

const JOB_STATUSES = ['DRAFT', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] as const;
const INVOICE_STATUSES = ['NOT_INVOICED', 'INVOICED', 'PAID'] as const;

type JobStatus = (typeof JOB_STATUSES)[number];
type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** A page big enough that nobody scrolls past it, small enough to stay quick. */
const MAX_JOB_PAGE = 200;

/**
 * Read a filter that takes one value or a comma-separated set, rejecting
 * anything that is not a real status rather than quietly returning no rows.
 */
function statusList<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
  field: string
): T[] {
  if (!raw) return [];
  const values = raw.split(',').map((v) => v.trim()).filter(Boolean);
  for (const value of values) {
    if (!allowed.includes(value as T)) {
      throw new Error(`Unknown ${field}: ${value}`);
    }
  }
  return values as T[];
}

/** A positive whole number, or undefined if absent, or null if it is nonsense. */
function countParam(raw: string | undefined, max: number): number | undefined | null {
  if (raw === undefined || raw === '') return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0 || value > max) return null;
  return value;
}

export async function jobRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAdmin);

  app.get('/api/jobs', async (request, reply) => {
    const { status, invoiceStatus, clientId, from, to, limit, offset, order, search, role, crew } =
      request.query as Record<string, string | undefined>;

    // History reads newest first, but a board of work still to come reads
    // soonest first, so the caller says which way round it wants the days.
    if (order !== undefined && order !== 'asc' && order !== 'desc') {
      return reply.code(400).send({ error: "order must be 'asc' or 'desc'" });
    }
    const dateOrder = order === 'asc' ? 'asc' : 'desc';

    // Crew is a comparison between two columns rather than a value to match,
    // so it is applied after the query rather than in the where clause.
    if (crew !== undefined && crew !== 'short' && crew !== 'full') {
      return reply.code(400).send({ error: "crew must be 'short' or 'full'" });
    }

    // One box that searches the things you actually remember about a job: its
    // reference, what it was called, or who it was for.
    const term = search?.trim();
    const matchesTerm = term
      ? {
          OR: [
            { reference: { contains: term, mode: 'insensitive' as const } },
            { title: { contains: term, mode: 'insensitive' as const } },
            { client: { name: { contains: term, mode: 'insensitive' as const } } },
          ],
        }
      : {};

    // Both status filters take one value or a comma-separated set, so a page
    // can ask for "completed but not paid" in one query instead of fetching
    // everything and throwing most of it away in the browser.
    let statuses: JobStatus[];
    let invoiceStatuses: InvoiceStatus[];
    try {
      statuses = statusList(status, JOB_STATUSES, 'status');
      invoiceStatuses = statusList(invoiceStatus, INVOICE_STATUSES, 'invoiceStatus');
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }

    const take = countParam(limit, MAX_JOB_PAGE);
    const skip = countParam(offset, Number.MAX_SAFE_INTEGER);
    if (take === null || skip === null) {
      return reply.code(400).send({
        error: `limit must be a whole number from 0 to ${MAX_JOB_PAGE}, and offset a whole number`,
      });
    }

    const jobs = await prisma.schedJob.findMany({
      where: {
        ...(statuses.length ? { status: { in: statuses } } : {}),
        ...(invoiceStatuses.length ? { invoiceStatus: { in: invoiceStatuses } } : {}),
        ...(clientId ? { clientId } : {}),
        ...(role ? { roleNeeded: role } : {}),
        ...matchesTerm,
        ...(from || to
          ? { date: { ...(from ? { gte: utcDate(from) } : {}), ...(to ? { lte: utcDate(to) } : {}) } }
          : {}),
      },
      // Start time follows the date, so a day with a 07:00 and a 17:00 on it
      // reads in the order the work actually happens rather than in whatever
      // order the rows were created.
      // Id breaks the last tie so the order is total. Sorting on date alone
      // leaves jobs sharing a date free to swap places between two queries,
      // which for a paged caller means a row shown twice and another never
      // shown.
      orderBy: [{ date: dateOrder }, { startTime: dateOrder }, { id: 'asc' }],
      // A caller that wants pages asks for one more row than it will show and
      // learns from the extra whether to offer "load more". No limit given
      // means the whole list, which is what the day-to-day board wants.
      ...(take !== undefined ? { take } : {}),
      ...(skip ? { skip } : {}),
      include: {
        client: { select: { id: true, name: true } },
        // The list only ever shows how many people are on a job, so count them
        // in the database rather than dragging every assignment and staff row
        // back for every job. The crew itself is on the job detail.
        _count: { select: { assignments: true } },
      },
    });

    const shaped = jobs.map(({ _count, ...job }) => ({
      ...job,
      scheduledHours: hoursBetween(job.startTime, job.endTime, job.breakMinutes).toFixed(2),
      crewCount: _count.assignments,
    }));

    // A job with no target set is neither short nor full - nobody has said
    // what it needs yet - so it drops out of both sides of this filter.
    if (!crew) return shaped;
    return shaped.filter((job) =>
      job.staffNeeded === null
        ? false
        : crew === 'short'
          ? job.crewCount < job.staffNeeded
          : job.crewCount >= job.staffNeeded
    );
  });

  /** Job detail, with each person's pay and the job's margin. */
  /**
   * The roles you have asked for before, so the form can suggest them.
   *
   * Keeping the role free text means it needs no migration to add a word;
   * offering back what you have already typed is what stops "Steward" and
   * "steward" and "Stewards" becoming three different things.
   */
  app.get('/api/jobs/roles', async () => {
    const rows = await prisma.schedJob.findMany({
      where: { roleNeeded: { not: null } },
      distinct: ['roleNeeded'],
      select: { roleNeeded: true },
      orderBy: { roleNeeded: 'asc' },
    });
    return rows.map((row) => row.roleNeeded).filter((role): role is string => Boolean(role));
  });

  app.get('/api/jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await prisma.schedJob.findUnique({
      where: { id },
      include: {
        client: true,
        assignments: { include: { staff: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!job) return reply.code(404).send({ error: 'Job not found' });

    const chargeRate = dec(job.chargeRate.toString());
    const forMargin: Array<{ hours: Decimal; cost: CostLine }> = [];

    const crew = job.assignments.map((a) => {
      const hours = dec(a.hours.toString());
      const rate = a.rateOverride
        ? dec(a.rateOverride.toString())
        : a.staff.hourlyRate
          ? dec(a.staff.hourlyRate.toString())
          : null;
      const name = `${a.staff.firstName} ${a.staff.lastName}`;

      try {
        const cost = costFor(hours, rate ?? dec(0), name);
        forMargin.push({ hours, cost });
        return {
          assignmentId: a.id,
          staffId: a.staff.id,
          name,
          hours: hours.toFixed(2),
          rateOverride: a.rateOverride?.toString() ?? null,
          rate: cost.rate.toFixed(2),
          basePay: cost.basePay.toFixed(2),
          holidayPay: cost.holidayPay.toFixed(2),
          totalCost: cost.totalCost.toFixed(2),
          error: null as string | null,
        };
      } catch (err) {
        // One person with no rate shouldn't blank the whole job page.
        return {
          assignmentId: a.id,
          staffId: a.staff.id,
          name,
          hours: hours.toFixed(2),
          rateOverride: a.rateOverride?.toString() ?? null,
          error: err instanceof Error ? err.message : 'Could not work out the cost',
        };
      }
    });

    return {
      ...job,
      scheduledHours: hoursBetween(job.startTime, job.endTime, job.breakMinutes).toFixed(2),
      crew,
      margin: marginFor(chargeRate, forMargin),
    };
  });

  /**
   * A printable running order for one job. Schedule items deliberately live
   * alongside the job rather than in the rota: an arrival or briefing can be
   * useful even when it has no person assigned to it.
   */
  app.get('/api/jobs/:id/schedule', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await prisma.schedJob.findUnique({
      where: { id },
      select: {
        id: true,
        reference: true,
        title: true,
        venueName: true,
        date: true,
        startTime: true,
        endTime: true,
        client: { select: { id: true, name: true } },
        assignments: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, staff: { select: { id: true, firstName: true, lastName: true } } },
        },
        scheduleItems: { orderBy: [{ time: 'asc' }, { createdAt: 'asc' }] },
      },
    });
    if (!job) return reply.code(404).send({ error: 'Job not found' });

    return {
      ...job,
      crew: job.assignments.map((assignment) => ({
        id: assignment.staff.id,
        name: `${assignment.staff.firstName} ${assignment.staff.lastName}`,
      })),
      scheduleItems: job.scheduleItems,
    };
  });

  app.post('/api/jobs/:id/schedule-items', async (request, reply) => {
    const { id: jobId } = request.params as { id: string };
    const parsed = scheduleItemBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid schedule item' });
    }
    const job = await prisma.schedJob.findUnique({ where: { id: jobId }, select: { id: true } });
    if (!job) return reply.code(404).send({ error: 'Job not found' });

    return reply.code(201).send(await prisma.schedJobScheduleItem.create({
      data: {
        jobId,
        time: parsed.data.time || null,
        title: parsed.data.title,
        assignee: parsed.data.assignee || null,
        notes: parsed.data.notes || null,
      },
    }));
  });

  app.patch('/api/schedule-items/:itemId', async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const parsed = scheduleItemBody.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid schedule item' });
    }
    const item = await prisma.schedJobScheduleItem.findUnique({ where: { id: itemId }, select: { id: true } });
    if (!item) return reply.code(404).send({ error: 'Schedule item not found' });

    const data = {
      ...parsed.data,
      ...(parsed.data.time !== undefined ? { time: parsed.data.time || null } : {}),
      ...(parsed.data.assignee !== undefined ? { assignee: parsed.data.assignee || null } : {}),
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes || null } : {}),
    };
    return prisma.schedJobScheduleItem.update({ where: { id: itemId }, data });
  });

  app.delete('/api/schedule-items/:itemId', async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const item = await prisma.schedJobScheduleItem.findUnique({ where: { id: itemId }, select: { id: true } });
    if (!item) return reply.code(404).send({ error: 'Schedule item not found' });
    await prisma.schedJobScheduleItem.delete({ where: { id: itemId } });
    return { deleted: true };
  });

  app.post('/api/jobs', async (request, reply) => {
    const parsed = jobBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid job' });
    }
    const { date, ...rest } = parsed.data;

    // Only worth checking when one was actually named. No client is allowed;
    // a client that has since been deleted is still a mistake worth catching.
    if (rest.clientId) {
      const client = await prisma.schedClient.findUnique({
        where: { id: rest.clientId },
        select: { id: true },
      });
      if (!client) return reply.code(400).send({ error: 'That client no longer exists' });
    }

    try {
      hoursBetween(rest.startTime, rest.endTime, rest.breakMinutes ?? 0);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Invalid times' });
    }

    const { endDate, ongoing, repeatDays, selectedDates, ...jobFields } = rest;

    // A handful of specific dates (for example, a three-date event) is not a
    // repeating run. Make a complete ordinary job for every chosen date, with
    // its own note, and link them only for convenient grouping in the jobs list.
    if (selectedDates) {
      const dates = selectedDates
        .map((entry) => ({ ...entry, day: utcDate(entry.date) }))
        .sort((a, b) => a.date.localeCompare(b.date));
      const duplicates = dates.some((entry, index) => index > 0 && entry.date === dates[index - 1]?.date);
      if (duplicates) return reply.code(400).send({ error: 'Each selected date can only be added once' });

      if (dates.length === 1) {
        const only = dates[0]!;
        const job = await prisma.schedJob.create({
          data: {
            ...jobFields,
            notes: only.notes || jobFields.notes || null,
            date: only.day,
            reference: await nextReference(),
          },
          include: { client: { select: { name: true } } },
        });
        return reply.code(201).send(job);
      }

      const startNumber = await nextReferenceNumber();
      const seriesId = randomUUID();
      await prisma.$transaction(
        dates.map((entry, i) =>
          prisma.schedJob.create({
            data: {
              ...jobFields,
              notes: entry.notes || jobFields.notes || null,
              date: entry.day,
              reference: formatReference(startNumber + i),
              endDate: null,
              ongoing: false,
              repeatDays: [],
              seriesId,
            },
          })
        )
      );

      const first = await prisma.schedJob.findUnique({
        where: { reference: formatReference(startNumber) },
        include: { client: { select: { name: true } } },
      });
      return reply.code(201).send({
        ...first,
        run: {
          seriesId,
          created: dates.length,
          from: dates[0]!.date,
          to: dates[dates.length - 1]!.date,
        },
      });
    }

    let days: Date[];
    let parsedRepeatDays: number[];
    try {
      parsedRepeatDays = parseRepeatDays(repeatDays);
      days = daysInRun(
        {
          start: utcDate(date),
          end: endDate ? utcDate(endDate) : null,
          ongoing: ongoing ?? false,
          repeatDays: parsedRepeatDays,
        },
        horizonFrom(startOfToday())
      );
    } catch (err) {
      if (err instanceof ScheduleError) return reply.code(err.httpStatus).send({ error: err.message });
      throw err;
    }

    const firstDay = days[0];
    const lastDay = days[days.length - 1];
    // daysInRun refuses to return an empty run, so this is unreachable - but
    // the types do not know that and a silent [] would create nothing at all.
    if (!firstDay || !lastDay) {
      return reply.code(400).send({ error: 'That run does not cover any days' });
    }

    // A plain one-day job is still a plain one-day job: no series, no run
    // fields, nothing new in the row.
    if (days.length === 1 && !endDate && !ongoing) {
      const job = await prisma.schedJob.create({
        data: { ...jobFields, date: firstDay, reference: await nextReference() },
        include: { client: { select: { name: true } } },
      });
      return reply.code(201).send(job);
    }

    const startNumber = await nextReferenceNumber();
    const seriesId = randomUUID();
    const shape = {
      endDate: endDate ? utcDate(endDate) : null,
      ongoing: ongoing ?? false,
      repeatDays: parsedRepeatDays,
      seriesId,
    };

    // One transaction: a run that half-created would leave days nobody asked
    // for and a reference sequence with holes in it.
    await prisma.$transaction(
      days.map((day, i) =>
        prisma.schedJob.create({
          data: { ...jobFields, ...shape, date: day, reference: formatReference(startNumber + i) },
        })
      )
    );

    const first = await prisma.schedJob.findUnique({
      where: { reference: formatReference(startNumber) },
      include: { client: { select: { name: true } } },
    });
    return reply.code(201).send({
      ...first,
      run: { seriesId, created: days.length, from: isoDate(firstDay), to: isoDate(lastDay) },
    });
  });

  app.patch('/api/jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = jobBody.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid job' });
    }
    const current = await prisma.schedJob.findUnique({ where: { id } });
    if (!current) return reply.code(404).send({ error: 'Job not found' });

    const { date, ...rest } = parsed.data;

    // Clearing the client is allowed; pointing it at one that has gone is not,
    // and without this the foreign key surfaces as a bare 500.
    if (rest.clientId) {
      const client = await prisma.schedClient.findUnique({
        where: { id: rest.clientId },
        select: { id: true },
      });
      if (!client) return reply.code(400).send({ error: 'That client no longer exists' });
    }

    try {
      hoursBetween(
        rest.startTime ?? current.startTime,
        rest.endTime ?? current.endTime,
        rest.breakMinutes ?? current.breakMinutes
      );
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Invalid times' });
    }

    // The run fields describe the shape, not this day. Changing them is what
    // /run and /extend are for, so they are dropped from an ordinary edit.
    const {
      endDate: _endDate,
      ongoing: _ongoing,
      repeatDays: _repeatDays,
      selectedDates: _selectedDates,
      ...fields
    } = rest;

    let updated;
    try {
      updated = await prisma.schedJob.update({
        where: { id },
        data: { ...fields, ...(date ? { date: utcDate(date) } : {}) },
        include: { client: { select: { name: true } } },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return reply.code(409).send({ error: 'That VJ reference is already in use' });
      }
      throw err;
    }

    // Re-timing a run one day at a time is the tedium this whole feature
    // exists to remove, so offer to carry the change forward. The date is
    // never carried - each day has its own - and neither is the past.
    const { applyToRun } = request.query as { applyToRun?: string };
    if (applyToRun === 'true' && current.seriesId) {
      const { date: _date, ...carried } = fields as Record<string, unknown>;
      const { count } = await prisma.schedJob.updateMany({
        where: { seriesId: current.seriesId, date: { gte: startOfToday() }, id: { not: id } },
        data: carried,
      });
      return { ...updated, run: { updated: count } };
    }

    return updated;
  });

  /**
   * Everything about the run a job belongs to.
   *
   * The shape is denormalised onto every day, so this reads it off the job
   * itself and only queries for the days either side.
   */
  app.get('/api/jobs/:id/run', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await prisma.schedJob.findUnique({ where: { id } });
    if (!job) return reply.code(404).send({ error: 'Job not found' });
    if (!job.seriesId) return { run: null };

    const today = startOfToday();
    const [days, upcoming, last] = await Promise.all([
      prisma.schedJob.count({ where: { seriesId: job.seriesId } }),
      prisma.schedJob.count({ where: { seriesId: job.seriesId, date: { gte: today } } }),
      prisma.schedJob.findFirst({
        where: { seriesId: job.seriesId },
        orderBy: { date: 'desc' },
        select: { date: true },
      }),
    ]);

    return {
      run: {
        seriesId: job.seriesId,
        ongoing: job.ongoing,
        endDate: job.endDate ? isoDate(job.endDate) : null,
        repeatDays: job.repeatDays,
        days,
        upcoming,
        filledTo: last ? isoDate(last.date) : null,
      },
    };
  });

  /**
   * Top an ongoing run back up to the rolling window.
   *
   * An open-ended run cannot be generated forever, so it is filled a window
   * ahead and extended from here. Days already on the books are skipped, which
   * makes calling this twice harmless.
   */
  app.post('/api/jobs/:id/extend', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await prisma.schedJob.findUnique({ where: { id } });
    if (!job) return reply.code(404).send({ error: 'Job not found' });
    if (!job.seriesId || !job.ongoing) {
      return reply.code(400).send({ error: 'That job is not part of an ongoing run' });
    }

    const last = await prisma.schedJob.findFirst({
      where: { seriesId: job.seriesId },
      orderBy: { date: 'desc' },
      select: { date: true },
    });

    let days: Date[];
    try {
      days = daysInRun(
        { start: job.date, end: null, ongoing: true, repeatDays: job.repeatDays },
        horizonFrom(startOfToday()),
        last?.date ?? null
      );
    } catch (err) {
      if (err instanceof ScheduleError) return reply.code(err.httpStatus).send({ error: err.message });
      throw err;
    }

    const newest = days[days.length - 1];
    if (days.length === 0 || !newest) {
      return { added: 0, filledTo: last ? isoDate(last.date) : null };
    }

    const startNumber = await nextReferenceNumber();
    await prisma.$transaction(
      days.map((day, i) =>
        prisma.schedJob.create({
          data: {
            clientId: job.clientId,
            title: job.title,
            venueName: job.venueName,
            startTime: job.startTime,
            endTime: job.endTime,
            breakMinutes: job.breakMinutes,
            staffNeeded: job.staffNeeded,
            roleNeeded: job.roleNeeded,
            chargeRate: job.chargeRate,
            status: job.status,
            notes: job.notes,
            endDate: null,
            ongoing: true,
            repeatDays: job.repeatDays,
            seriesId: job.seriesId,
            date: day,
            reference: formatReference(startNumber + i),
          },
        })
      )
    );

    return { added: days.length, filledTo: isoDate(newest) };
  });

  /**
   * Cancel or delete the rest of a run.
   *
   * Only days from today onwards. Past days are worked days - people were on
   * them and are owed for them - so they are never touched.
   */
  app.delete('/api/jobs/:id/run', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { mode } = request.query as { mode?: string };
    const job = await prisma.schedJob.findUnique({ where: { id } });
    if (!job) return reply.code(404).send({ error: 'Job not found' });
    if (!job.seriesId) return reply.code(400).send({ error: 'That job is not part of a run' });

    const future = { seriesId: job.seriesId, date: { gte: startOfToday() } };

    // Cancelling keeps the history and takes the days out of the rota and the
    // pay summary, both of which already skip CANCELLED. Deleting is for a run
    // created by mistake.
    if (mode === 'delete') {
      const { count } = await prisma.schedJob.deleteMany({ where: future });
      return { deleted: count };
    }

    const { count } = await prisma.schedJob.updateMany({ where: future, data: { status: 'CANCELLED' } });
    return { cancelled: count };
  });

  /**
   * Copy a job to another date. A multi-day booking is several jobs, so this
   * saves retyping the same client, venue, times and crew for each day.
   */
  app.post('/api/jobs/:id/duplicate', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
        copyCrew: z.boolean().optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid date' });
    }

    const source = await prisma.schedJob.findUnique({
      where: { id },
      include: { assignments: true },
    });
    if (!source) return reply.code(404).send({ error: 'Job not found' });

    const copy = await prisma.schedJob.create({
      data: {
        reference: await nextReference(),
        clientId: source.clientId,
        title: source.title,
        venueName: source.venueName,
        date: utcDate(parsed.data.date),
        startTime: source.startTime,
        endTime: source.endTime,
        breakMinutes: source.breakMinutes,
        staffNeeded: source.staffNeeded,
        roleNeeded: source.roleNeeded,
        chargeRate: source.chargeRate,
        status: source.status,
        notes: source.notes,
      },
    });

    let crewCopied = 0;
    if (parsed.data.copyCrew !== false && source.assignments.length > 0) {
      // Rates are re-checked when the crew page loads, so a copy onto a date
      // where someone has aged into a new band still surfaces the problem.
      const result = await prisma.schedAssignment.createMany({
        data: source.assignments.map((a) => ({
          jobId: copy.id,
          staffId: a.staffId,
          hours: a.hours,
          rateOverride: a.rateOverride,
        })),
        skipDuplicates: true,
      });
      crewCopied = result.count;
    }

    return reply.code(201).send({ ...copy, crewCopied });
  });

  app.delete('/api/jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await prisma.schedJob.findUnique({ where: { id }, select: { id: true } });
    if (!job) return reply.code(404).send({ error: 'Job not found' });
    await prisma.schedJob.delete({ where: { id } });
    return { deleted: true };
  });

  // ── People on a job ──────────────────────────────────────────────────────

  const assignBody = z.object({
    staffId: z.string().min(1, 'Pick someone'),
    hours: z.union([z.number(), z.string()]).transform(String).optional(),
    rateOverride: money,
    notes: z.string().max(1000).nullish(),
  });

  app.post('/api/jobs/:id/crew', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = assignBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid assignment' });
    }

    const job = await prisma.schedJob.findUnique({ where: { id } });
    if (!job) return reply.code(404).send({ error: 'Job not found' });

    const staff = await prisma.schedStaff.findUnique({ where: { id: parsed.data.staffId } });
    if (!staff) return reply.code(400).send({ error: 'That person no longer exists' });

    const rate = parsed.data.rateOverride ?? staff.hourlyRate?.toString() ?? null;
    if (!rate) {
      return reply.code(422).send({
        error: `${staff.firstName} ${staff.lastName} has no hourly rate set. Add one on their record first — rates are never assumed.`,
      });
    }

    // There was a minimum wage check here. It needed the age band, which needs
    // a date of birth, which this app no longer holds - see the note on the
    // Staff model. The wage floor is now the payroll panel's responsibility.

    const already = await prisma.schedAssignment.findUnique({
      where: { jobId_staffId: { jobId: id, staffId: staff.id } },
      select: { id: true },
    });
    if (already) return reply.code(409).send({ error: 'They are already on this job' });

    // Same person, same day, another job — worth knowing about, not worth blocking.
    const clash = await prisma.schedAssignment.findFirst({
      where: { staffId: staff.id, job: { date: job.date, id: { not: job.id } } },
      include: { job: { select: { reference: true, title: true, startTime: true, endTime: true } } },
    });

    const assignment = await prisma.schedAssignment.create({
      data: {
        jobId: id,
        staffId: staff.id,
        hours: parsed.data.hours ?? hoursBetween(job.startTime, job.endTime, job.breakMinutes).toFixed(2),
        rateOverride: parsed.data.rateOverride,
        notes: parsed.data.notes,
      },
    });

    return reply.code(201).send({
      ...assignment,
      warning: null,
      clash: clash
        ? `Also on ${clash.job.reference} (${clash.job.title}) the same day, ${clash.job.startTime}–${clash.job.endTime}`
        : null,
    });
  });

  app.patch('/api/crew/:assignmentId', async (request, reply) => {
    const { assignmentId } = request.params as { assignmentId: string };
    const parsed = assignBody.partial().omit({ staffId: true }).safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid change' });
    }

    const current = await prisma.schedAssignment.findUnique({
      where: { id: assignmentId },
      include: { staff: true, job: true },
    });
    if (!current) return reply.code(404).send({ error: 'Assignment not found' });

    // The minimum wage re-check that lived here went with the date of birth.

    return prisma.schedAssignment.update({ where: { id: assignmentId }, data: parsed.data });
  });

  app.delete('/api/crew/:assignmentId', async (request, reply) => {
    const { assignmentId } = request.params as { assignmentId: string };
    const exists = await prisma.schedAssignment.findUnique({
      where: { id: assignmentId },
      select: { id: true },
    });
    if (!exists) return reply.code(404).send({ error: 'Assignment not found' });
    await prisma.schedAssignment.delete({ where: { id: assignmentId } });
    return { deleted: true };
  });
}
