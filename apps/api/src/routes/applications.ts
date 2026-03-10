import { Router } from 'express';
import { z } from 'zod';
import { presignUpload, presignDownload, getS3Client, requireS3Config } from '../services/s3';
import { prisma } from '../prisma';
import { randomUUID } from 'crypto';
import { adminAuth } from '../middleware/adminAuth';
import { GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import rateLimit from 'express-rate-limit';
import { env } from '../env';
import { sendApplicationNotificationEmail, sendApplicationConfirmationToApplicant } from '../services/email';
import { authLogger } from '../services/logger';

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

let fileTypeFromBufferFn: ((buffer: Buffer) => Promise<{ mime: string } | undefined>) | null = null;

async function getFileType(buffer: Buffer) {
  if (!fileTypeFromBufferFn) {
    const mod = await import('file-type');
    const modAny = mod as {
      fileTypeFromBuffer?: (buffer: Buffer) => Promise<{ mime: string } | undefined>;
      fromBuffer?: (buffer: Buffer) => Promise<{ mime: string } | undefined>;
    };
    fileTypeFromBufferFn = modAny.fileTypeFromBuffer ?? modAny.fromBuffer ?? null;
    if (!fileTypeFromBufferFn) {
      throw new Error('file-type: missing buffer detection function');
    }
  }
  const fn = fileTypeFromBufferFn;
  if (!fn) {
    throw new Error('file-type: buffer detection not initialized');
  }
  return fn(buffer);
}

const stripHtml = (value: string) => value.replace(/<[^>]*>/g, '');

const optionalString = (max: number) =>
  z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed === '' ? undefined : trimmed;
    },
    z.string().max(max).optional()
  );

const optionalSanitizedString = (max: number) =>
  z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value;
      const sanitized = stripHtml(value).trim();
      return sanitized === '' ? undefined : sanitized;
    },
    z.string().max(max).optional()
  );

const optionalDateString = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  },
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
);

const preferredJobTypeValues = [
  'Corporate Events',
  'Film & TV',
  'Music & Festivals',
  'Private Events',
  'Hospitality/Venues',
  'Weddings'
] as const;

const preferredJobTypeSchema = z.enum(preferredJobTypeValues);

function parseDateOnlyToUtc(dateValue: string) {
  return new Date(`${dateValue}T00:00:00.000Z`);
}

function splitCommaSeparated(value: string | null | undefined) {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

// ============================================
// CLEANUP JOB - Delete expired verifications every 15 minutes
// ============================================
const cleanupInterval = setInterval(async () => {
  try {
    const result = await prisma.fileUploadVerification.deleteMany({
      where: {
        expiresAt: {
          lt: new Date()
        }
      }
    });
    if (result.count > 0) {
      console.log(`[CLEANUP] Deleted ${result.count} expired verification(s)`);
    }
  } catch (error) {
    console.error('[CLEANUP] Failed to delete expired verifications:', error);
  }
}, 15 * 60 * 1000);
// Allow the process to exit naturally (important for tests/one-off scripts).
cleanupInterval.unref?.();

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

// ============================================
// PRESIGN FOR CV UPLOAD
// ============================================
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

    // ✅ Store in database instead of Map
    await prisma.fileUploadVerification.create({
      data: {
        key,
        applicantId,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      }
    });

    const payload = { url, key, applicantId };
    res.json({ ok: true, ...payload, data: payload });
  } catch (e) { next(e); }
});

// ============================================
// VERIFY UPLOADED FILE (with database attestation check)
// ============================================
const verifyBody = z.object({
  key: z.string().min(1).max(500)
});

