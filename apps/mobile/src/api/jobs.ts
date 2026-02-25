/**
 * Jobs API Service
 * Updated to match VERGO backend format
 */

import apiClient from './client';
import { normalizeJob, type BackendJob } from './normalizers';
import type { Job, JobFilters } from '../types';

// Backend response types
interface BackendResponse<T> {
  ok: boolean;
  error?: string;
  jobs?: T[];
  job?: T;
  data?: T;
  cities?: string[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

interface PaginatedJobsResponse {
  ok: boolean;
  jobs: Job[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

// Cache for role name → id lookups
let rolesCache: { id: string; name: string }[] | null = null;

async function fetchRoleId(roleName: string): Promise<string | undefined> {
  if (!rolesCache) {
    try {
      const response = await apiClient.get<{ ok: boolean; roles: { id: string; name: string }[] }>(
        '/api/v1/mobile/jobs/meta/roles'
      );
      if (response.data.ok && response.data.roles) {
        rolesCache = response.data.roles;
      }
    } catch {
      return undefined;
    }
  }
  if (!rolesCache) return undefined;
  const normalized = roleName.toLowerCase().replace(/[\s-]+/g, '_');
  return rolesCache.find(
    (r) => r.name.toLowerCase().replace(/[\s-]+/g, '_') === normalized
  )?.id;
}

// Transform mobile Job fields to backend field names for create/update
async function toBackendJobPayload(jobData: Partial<Job>): Promise<Record<string, unknown>> {
  const payload: Record<string, unknown> = {};

  if (jobData.title !== undefined) payload.title = jobData.title;
  if (jobData.description !== undefined) payload.description = jobData.description;
  if (jobData.requirements !== undefined) payload.requirements = jobData.requirements ?? null;
  if (jobData.venue !== undefined) payload.venue = jobData.venue;
  // city / address → location
  if (jobData.city !== undefined) payload.location = jobData.city;
  else if (jobData.address !== undefined) payload.location = jobData.address;
  // date → eventDate, times → shiftStart / shiftEnd
  if (jobData.date !== undefined) payload.eventDate = jobData.date;
  if (jobData.startTime !== undefined) payload.shiftStart = jobData.startTime;
  if (jobData.endTime !== undefined) payload.shiftEnd = jobData.endTime;
  // hourlyRate → payRate, positions → staffNeeded
  if (jobData.hourlyRate !== undefined) payload.payRate = jobData.hourlyRate;
  if (jobData.positions !== undefined) payload.staffNeeded = jobData.positions;
  // role name → roleId (requires API lookup)
  if (jobData.role !== undefined) {
    const roleId = await fetchRoleId(jobData.role);
    if (roleId) payload.roleId = roleId;
  }
  // status passthrough
  if (jobData.status !== undefined) payload.status = jobData.status;

  return payload;
}

export const jobsApi = {
  /**
   * Get all jobs with optional filters
   */
  async getJobs(filters?: JobFilters, page = 1, limit = 20): Promise<PaginatedJobsResponse> {
    const params = new URLSearchParams();

    params.append('page', page.toString());
    params.append('limit', limit.toString());

    if (filters) {
      if (filters.role) params.append('role', filters.role);
      if (filters.city) params.append('city', filters.city);
      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.append('dateTo', filters.dateTo);
      if (filters.minHourlyRate) params.append('minHourlyRate', filters.minHourlyRate.toString());
      if (filters.maxHourlyRate) params.append('maxHourlyRate', filters.maxHourlyRate.toString());
      if (filters.dbsRequired !== undefined) params.append('dbsRequired', filters.dbsRequired.toString());
      if (filters.search) params.append('search', filters.search);
    }

    const response = await apiClient.get<BackendResponse<BackendJob>>(`/api/v1/mobile/jobs?${params.toString()}`);

    return {
      ok: true,
      jobs: (response.data.jobs || []).map(normalizeJob),
      pagination: response.data.pagination || {
        page,
        limit,
        total: 0,
        totalPages: 1,
        hasMore: false,
      },
    };
  },

  /**
   * Get a single job by ID (public — OPEN jobs only)
   */
  async getJob(jobId: string): Promise<Job> {
    const response = await apiClient.get<BackendResponse<BackendJob>>(`/api/v1/mobile/jobs/${jobId}`);

    if (response.data.ok && response.data.job) {
      return normalizeJob(response.data.job);
    }

    if (response.data.ok && response.data.data) {
      return normalizeJob(response.data.data);
    }

    throw new Error(response.data.error || 'Job not found');
  },

  /**
   * Get a single job owned by the authenticated client (any status)
   */
  async getClientJob(jobId: string): Promise<Job> {
    const response = await apiClient.get<BackendResponse<BackendJob>>(
      `/api/v1/client/mobile/jobs/${jobId}`
    );

    if (response.data.ok) {
      const job = response.data.job || response.data.data;
      if (job) {
        return normalizeJob(job);
      }
    }

    throw new Error(response.data.error || 'Job not found');
  },

  /**
   * Get jobs for the authenticated client company
   */
  async getClientJobs(status?: string, page = 1, limit = 20): Promise<PaginatedJobsResponse> {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    if (status) params.append('status', status);

    const response = await apiClient.get<BackendResponse<BackendJob>>(`/api/v1/client/mobile/jobs?${params.toString()}`);

    return {
      ok: true,
      jobs: (response.data.jobs || []).map(normalizeJob),
      pagination: response.data.pagination || {
        page,
        limit,
        total: 0,
        totalPages: 1,
        hasMore: false,
      },
    };
  },

  /**
   * Create a new job (client only)
   */
  async createJob(jobData: Partial<Job>): Promise<Job> {
    const payload = await toBackendJobPayload(jobData);
    if (!payload.status) payload.status = 'DRAFT';

    const response = await apiClient.post<BackendResponse<BackendJob>>(
      '/api/v1/client/mobile/jobs',
      payload
    );

    if (response.data.ok && (response.data.job || response.data.data)) {
      return normalizeJob(response.data.job || response.data.data!);
    }

    throw new Error(response.data.error || 'Failed to create job');
  },

  /**
   * Update an existing job (client only)
   */
  async updateJob(jobId: string, jobData: Partial<Job>): Promise<Job> {
    const payload = await toBackendJobPayload(jobData);

    const response = await apiClient.put<BackendResponse<BackendJob>>(
      `/api/v1/client/mobile/jobs/${jobId}`,
      payload
    );

    if (response.data.ok && (response.data.job || response.data.data)) {
      return normalizeJob(response.data.job || response.data.data!);
    }

    throw new Error(response.data.error || 'Failed to update job');
  },

  /**
   * Close a job (stop accepting applications)
   */
  async closeJob(jobId: string): Promise<Job> {
    const response = await apiClient.post<BackendResponse<BackendJob>>(
      `/api/v1/client/mobile/jobs/${jobId}/close`
    );

    if (response.data.ok && (response.data.job || response.data.data)) {
      return normalizeJob(response.data.job || response.data.data!);
    }

    throw new Error(response.data.error || 'Failed to close job');
  },

  /**
   * Fetch all available job roles from the backend
   */
  async getRoles(): Promise<{ id: string; name: string }[]> {
    if (rolesCache) return rolesCache;
    try {
      const response = await apiClient.get<{ ok: boolean; roles: { id: string; name: string }[] }>(
        '/api/v1/mobile/jobs/meta/roles'
      );
      if (response.data.ok && response.data.roles) {
        rolesCache = response.data.roles;
        return rolesCache;
      }
    } catch {
      // ignore
    }
    return [];
  },

  /**
   * Update an existing job with a direct backend payload (client only).
   * Sends roleId as-is — bypasses the name-to-id lookup in toBackendJobPayload.
   */
  async updateClientJob(
    jobId: string,
    payload: {
      title?: string;
      description?: string;
      requirements?: string;
      status?: 'DRAFT' | 'OPEN';
      location?: string;
      venue?: string;
      payRate?: number;
      payType?: 'HOURLY' | 'DAILY' | 'FIXED';
      eventDate?: string;
      eventEndDate?: string;
      shiftStart?: string;
      shiftEnd?: string;
      staffNeeded?: number;
      roleId?: string;
    }
  ): Promise<Job> {
    const response = await apiClient.put<BackendResponse<BackendJob>>(
      `/api/v1/client/mobile/jobs/${jobId}`,
      payload
    );
    if (response.data.ok && (response.data.job || response.data.data)) {
      return normalizeJob(response.data.job ?? response.data.data!);
    }
    throw new Error(response.data.error || 'Failed to update job');
  },

  /**
   * Create a job posting with a direct backend payload (client only).
   * Sends roleId as-is — bypasses the name-to-id lookup in toBackendJobPayload.
   */
  async createClientJob(payload: {
    title: string;
    description: string;
    requirements?: string;
    status?: 'DRAFT' | 'OPEN';
    location: string;
    venue?: string;
    payRate?: number;
    payType?: 'HOURLY' | 'DAILY' | 'FIXED';
    eventDate?: string;
    eventEndDate?: string;
    shiftStart?: string;
    shiftEnd?: string;
    staffNeeded: number;
    roleId: string;
  }): Promise<Job> {
    const body = { ...payload, status: payload.status ?? 'DRAFT' };
    const response = await apiClient.post<BackendResponse<BackendJob>>(
      '/api/v1/client/mobile/jobs',
      body
    );
    if (response.data.ok && (response.data.job || response.data.data)) {
      return normalizeJob(response.data.job ?? response.data.data!);
    }
    throw new Error(response.data.error || 'Failed to create job');
  },

  /**
   * Get available cities for job filter
   */
  async getCities(): Promise<string[]> {
    const response = await apiClient.get<BackendResponse<string[]>>('/api/v1/mobile/jobs/cities');

    if (response.data.ok && response.data.cities) {
      return response.data.cities;
    }

    return [];
  },

  /**
   * Get recommended jobs for user (based on profile)
   */
  async getRecommendedJobs(limit = 5): Promise<Job[]> {
    try {
      const response = await apiClient.get<BackendResponse<BackendJob>>(`/api/v1/mobile/jobs/recommended?limit=${limit}`);

      if (response.data.ok && response.data.jobs) {
        return response.data.jobs.map(normalizeJob);
      }
    } catch {
      // Recommended jobs is optional
    }

    return [];
  },

  /**
   * Save a job to favorites
   */
  async saveJob(jobId: string): Promise<void> {
    await apiClient.post(`/api/v1/mobile/jobs/${jobId}/save`);
  },

  /**
   * Remove a job from favorites
   */
  async unsaveJob(jobId: string): Promise<void> {
    await apiClient.delete(`/api/v1/mobile/jobs/${jobId}/save`);
  },

  /**
   * Get saved jobs
   */
  async getSavedJobs(): Promise<Job[]> {
    try {
      const response = await apiClient.get<BackendResponse<BackendJob>>('/api/v1/mobile/jobs/saved');

      if (response.data.ok && response.data.jobs) {
        return response.data.jobs.map(normalizeJob);
      }
    } catch {
      // Saved jobs is optional feature
    }

    return [];
  },
};

export default jobsApi;
