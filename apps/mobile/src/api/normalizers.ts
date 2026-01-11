/**
 * API normalizers
 * Coerce backend payloads into expected runtime types
 */

import type { ClientCompany, Job, JobRole, JobSeeker } from '../types';

const TRUE_STRING = 'true';
const FALSE_STRING = 'false';

function coerceBoolean(value: unknown): boolean | undefined {
  // Handle actual booleans
  if (value === true || value === false) {
    return value;
  }

  // Handle string booleans (from API or storage)
  if (typeof value === 'string') {
    const normalized = value.toLowerCase().trim();
    if (normalized === TRUE_STRING || normalized === '1') {
      return true;
    }
    if (normalized === FALSE_STRING || normalized === '0' || normalized === '') {
      return false;
    }
  }

  // Handle numbers (1 = true, 0 = false)
  if (typeof value === 'number') {
    return value !== 0;
  }

  return undefined;
}

type BackendJob = {
  id: string;
  title: string;
  description: string;
  requirements?: string | null;
  type?: string;
  status?: string;
  location: string;
  venue?: string | null;
  payRate?: number | null;
  payType?: string | null;
  eventDate?: string | null;
  shiftStart?: string | null;
  shiftEnd?: string | null;
  staffNeeded?: number | null;
  staffConfirmed?: number | null;
  companyName?: string | null;
  role?: { name: string } | null;
  applicationCount?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

function normalizeRole(value?: string | null): JobRole {
  if (!value) return 'other';
  const normalized = value.toLowerCase().replace(/[\s-]+/g, '_');
  const allowed: Record<JobRole, true> = {
    bartender: true,
    server: true,
    chef: true,
    sous_chef: true,
    kitchen_porter: true,
    event_manager: true,
    event_coordinator: true,
    front_of_house: true,
    back_of_house: true,
    runner: true,
    barista: true,
    sommelier: true,
    mixologist: true,
    catering_assistant: true,
    other: true,
  };

  return (allowed as Record<string, true>)[normalized] ? (normalized as JobRole) : 'other';
}

function parseTimeToMinutes(time?: string | null): number | null {
  if (!time) return null;
  const [hours, minutes] = time.split(':').map((part) => Number(part));
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function computeTotalHours(start?: string | null, end?: string | null): number | null {
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);
  if (startMinutes === null || endMinutes === null) return null;
  if (endMinutes >= startMinutes) return (endMinutes - startMinutes) / 60;
  return (24 * 60 - startMinutes + endMinutes) / 60;
}

function mapStatus(status?: string | null): Job['status'] {
  switch ((status || '').toUpperCase()) {
    case 'OPEN':
      return 'published';
    case 'FILLED':
      return 'filled';
    case 'CLOSED':
      return 'closed';
    case 'DRAFT':
      return 'draft';
    default:
      return 'published';
  }
}

export function normalizeJob(job: BackendJob): Job {
  const totalHours = computeTotalHours(job.shiftStart, job.shiftEnd) || 0;
  const payRate = job.payRate ?? 0;
  const estimatedPay = totalHours > 0 ? payRate * totalHours : payRate;
  const staffNeeded = job.staffNeeded ?? 0;
  const staffConfirmed = job.staffConfirmed ?? 0;

  return {
    id: job.id,
    clientCompanyId: job.companyName ? job.companyName : '',
    clientCompany: job.companyName
      ? {
          id: '',
          email: '',
          companyName: job.companyName,
          contactFirstName: '',
          contactLastName: '',
          isApproved: true,
          createdAt: job.createdAt || new Date().toISOString(),
          updatedAt: job.updatedAt || new Date().toISOString(),
        }
      : undefined,
    title: job.title,
    role: normalizeRole(job.role?.name ?? null),
    description: job.description,
    requirements: job.requirements ?? undefined,
    venue: job.venue || job.location,
    address: job.location,
    city: job.location,
    postcode: undefined,
    date: job.eventDate || job.createdAt || new Date().toISOString(),
    startTime: job.shiftStart || '00:00',
    endTime: job.shiftEnd || '00:00',
    breakDuration: undefined,
    hourlyRate: payRate,
    totalHours: totalHours || undefined,
    estimatedPay: estimatedPay || undefined,
    uniformRequired: false,
    uniformDetails: undefined,
    dbsRequired: false,
    experienceRequired: undefined,
    positions: staffNeeded || undefined,
    positionsAvailable: staffNeeded || 0,
    positionsFilled: staffConfirmed || 0,
    applicationCount: job.applicationCount ?? undefined,
    status: mapStatus(job.status),
    createdAt: job.createdAt || new Date().toISOString(),
    updatedAt: job.updatedAt || new Date().toISOString(),
    applicationDeadline: undefined,
  };
}

export function normalizeJobSeeker(user: Partial<JobSeeker>): JobSeeker {
  const now = new Date().toISOString();
  return {
    id: user.id || '',
    email: user.email || '',
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    phone: user.phone,
    profileImage: user.profileImage,
    createdAt: user.createdAt || now,
    updatedAt: user.updatedAt || now,
    type: 'jobseeker',
    bio: user.bio,
    dateOfBirth: user.dateOfBirth,
    address: user.address,
    city: user.city,
    postcode: user.postcode,
    availability: user.availability || 'available',
    preferredRoles: user.preferredRoles || [],
    minimumHourlyRate: user.minimumHourlyRate,
    maxTravelDistance: user.maxTravelDistance,
    hasDBSCheck: coerceBoolean(user.hasDBSCheck) ?? false,
    dbsCheckDate: user.dbsCheckDate,
    nationalInsurance: user.nationalInsurance,
    rightToWork: coerceBoolean(user.rightToWork) ?? false,
    rightToWorkDocument: user.rightToWorkDocument,
    yearsExperience: user.yearsExperience || 0,
    skills: user.skills || [],
    previousEmployers: user.previousEmployers,
    completedJobs: user.completedJobs || 0,
    rating: user.rating,
  };
}

export function normalizeClientCompany(user: Partial<ClientCompany> & { contactName?: string; status?: string }): ClientCompany {
  const now = new Date().toISOString();
  const [contactFirstName = '', contactLastName = ''] = (user.contactName || '').split(' ');
  return {
    id: user.id || '',
    email: user.email || '',
    companyName: user.companyName || '',
    contactFirstName: user.contactFirstName || contactFirstName,
    contactLastName: user.contactLastName || contactLastName,
    phone: user.phone,
    logo: user.logo,
    description: user.description,
    website: user.website,
    address: user.address,
    city: user.city,
    postcode: user.postcode,
    isApproved: coerceBoolean(user.isApproved) ?? (user.status === 'APPROVED'),
    approvedAt: user.approvedAt,
    createdAt: user.createdAt || now,
    updatedAt: user.updatedAt || now,
  };
}

export function normalizeStoredUser(user: JobSeeker | ClientCompany): JobSeeker | ClientCompany {
  // Ensure boolean fields are actually booleans, not strings
  // This handles cases where old persisted data may have string booleans
  const sanitized = { ...user };

  if (user.type === 'jobseeker') {
    const jobSeeker = sanitized as JobSeeker;
    return normalizeJobSeeker({
      ...jobSeeker,
      hasDBSCheck: coerceBoolean(jobSeeker.hasDBSCheck) ?? false,
      rightToWork: coerceBoolean(jobSeeker.rightToWork) ?? false,
    });
  }

  const client = sanitized as ClientCompany;
  return normalizeClientCompany({
    ...client,
    isApproved: coerceBoolean(client.isApproved) ?? false,
  });
}