r.post('/verify-upload', verifyLimiter, async (req, res, next) => {
  try {
    const { key } = verifyBody.parse(req.body);
    
    // 1. Check database for this key (replaces Map check)
    const verification = await prisma.fileUploadVerification.findUnique({
      where: { key }
    });
    
    if (!verification) {
      return res.status(403).json({ 
        error: 'Invalid or expired verification request' 
      });
    }

    // Check if expired
    if (verification.expiresAt < new Date()) {
      return res.status(403).json({ 
        error: 'Verification expired. Please upload again.' 
      });
    }

    // Check if already verified
    if (verification.verified) {
      return res.status(400).json({ 
        error: 'This file has already been verified' 
      });
    }

    // 2. Validate key prefix
    if (!key.startsWith('cv/')) {
      return res.status(400).json({ error: 'Invalid key format' });
    }

    requireS3Config();
    const s3 = getS3Client();
    const bucket = env.s3Bucket;
    const maxSize = 10 * 1024 * 1024; // 10MB

    // 3. Check file size BEFORE downloading (using HEAD request)
    try {
      const headCmd = new HeadObjectCommand({ 
        Bucket: bucket,
        Key: key 
      });
      const headResponse = await s3.send(headCmd);
      
      if (!headResponse.ContentLength || headResponse.ContentLength > maxSize) {
        // Delete oversized file
        await s3.send(new DeleteObjectCommand({ 
          Bucket: bucket,
          Key: key 
        }));
        return res.status(400).json({ 
          error: 'File too large. Maximum size is 10MB.' 
        });
      }
    } catch (headError: any) {
      if (headError.name === 'NotFound') {
        return res.status(404).json({ error: 'File not found' });
      }
      throw headError;
    }

    // 4. Download only first 4KB for file type detection (not entire file!)
    const getCmd = new GetObjectCommand({ 
      Bucket: bucket,
      Key: key,
      Range: 'bytes=0-4095' // Only first 4KB
    });
    
    const response = await s3.send(getCmd);
    
    if (!response.Body) {
      return res.status(400).json({ error: 'File not found' });
    }

    // Convert stream to buffer (max 4KB)
    const buffer = await streamToBuffer(response.Body as Readable, 4096);
    
    // 5. Check actual file type from buffer
    const type = await getFileType(buffer);
      
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword', // .doc
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // .docx
    ];
    
    if (!type || !allowedMimeTypes.includes(type.mime)) {
      // Delete the invalid file from S3
      const deleteCmd = new DeleteObjectCommand({ 
        Bucket: bucket,
        Key: key 
      });
      await s3.send(deleteCmd);
      
      return res.status(400).json({ 
        error: 'Invalid file type. Only PDF and Word documents are allowed.' 
      });
    }
    
    // ✅ Mark as verified in database
    await prisma.fileUploadVerification.update({
      where: { key },
      data: { verified: true }
    });
    
    res.json({ ok: true, fileType: type.mime, data: { fileType: type.mime } });
  } catch (error) {
    console.error('File verification error:', error);
    next(error);
  }
});

// ============================================
// CREATE APPLICATION WITH EMAIL NOTIFICATIONS
// ============================================
const roleWithExperience = z.object({
  role: z.string().min(1).max(50),
  experienceLevel: z.string().min(1).max(50)
});

const createBody = z.object({
  applicantId: z.string().uuid(),
  firstName: z.string().min(1).max(100).trim(),
  lastName: z.string().min(1).max(100).trim(),
  email: z.string().email().max(255).toLowerCase(),
  phone: optionalString(20),
  rightToWorkUk: z.boolean().optional(),
  roles: z.array(roleWithExperience).min(1).max(10),
  cvKey: z.string().min(1).max(500),
  cvOriginalName: z.string().max(255).optional(),
  cvFileSize: z.number().int().positive().max(10485760).optional(),
  cvMimeType: z.string().max(100).optional(),
  source: z.string().max(100).optional(),
  dateOfBirth: optionalDateString,
  postcode: optionalString(24),
  preferredJobTypes: z.array(preferredJobTypeSchema).max(preferredJobTypeValues.length).optional(),
  bio: optionalSanitizedString(300),
  yearsExperience: z.number().int().min(0).max(40).optional()
});

const applicationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: 'Too many application submissions. Please try again later.' }
});

