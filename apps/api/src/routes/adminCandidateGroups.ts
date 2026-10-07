import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { adminAuth } from '../middleware/adminAuth';

// Candidate groups: shortlists the admin names ("Good bartenders"). Membership
// is per person, so it follows them from candidate to hired staff. The roster
// pages select applications, so membership calls take application ids and
// resolve them to people here.

const r = Router();
r.use(adminAuth);

const nameSchema = z.object({ name: z.string().trim().min(1, 'Give the group a name').max(80) });
const membersSchema = z.object({
  applicationIds: z.array(z.string().min(1)).min(1).max(500),
  // Set to move: the people leave this group as they join the target.
  fromGroupId: z.string().min(1).optional()
});
const removeSchema = z.object({ applicationIds: z.array(z.string().min(1)).min(1).max(500) });

function adminName(req: any): string {
  return req.session?.username || 'admin';
}

async function applicantIdsFor(applicationIds: string[]) {
  const apps = await prisma.application.findMany({
    where: { id: { in: applicationIds } },
    select: { applicantId: true }
  });
  return [...new Set(apps.map((a) => a.applicantId))];
}

function isUniqueClash(e: any) {
  return e?.code === 'P2002';
}

// GET /api/v1/admin/candidate-groups — every group with how many people are in it
r.get('/', async (_req, res, next) => {
  try {
    const groups = await prisma.candidateGroup.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, createdAt: true, _count: { select: { members: true } } }
    });
    const shaped = groups.map((g) => ({ id: g.id, name: g.name, createdAt: g.createdAt, count: g._count.members }));
    res.json({ ok: true, groups: shaped, data: { groups: shaped } });
  } catch (e) { next(e); }
});

// POST /api/v1/admin/candidate-groups — create
r.post('/', async (req, res, next) => {
  try {
    const parsed = nameSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid name' });
    const group = await prisma.candidateGroup.create({ data: { name: parsed.data.name } });
    const shaped = { id: group.id, name: group.name, createdAt: group.createdAt, count: 0 };
    res.status(201).json({ ok: true, group: shaped, data: { group: shaped } });
  } catch (e) {
    if (isUniqueClash(e)) return res.status(409).json({ error: 'A group with that name already exists' });
    next(e);
  }
});

// PATCH /api/v1/admin/candidate-groups/:id — rename
r.patch('/:id', async (req, res, next) => {
  try {
    const parsed = nameSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid name' });
    const group = await prisma.candidateGroup.update({ where: { id: req.params.id }, data: { name: parsed.data.name } });
    res.json({ ok: true, group, data: { group } });
  } catch (e: any) {
    if (isUniqueClash(e)) return res.status(409).json({ error: 'A group with that name already exists' });
    if (e?.code === 'P2025') return res.status(404).json({ error: 'Group not found' });
    next(e);
  }
});

// DELETE /api/v1/admin/candidate-groups/:id — delete the group; the people stay
r.delete('/:id', async (req, res, next) => {
  try {
    await prisma.candidateGroup.delete({ where: { id: req.params.id } });
    res.json({ ok: true, data: {} });
  } catch (e: any) {
    if (e?.code === 'P2025') return res.status(404).json({ error: 'Group not found' });
    next(e);
  }
});

// POST /api/v1/admin/candidate-groups/:id/members — add (or, with fromGroupId, move)
r.post('/:id/members', async (req, res, next) => {
  try {
    const parsed = membersSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Choose at least one candidate' });
    const group = await prisma.candidateGroup.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const applicantIds = await applicantIdsFor(parsed.data.applicationIds);
    const addedBy = adminName(req);
    const fromGroupId = parsed.data.fromGroupId;
    await prisma.$transaction([
      prisma.candidateGroupMember.createMany({
        data: applicantIds.map((applicantId) => ({ groupId: group.id, applicantId, addedBy })),
        skipDuplicates: true
      }),
      ...(fromGroupId && fromGroupId !== group.id
        ? [prisma.candidateGroupMember.deleteMany({ where: { groupId: fromGroupId, applicantId: { in: applicantIds } } })]
        : [])
    ]);
    res.json({ ok: true, count: applicantIds.length, data: { count: applicantIds.length } });
  } catch (e) { next(e); }
});

// DELETE /api/v1/admin/candidate-groups/:id/members — take people out of the group
r.delete('/:id/members', async (req, res, next) => {
  try {
    const parsed = removeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Choose at least one candidate' });
    const applicantIds = await applicantIdsFor(parsed.data.applicationIds);
    const result = await prisma.candidateGroupMember.deleteMany({
      where: { groupId: req.params.id, applicantId: { in: applicantIds } }
    });
    res.json({ ok: true, count: result.count, data: { count: result.count } });
  } catch (e) { next(e); }
});

export default r;
