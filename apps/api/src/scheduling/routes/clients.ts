import type { FastifyInstance } from '../fastifyShim';
import { z } from 'zod';
import { prisma } from '../../prisma';
import { requireAdmin } from '../fastifyShim';

const money = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v) => (v === null || v === undefined || v === '' ? null : String(v)));

const clientBody = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  contactName: z.string().max(200).nullish(),
  contactEmail: z.string().email('Not a valid email').max(200).nullish().or(z.literal('')),
  contactPhone: z.string().max(50).nullish(),
  defaultChargeRate: money,
  notes: z.string().max(5000).nullish(),
  archived: z.boolean().optional(),
});

const blankToNull = (v: unknown) => (v === '' ? null : v);

export async function clientRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAdmin);

  app.get('/api/clients', async (request) => {
    const { archived } = request.query as { archived?: string };
    return prisma.schedClient.findMany({
      where: archived === undefined ? {} : { archived: archived === 'true' },
      orderBy: { name: 'asc' },
      include: { _count: { select: { jobs: true } } },
    });
  });

  app.get('/api/clients/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const client = await prisma.schedClient.findUnique({
      where: { id },
      include: {
        jobs: { orderBy: { date: 'desc' }, take: 50 },
      },
    });
    if (!client) return reply.code(404).send({ error: 'Client not found' });
    return client;
  });

  app.post('/api/clients', async (request, reply) => {
    const parsed = clientBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid client' });
    }
    const { defaultChargeRate, contactEmail, ...rest } = parsed.data;
    const client = await prisma.schedClient.create({
      data: {
        ...rest,
        contactEmail: blankToNull(contactEmail) as string | null,
        defaultChargeRate,
      },
    });
    // 201, to match the other create endpoints.
    return reply.code(201).send(client);
  });

  app.patch('/api/clients/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = clientBody.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid client' });
    }
    const exists = await prisma.schedClient.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return reply.code(404).send({ error: 'Client not found' });

    const { contactEmail, ...rest } = parsed.data;
    return prisma.schedClient.update({
      where: { id },
      data: {
        ...rest,
        ...(contactEmail !== undefined ? { contactEmail: blankToNull(contactEmail) as string | null } : {}),
      },
    });
  });

  app.delete('/api/clients/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const jobs = await prisma.schedJob.count({ where: { clientId: id } });
    if (jobs > 0) {
      // Archiving keeps the job history intact; deleting would orphan it.
      await prisma.schedClient.update({ where: { id }, data: { archived: true } });
      return { archived: true, reason: `${jobs} job${jobs === 1 ? '' : 's'} reference this client` };
    }
    await prisma.schedClient.delete({ where: { id } });
    return { deleted: true };
  });
}