r.post('/', applicationLimiter, async (req, res, next) => {
  try {
    const d = createBody.parse(req.body);

    // Ensure cvKey has valid prefix
    if (!d.cvKey.startsWith('cv/')) {
      return res.status(400).json({ error: 'Invalid CV key' });
    }

    // ✅ Verify the file was properly verified
    const verification = await prisma.fileUploadVerification.findUnique({
      where: { key: d.cvKey }
    });

    if (!verification || !verification.verified) {
      return res.status(400).json({
        error: 'CV must be verified before creating application'
      });
    }
    if (verification.applicantId !== d.applicantId) {
      // Prevent mixing a verified CV key with a different applicantId payload.
      return res.status(400).json({
        error: 'CV verification mismatch. Please upload and verify your CV again.'
      });
    }

    const applicantCreateData = {
      id: d.applicantId,
      firstName: d.firstName,
      lastName: d.lastName,
      email: d.email,
      phone: d.phone ?? null,
      rightToWorkUk: d.rightToWorkUk ?? null,
      dateOfBirth: d.dateOfBirth ? parseDateOnlyToUtc(d.dateOfBirth) : null,
      postcode: d.postcode ?? null,
      preferredJobTypes: d.preferredJobTypes && d.preferredJobTypes.length > 0
        ? d.preferredJobTypes.join(',')
        : null,
      bio: d.bio ?? null,
      yearsExperience: d.yearsExperience ?? null
    };

    const applicantUpdateData: Record<string, unknown> = {
      firstName: d.firstName,
      lastName: d.lastName
    };

    if (d.phone !== undefined) applicantUpdateData.phone = d.phone;
    if (d.rightToWorkUk !== undefined) applicantUpdateData.rightToWorkUk = d.rightToWorkUk;
    if (d.dateOfBirth !== undefined) applicantUpdateData.dateOfBirth = parseDateOnlyToUtc(d.dateOfBirth);
    if (d.postcode !== undefined) applicantUpdateData.postcode = d.postcode;
    if (d.preferredJobTypes !== undefined) {
      applicantUpdateData.preferredJobTypes = d.preferredJobTypes.length > 0
        ? d.preferredJobTypes.join(',')
        : null;
    }
    if (d.bio !== undefined) applicantUpdateData.bio = d.bio;
    if (d.yearsExperience !== undefined) applicantUpdateData.yearsExperience = d.yearsExperience;

    const applicant = await prisma.applicant.upsert({
      where: { email: d.email },
      update: applicantUpdateData,
      create: applicantCreateData
    });

    const app = await prisma.application.create({
      data: {
        applicant: {
          connect: { id: applicant.id }
        },
        cvKey: d.cvKey,
        cvOriginalName: d.cvOriginalName ?? null,
        cvFileSize: d.cvFileSize ?? null,
        cvMimeType: d.cvMimeType ?? null,
        cvUploadedAt: new Date(),
        source: d.source ?? 'website',
        roles: {
          create: d.roles.map(r => ({
            experienceLevel: r.experienceLevel,
            role: {
              connectOrCreate: {
                where: { name: r.role },
                create: { name: r.role }
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

    // Send email notifications (async, don't wait)
    // Send to admin
    const roleStrings = d.roles.map(r => `${r.role} (${r.experienceLevel})`);

    sendApplicationNotificationEmail({
      applicantName: `${d.firstName} ${d.lastName}`,
      email: d.email,
      phone: d.phone,
      roles: roleStrings,
      cvOriginalName: d.cvOriginalName,
      applicationId: app.id
    }).catch(err => {
      console.error('[EMAIL] Failed to send admin notification:', err);
    });

    // Send confirmation to applicant
    sendApplicationConfirmationToApplicant({
      to: d.email,
      name: d.firstName,
      roles: roleStrings,
      applicationId: app.id
    }).catch(err => {
      console.error('[EMAIL] Failed to send applicant confirmation:', err);
    });

    // One-time use: reduce the risk of reusing the same verified key in multiple submissions.
    prisma.fileUploadVerification.delete({ where: { key: d.cvKey } }).catch(() => {});

    console.log(`[APPLICATION] New application: ${app.id}`);
    res.status(201).json({ ok: true, id: app.id, data: { id: app.id } });
  } catch (e) { next(e); }
});

// ============================================
// LIST APPLICATIONS (ADMIN)
// ============================================
const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(50)
});

function shapeApplicationListItem(app: any) {
  return {
    id: app.id,
    applicantId: app.applicant.id,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
    firstName: app.applicant.firstName,
    lastName: app.applicant.lastName,
    email: app.applicant.email,
    phone: app.applicant.phone ?? '',
    roles: app.roles.map((role: any) => ({
      name: role.role.name,
      experienceLevel: role.experienceLevel ?? null
    })),
    cvUrl: app.cvKey,
    cvKey: app.cvKey,
    cvOriginalName: app.cvOriginalName ?? null,
    cvFileSize: app.cvFileSize ?? null,
    cvMimeType: app.cvMimeType ?? null,
    cvUploadedAt: app.cvUploadedAt ?? null,
    source: app.source,
    status: app.status
  };
}

async function shapeApplicationDetail(app: any) {
  let cvUrl: string | null = null;
  const lastUpdatedAt =
    app.applicant?.updatedAt && app.applicant.updatedAt > app.updatedAt
      ? app.applicant.updatedAt
      : app.updatedAt;

  if (app.cvKey) {
    try {
      cvUrl = await presignDownload(app.cvKey);
    } catch (error) {
      console.error(`[CV] Failed to presign download for application ${app.id}:`, error);
    }
  }

  return {
    id: app.id,
    applicantId: app.applicant.id,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
    lastUpdatedAt,
    status: app.status,
    source: app.source ?? null,
    notes: app.notes ?? '',
    cvUrl,
    cvKey: app.cvKey,
    cvOriginalName: app.cvOriginalName ?? null,
    cvFileSize: app.cvFileSize ?? null,
    cvMimeType: app.cvMimeType ?? null,
    cvUploadedAt: app.cvUploadedAt ?? null,
    roles: app.roles.map((role: any) => ({
      id: role.role.id,
      name: role.role.name,
      experienceLevel: role.experienceLevel ?? null
    })),
    applicant: {
      id: app.applicant.id,
      firstName: app.applicant.firstName,
      lastName: app.applicant.lastName,
      fullName: `${app.applicant.firstName} ${app.applicant.lastName}`.trim(),
      email: app.applicant.email,
      phone: app.applicant.phone ?? '',
      staffTier: app.applicant.staffTier ?? 'STANDARD',
      hourlyRate: app.applicant.hourlyRate?.toString() ?? null,
      bio: app.applicant.bio ?? '',
      profileVisible: Boolean(app.applicant.profileVisible),
      yearsExperience: app.applicant.yearsExperience ?? null,
      promotedToGoldAt: app.applicant.promotedToGoldAt ?? null,
      totalBookings: app.applicant.totalBookings ?? 0,
      averageRating: app.applicant.averageRating?.toString() ?? null,
      dateOfBirth: app.applicant.dateOfBirth ?? null,
      postcode: app.applicant.postcode ?? '',
      preferredJobTypes: splitCommaSeparated(app.applicant.preferredJobTypes)
    }
  };
}

r.get('/', adminAuth, async (req, res, next) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const skip = (query.page - 1) * query.limit;

    const [apps, total] = await Promise.all([
      prisma.application.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
        include: {
          applicant: true,
          roles: {
            include: {
              role: true
            }
          }
        }
      }),
      prisma.application.count()
    ]);

    const shaped = apps.map(shapeApplicationListItem);

    const payload = {
      applications: shaped,
      pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) }
    };

    res.json({ ok: true, ...payload, data: payload });
  } catch (e) { next(e); }
});

// ============================================
// GET CV LINK (ADMIN)
// ============================================
r.get('/:id/cv', adminAuth, async (req, res, next) => {
  try {
    const appId = req.params.id;
    if (!appId || appId === 'undefined' || appId === 'null') {
      return res.status(400).json({ error: 'Invalid application ID' });
    }

    const app = await prisma.application.findUnique({ where: { id: appId } });
    if (!app) {
      return res.status(404).json({ error: 'Application not found' });
    }
    if (!app.cvKey) {
      return res.status(404).json({ error: 'No CV on file for this application' });
    }

    const url = await presignDownload(app.cvKey);

    // Return as signedUrl for consistency with frontend expectations
    res.json({ ok: true, signedUrl: url, url, data: { signedUrl: url, url } });
  } catch (e) {
    console.error('[CV] Error fetching CV:', e);
    next(e);
  }
});

// ============================================
// GET ONE APPLICATION (ADMIN)
// ============================================
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
    if (!app) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const payload = await shapeApplicationDetail(app);
    res.json({ ok: true, application: payload, data: payload });
  } catch (e) { next(e); }
});

