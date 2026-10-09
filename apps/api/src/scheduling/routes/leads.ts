import type { FastifyInstance } from '../fastifyShim';
import { z } from 'zod';
import { prisma } from '../../prisma';
import { requireAdmin } from '../fastifyShim';
import { utcDate } from '../schedule';

const LEAD_STAGES = ['CONTACTED', 'REPLIED', 'WON', 'LOST'] as const;

const leadBody = z.object({
  company: z.string().min(1, 'Company is required').max(200),
  contactName: z.string().max(200).nullish(),
  contactEmail: z.string().email('Not a valid email').max(200).nullish().or(z.literal('')),
  contactPhone: z.string().max(50).nullish(),
  contactedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Contacted date must be YYYY-MM-DD'),
  channel: z.enum(['EMAIL', 'PHONE', 'IN_PERSON', 'OTHER']).optional(),
  stage: z.enum(LEAD_STAGES).optional(),
  notes: z.string().max(5000).nullish(),
});

const blankToNull = (v: unknown) => (v === '' ? null : v);

export async function leadRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAdmin);

  app.get('/api/leads', async (request) => {
    const { stage } = request.query as { stage?: string };
    const stages = (stage ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is (typeof LEAD_STAGES)[number] =>
        (LEAD_STAGES as readonly string[]).includes(s)
      );

    return prisma.schedLead.findMany({
      where: stages.length ? { stage: { in: stages } } : {},
      // Most recently chased first: that is the order you work the list in.
      orderBy: [{ contactedOn: 'desc' }, { company: 'asc' }],
      include: { client: { select: { id: true, name: true } } },
    });
  });

  app.post('/api/leads', async (request, reply) => {
    const parsed = leadBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid lead' });
    }
    const { contactedOn, contactEmail, ...rest } = parsed.data;
    const lead = await prisma.schedLead.create({
      data: {
        ...rest,
        contactEmail: blankToNull(contactEmail) as string | null,
        contactedOn: utcDate(contactedOn),
      },
    });
    return reply.code(201).send(lead);
  });

  app.patch('/api/leads/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = leadBody.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid lead' });
    }
    const exists = await prisma.schedLead.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return reply.code(404).send({ error: 'Lead not found' });

    const { contactedOn, contactEmail, ...rest } = parsed.data;
    return prisma.schedLead.update({
      where: { id },
      data: {
        ...rest,
        ...(contactedOn !== undefined ? { contactedOn: utcDate(contactedOn) } : {}),
        ...(contactEmail !== undefined
          ? { contactEmail: blankToNull(contactEmail) as string | null }
          : {}),
      },
      include: { client: { select: { id: true, name: true } } },
    });
  });

  app.delete('/api/leads/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const exists = await prisma.schedLead.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return reply.code(404).send({ error: 'Lead not found' });
    await prisma.schedLead.delete({ where: { id } });
    return { deleted: true };
  });

  /**
   * The lead went through: make it a client and keep the two linked.
   *
   * Converting is what marks a lead won, so there is no way to end up with a
   * won lead that nobody can book a job for. Converting twice is refused
   * rather than quietly making a second client with the same name.
   */
  app.post('/api/leads/:id/convert', async (request, reply) => {
    const { id } = request.params as { id: string };
    const lead = await prisma.schedLead.findUnique({ where: { id }, include: { client: true } });
    if (!lead) return reply.code(404).send({ error: 'Lead not found' });
    if (lead.client) {
      return reply.code(409).send({
        error: `${lead.company} is already a client`,
        clientId: lead.client.id,
      });
    }

    const [, updated] = await prisma.$transaction(async (tx) => {
      const client = await tx.schedClient.create({
        data: {
          name: lead.company,
          contactName: lead.contactName,
          contactEmail: lead.contactEmail,
          contactPhone: lead.contactPhone,
          notes: lead.notes,
        },
      });
      const relinked = await tx.schedLead.update({
        where: { id },
        data: { stage: 'WON', clientId: client.id },
        include: { client: { select: { id: true, name: true } } },
      });
      return [client, relinked] as const;
    });

    return reply.code(201).send(updated);
  });
}
