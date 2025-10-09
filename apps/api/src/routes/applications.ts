import { Router } from 'express';
import { z } from 'zod';
import { presignUpload, presignDownload } from '../services/s3';
import { prisma } from '../prisma';
import { randomUUID } from 'crypto';
import { adminAuth } from '../middleware/adminAuth';
import { fileTypeFromBuffer } from 'file-type';

const r = Router();

// ---- Presign for CV upload
const presignBody = z.object({
  fileName: z.string().min(3),
  fileType: z.string().min(3)
});


r.post('/presign', async (req, res, next) => {
  try {
    const { fileName, fileType } = presignBody.parse(req.body);
    const ext = fileName.split('.').pop()?.toLowerCase() || 'pdf';

    // extension whitelist
    if (!/(pdf|doc|docx)$/.test(ext)) {
      return res.status(400).json({ error: 'Only PDF/DOC/DOCX allowed' });
    }

    // Optional: deeper validation if you upload to server first
    // For presign flow we mostly rely on S3 + later AV scan
    // Example if file was uploaded here:
    // const buf = Buffer.from(await file.arrayBuffer());
    // const type = await fileTypeFromBuffer(buf);
    // if (!['application/pdf','application/msword', ...].includes(type?.mime)) {
    //   return res.status(400).json({ error: 'Invalid file type' });
    // }

    const applicantId = randomUUID();
    const now = new Date();
    const key = `cv/${now.getFullYear()}/${now.getMonth() + 1}/${applicantId}/${randomUUID()}.${ext}`;
    const { url } = await presignUpload(key, fileType);

    res.json({ url, key, applicantId });
  } catch (e) { next(e); }
});


// ---- Create application
const createBody = z.object({
  applicantId: z.string(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  rightToWorkUk: z.boolean().optional(),
  roles: z.array(z.string()).min(1),
  cvKey: z.string().min(1),
  cvOriginalName: z.string().optional(),
  source: z.string().optional()
});

r.post('/', async (req, res, next) => {
  try {
    const d = createBody.parse(req.body);

    const app = await prisma.application.create({
      data: {
        applicant: {
          connectOrCreate: {
            where: { email: d.email },
            create: {
              id: d.applicantId,
              firstName: d.firstName,
              lastName: d.lastName,
              email: d.email,
              phone: d.phone ?? null,
              rightToWorkUk: d.rightToWorkUk ?? null,
              roles: {
                create: d.roles.map(name => ({
                  role: { connectOrCreate: { where: { name }, create: { name } } }
                }))
              }
            }
          }
        },
        cvKey: d.cvKey,
        cvOriginalName: d.cvOriginalName ?? null,
        source: d.source ?? 'website'
      },
      include: { applicant: { include: { roles: { include: { role: true } } } } }
    });

    res.status(201).json({ id: app.id });
  } catch (e) { next(e); }
});

// ---- List apps (admin)
r.get('/', adminAuth, async (req, res, next) => {
  try {
    const apps = await prisma.application.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        applicant: { include: { roles: { include: { role: true } } } }
      }
    });
    const shaped = apps.map(a => ({
      id: a.id,
      createdAt: a.createdAt,
      firstName: a.applicant.firstName,
      lastName: a.applicant.lastName,
      email: a.applicant.email,
      phone: a.applicant.phone ?? '',
      roles: a.applicant.roles.map(r => r.role.name),
      cvKey: a.cvKey,
      cvOriginalName: a.cvOriginalName ?? null,
      source: a.source,
      status: a.status // Prisma enum: RECEIVED/REVIEWING/SHORTLISTED/REJECTED/HIRED
    }));
    res.json(shaped);
  } catch (e) { next(e); }
});

// ---- Get CV link (admin)
r.get('/:id/cv', adminAuth, async (req, res, next) => {
  try {
    const app = await prisma.application.findUnique({ where: { id: req.params.id } });
    if (!app?.cvKey) return res.status(404).json({ error: 'No CV on file' });

    const url = await presignDownload(app.cvKey);
    res.json({ url });
  } catch (e) { next(e); }
});

// ---- Get one application (admin)
r.get('/:id', adminAuth, async (req, res, next) => {
  try {
    const app = await prisma.application.findUnique({
      where: { id: req.params.id },
      include: { applicant: { include: { roles: { include: { role: true } } } } }
    });
    if (!app) return res.status(404).end();
    res.json(app);
  } catch (e) { next(e); }
});

// ---- Update status (admin) — uses your Prisma enum values
const updateStatusBody = z.object({
  status: z.enum(['RECEIVED','REVIEWING','SHORTLISTED','REJECTED','HIRED'])
});

r.patch('/:id/status', adminAuth, async (req, res, next) => {
  try {
    const parsed = updateStatusBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', issues: parsed.error.issues });
    }
    const app = await prisma.application.update({
      where: { id: req.params.id },
      data: { status: parsed.data.status as any }
    });
    res.json({ id: app.id, status: app.status });
  } catch (e) { next(e); }
});

export default r;
