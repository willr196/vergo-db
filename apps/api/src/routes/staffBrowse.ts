import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';

const r = Router();

const optionalTrimmedString = (max: number) =>
  z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed === '' ? undefined : trimmed;
    },
    z.string().max(max).optional()
  );

const browseQuerySchema = z.object({
  tier: z.enum(['STANDARD', 'GOLD']).optional(),
  role: optionalTrimmedString(100),
  search: optionalTrimmedString(100),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const publicApplicantSelect = {
  id: true,
  firstName: true,
  lastName: true,
  staffTier: true,
  hourlyRate: true,
  bio: true,
  yearsExperience: true,
  averageRating: true,
  totalBookings: true,
  preferredJobTypes: true,
  applications: {
    orderBy: { createdAt: 'desc' as const },
    select: {
      roles: {
        select: {
          role: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  },
} as const;

const roleAliases: Record<string, string[]> = {
  bartender: ['Bartender', 'Bartenders', 'Bar Staff'],
  'bar staff': ['Bar Staff', 'Bartender', 'Bartenders'],
  waiter: ['Waiter', 'Waiters', 'Waitress', 'Front of House'],
  waiters: ['Waiter', 'Waiters', 'Waitress', 'Front of House'],
  foh: ['FOH', 'Front of House'],
  'front of house': ['Front of House', 'FOH'],
  chef: ['Chef', 'Chefs', 'Cook'],
  chefs: ['Chef', 'Chefs', 'Cook'],
  'kitchen porter': ['Kitchen Porter', 'Kitchen Porters', 'KP'],
  'kitchen porters': ['Kitchen Porter', 'Kitchen Porters', 'KP'],
  runner: ['Runner', 'Runners'],
  runners: ['Runner', 'Runners'],
  supervisor: ['Supervisor', 'Supervisors', 'Event Supervisor'],
  supervisors: ['Supervisor', 'Supervisors', 'Event Supervisor'],
};

function splitCommaSeparated(value: string | null | undefined) {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toNumber(value: Prisma.Decimal | null | undefined) {
  return value == null ? null : Number(value);
}

function normalizeBio(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized || null;
}

function truncateText(value: string | null | undefined, maxLength: number) {
  const normalized = normalizeBio(value);
  if (!normalized) return null;
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, maxLength).trimEnd();
}

function expandRoleMatches(value: string) {
  const normalized = value.trim().toLowerCase();
  const aliases = roleAliases[normalized] ?? [];
  return Array.from(new Set([value, ...aliases]));
}

function getRoleNames(
  applications: Array<{
    roles: Array<{ role: { name: string } }>;
  }>
) {
  const seen = new Set<string>();
  const roles: string[] = [];

  for (const application of applications) {
    for (const role of application.roles) {
      const name = role.role.name?.trim();
      if (!name) continue;

      const key = name.toLowerCase();
      if (seen.has(key)) continue;

      seen.add(key);
      roles.push(name);
    }
  }

  return roles;
}

function shapeApplicant(
  applicant: Prisma.ApplicantGetPayload<{ select: typeof publicApplicantSelect }>,
  opts?: { fullBio?: boolean }
) {
  const roles = getRoleNames(applicant.applications);

  return {
    id: applicant.id,
    firstName: applicant.firstName,
    lastInitial: applicant.lastName.charAt(0).toUpperCase() || '',
    staffTier: applicant.staffTier === 'GOLD' ? 'GOLD' : 'STANDARD',
    bio: opts?.fullBio ? normalizeBio(applicant.bio) : truncateText(applicant.bio, 150),
    roles,
    yearsExperience: applicant.yearsExperience ?? null,
    hourlyRate: applicant.staffTier === 'STANDARD' ? toNumber(applicant.hourlyRate) : null,
    averageRating: toNumber(applicant.averageRating),
    totalBookings: applicant.totalBookings ?? 0,
    preferredJobTypes: splitCommaSeparated(applicant.preferredJobTypes),
  };
}

// GET /api/v1/staff/browse
r.get('/browse', async (req, res, next) => {
  try {
    const query = browseQuerySchema.parse(req.query);
    const skip = (query.page - 1) * query.limit;

    const where: Prisma.ApplicantWhereInput = {
      profileVisible: true,
    };

    if (query.tier) {
      where.staffTier = query.tier;
    }

    if (query.role) {
      const roleMatches = expandRoleMatches(query.role);

      where.applications = {
        some: {
          roles: {
            some: {
              OR: roleMatches.map((roleMatch) => ({
                role: {
                  name: {
                    contains: roleMatch,
                    mode: 'insensitive',
                  },
                },
              })),
            },
          },
        },
      };
    }

    if (query.search) {
      where.OR = [
        {
          firstName: {
            contains: query.search,
            mode: 'insensitive',
          },
        },
        {
          bio: {
            contains: query.search,
            mode: 'insensitive',
          },
        },
      ];
    }

    const [staff, total] = await Promise.all([
      prisma.applicant.findMany({
        where,
        orderBy: [
          { staffTier: 'asc' },
          { totalBookings: 'desc' },
          { averageRating: 'desc' },
          { createdAt: 'desc' },
        ],
        skip,
        take: query.limit,
        select: publicApplicantSelect,
      }),
      prisma.applicant.count({ where }),
    ]);

    const payload = {
      staff: staff.map((applicant) => shapeApplicant(applicant)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
        hasMore: skip + staff.length < total,
      },
    };

    res.json({ ok: true, data: payload });
  } catch (e) {
    next(e);
  }
});

// GET /api/v1/staff/browse/:id
r.get('/browse/:id', async (req, res, next) => {
  try {
    const applicant = await prisma.applicant.findFirst({
      where: {
        id: req.params.id,
        profileVisible: true,
      },
      select: publicApplicantSelect,
    });

    if (!applicant) {
      return res.status(404).json({ ok: false, error: 'Staff member not found' });
    }

    res.json({
      ok: true,
      data: shapeApplicant(applicant, { fullBio: true }),
    });
  } catch (e) {
    next(e);
  }
});

export default r;