// ============================================
// UPDATE NOTES (ADMIN)
// ============================================
const notesBody = z.object({
  notes: z.string().max(2000).transform(stripHtml)
});

r.patch('/:id/notes', adminAuth, async (req, res, next) => {
  try {
    const parsed = notesBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', issues: parsed.error.issues });
    }

    const existing = await prisma.application.findUnique({
      where: { id: req.params.id },
      select: { id: true }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const app = await prisma.application.update({
      where: { id: existing.id },
      data: { notes: parsed.data.notes || null }
    });

    const adminUsername = (req.session as any)?.username || 'admin';
    authLogger.info({ action: 'application_notes_updated', admin: adminUsername, applicationId: req.params.id }, 'Admin updated application notes');

    res.json({
      ok: true,
      notes: app.notes ?? '',
      updatedAt: app.updatedAt,
      data: { notes: app.notes ?? '', updatedAt: app.updatedAt }
    });
  } catch (e) { next(e); }
});

// ============================================
// UPDATE STATUS (ADMIN)
// ============================================
const updateStatusBody = z.object({
  status: z.enum(['RECEIVED','REVIEWING','SHORTLISTED','REJECTED','HIRED'])
});

r.patch('/:id/status', adminAuth, async (req, res, next) => {
  try {
    const parsed = updateStatusBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', issues: parsed.error.issues });
    }

    const existing = await prisma.application.findUnique({
      where: { id: req.params.id },
      select: { id: true }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const app = await prisma.application.update({
      where: { id: existing.id },
      data: { status: parsed.data.status as any }
    });

    const adminUsername = (req.session as any)?.username || "admin";
    authLogger.info({ action: 'application_status_changed', admin: adminUsername, applicationId: req.params.id, status: parsed.data.status }, 'Admin changed application status');

    res.json({ ok: true, id: app.id, status: app.status, data: { id: app.id, status: app.status } });
  } catch (e) { next(e); }
});

export default r;
