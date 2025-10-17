import { Router } from 'express';
import { z } from 'zod';
import { presignUpload, presignDownload } from '../services/s3';
import { prisma } from '../prisma';
import { randomUUID } from 'crypto';
import { adminAuth } from '../middleware/adminAuth';
import fileType from 'file-type';
import { S3Client, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import rateLimit from 'express-rate-limit';
import { env } from '../env';

const r = Router();

// ============================================
// HELPER FUNCTION FOR FILE VALIDATION
// ============================================
async function streamToBuffer(stream: Readable, maxBytes: number): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  
  for await (const chunk of stream) {
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) {
      throw new Error('File exceeds maximum size');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Store pending verification keys temporarily (in production use Redis)
const pendingVerifications = new Map<string, { timestamp: number; applicantId: string }>();

// Clean up old entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of pendingVerifications.entries()) {
    if (now - data.timestamp > 10 * 60 * 1000) { // 10 minutes
      pendingVerifications.delete(key);
    }
  }
}, 10 * 60 * 1000);

// ============================================
// RATE LIMITERS
// ============================================
const presignLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 uploads per minute per IP
  message: { error: 'Too many upload requests. Please try again in a minute.' }
});

const verifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10, // 10 verifications per minute per IP
  message: { error: 'Too many verification requests. Please try again in a minute.' }
});

// ---- Presign for CV upload
const presignBody = z.object({
  fileName: z.string().min(3).max(255),
  fileType: z.string().min(3).max(100)
});

r.post('/presign', presignLimiter, async (req, res, next) => {
  try {
    const { fileName, fileType } = presignBody.parse(req.body);
    const ext = fileName.split('.').pop()?.toLowerCase() || 'pdf';

    // extension whitelist
    if (!/(pdf|doc|docx)$/.test(ext)) {
      return res.status(400).json({ error: 'Only PDF/DOC/DOCX allowed' });
    }

    const applicantId = randomUUID();
    const now = new Date();
    const key = `cv/${now.getFullYear()}/${now.getMonth() + 1}/${applicantId}/${randomUUID()}.${ext}`;
    const { url } = await presignUpload(key, fileType);

    // Store this key as pending verification (attestation)
    pendingVerifications.set(key, { timestamp: Date.now(), applicantId });

    res.json({ url, key, applicantId });
  } catch (e) { next(e); }
});

// ============================================
// VERIFY UPLOADED FILE (with attestation check)
// ============================================
const verifyBody = z.object({
  key: z.string().min(1).max(500)
});

r.post('/verify-upload', verifyLimiter, async (req, res, next) => {
  try {
    const { key } = verifyBody.parse(req.body);
    
    // 1. Check if this key was issued by us recently (attestation)
    const pendingData = pendingVerifications.get(key);
    if (!pendingData) {
      return res.status(403).json({ 
        error: 'Invalid or expired verification request' 
      });
    }

    // 2. Validate key prefix (must start with cv/)
    if (!key.startsWith('cv/')) {
      pendingVerifications.delete(key);
      return res.status(400).json({ error: 'Invalid key format' });
    }

    const s3 = new S3Client({ region: env.s3Region });
    const maxSize = 10 * 1024 * 1024; // 10MB

    // 3. Check file size BEFORE downloading (using HEAD request)
    try {
      const headCmd = new HeadObjectCommand({ 
        Bucket: env.s3Bucket, 
        Key: key 
      });
      const headResponse = await s3.send(headCmd);
      
      if (!headResponse.ContentLength || headResponse.ContentLength > maxSize) {
        // Delete oversized file
        await s3.send(new DeleteObjectCommand({ 
          Bucket: env.s3Bucket, 
          Key: key 
        }));
        pendingVerifications.delete(key);
        return res.status(400).json({ 
          error: 'File too large. Maximum size is 10MB.' 
        });
      }
    } catch (headError: any) {
      pendingVerifications.delete(key);
      if (headError.name === 'NotFound') {
        return res.status(404).json({ error: 'File not found' });
      }
      throw headError;
    }

    // 4. Download only first 4KB for file type detection (not entire file!)
    const getCmd = new GetObjectCommand({ 
      Bucket: env.s3Bucket, 
      Key: key,
      Range: 'bytes=0-4095' // Only first 4KB
    });
    
    const response = await s3.send(getCmd);
    
    if (!response.Body) {
      pendingVerifications.delete(key);
      return res.status(400).json({ error: 'File not found' });
    }

    // Convert stream to buffer (max 4KB)
    const buffer = await streamToBuffer(response.Body as Readable, 4096);
    
    // 5. Check actual file type from buffer
    const type = await fileType.fromBuffer(buffer);
      
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword', // .doc
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // .docx
    ];
    
    if (!type || !allowedMimeTypes.includes(type.mime)) {
      // Delete the invalid file from S3
      const deleteCmd = new DeleteObjectCommand({ 
        Bucket: env.s3Bucket, 
        Key: key 
      });
      await s3.send(deleteCmd);
      pendingVerifications.delete(key);
      
      return res.status(400).json({ 
        error: 'Invalid file type. Only PDF and Word documents are allowed.' 
      });
    }
    
    // Success - remove from pending and allow application creation
    pendingVerifications.delete(key);
    res.json({ ok: true, fileType: type.mime });
  } catch (error) {
    console.error('File verification error:', error);
    next(error);
  }
});

// ---- Create application
const createBody = z.object({
  applicantId: z.string().uuid(),
  firstName: z.string().min(1).max(100).trim(),
  lastName: z.string().min(1).max(100).trim(),
  email: z.string().email().max(255).toLowerCase(),
  phone: z.string().max(20).optional(),
  rightToWorkUk: z.boolean().optional(),
  roles: z.array(z.string().max(50)).min(1).max(10),
  cvKey: z.string().min(1).max(500),
  cvOriginalName: z.string().max(255).optional(),
  source: z.string().max(100).optional()
});

r.post('/', async (req, res, next) => {
  try {
    const d = createBody.parse(req.body);

    // Ensure cvKey has valid prefix
    if (!d.cvKey.startsWith('cv/')) {
      return res.status(400).json({ error: 'Invalid CV key' });
    }

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
              rightToWorkUk: d.rightToWorkUk ?? null
            }
          }
        },
        cvKey: d.cvKey,
        cvOriginalName: d.cvOriginalName ?? null,
        source: d.source ?? 'website',
        // NEW: Create roles for THIS application
        roles: {
          create: d.roles.map(roleName => ({
            role: {
              connectOrCreate: {
                where: { name: roleName },
                create: { name: roleName }
              }
            }
          }))
        }
      },
      include: {
        applicant: true,
        roles: {
          include: {
            role: true
          }
        }
      }
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
        applicant: true,
        roles: {
          include: {
            role: true
          }
        }
      }
    });
    
    const shaped = apps.map(a => ({
      id: a.id,
      createdAt: a.createdAt,
      firstName: a.applicant.firstName,
      lastName: a.applicant.lastName,
      email: a.applicant.email,
      phone: a.applicant.phone ?? '',
      roles: a.roles.map(r => r.role.name),
      cvKey: a.cvKey,
      cvOriginalName: a.cvOriginalName ?? null,
      source: a.source,
      status: a.status
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
      include: {
        applicant: true,
        roles: {
          include: {
            role: true
          }
        }
      }
    });
    if (!app) return res.status(404).end();
    res.json(app);
  } catch (e) { next(e); }
});

// ---- Update status (admin)
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