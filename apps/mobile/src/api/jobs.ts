/**
 * Jobs API Service
 * Updated to match VERGO backend format
 */

import apiClient from './client';
import { normalizeJob } from './normalizers';
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
    
    const response = await apiClient.get<BackendResponse<Job>>(`/api/v1/mobile/jobs?${params.toString()}`);
    
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
   * Get a single job by ID
   */
  async getJob(jobId: string): Promise<Job> {
    const response = await apiClient.get<BackendResponse<Job>>(`/api/v1/mobile/jobs/${jobId}`);
    
    if (response.data.ok && response.data.job) {
      return normalizeJob(response.data.job);
    }
    
    // Try alternate response formats
    if (response.data.ok && response.data.data) {
      return normalizeJob(response.data.data);
    }
    
    throw new Error(response.data.error || 'Job not found');
  },

  /**
   * Get jobs for a specific client company
   */
  async getClientJobs(clientId: string, status?: string): Promise<Job[]> {
    const params = status ? `?status=${status}` : '';
    const response = await apiClient.get<BackendResponse<Job>>(`/api/v1/jobs/client/${clientId}${params}`);
    
    if (response.data.ok && response.data.jobs) {
      return response.data.jobs.map(normalizeJob);
    }
    
    return [];
  },

  /**
   * Create a new job (client only)
   */
  async createJob(jobData: Partial<Job>): Promise<Job> {
    const response = await apiClient.post<BackendResponse<Job>>('/api/v1/jobs', jobData);
    
    if (response.data.ok && (response.data.job || response.data.data)) {
      return normalizeJob((response.data.job || response.data.data!) as Job);
    }
    
    throw new Error(response.data.error || 'Failed to create job');
  },

  /**
   * Update an existing job (client only)
   */
  async updateJob(jobId: string, jobData: Partial<Job>): Promise<Job> {
    const response = await apiClient.put<BackendResponse<Job>>(`/api/v1/jobs/${jobId}`, jobData);
    
    if (response.data.ok && (response.data.job || response.data.data)) {
      return normalizeJob((response.data.job || response.data.data!) as Job);
    }
    
    throw new Error(response.data.error || 'Failed to update job');
  },

  /**
   * Close a job (stop accepting applications)
   */
  async closeJob(jobId: string): Promise<Job> {
    const response = await apiClient.put<BackendResponse<Job>>(`/api/v1/jobs/${jobId}/close`);
    
    if (response.data.ok && (response.data.job || response.data.data)) {
      return normalizeJob((response.data.job || response.data.data!) as Job);
    }
    
    throw new Error(response.data.error || 'Failed to close job');
  },

  /**
   * Get available cities for job filter
   */
  async getCities(): Promise<string[]> {
    const response = await apiClient.get<BackendResponse<string[]>>('/api/v1/jobs/cities');
    
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
      const response = await apiClient.get<BackendResponse<Job>>(`/api/v1/jobs/recommended?limit=${limit}`);
      
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
    await apiClient.post(`/api/v1/jobs/${jobId}/save`);
  },

  /**
   * Remove a job from favorites
   */
  async unsaveJob(jobId: string): Promise<void> {
    await apiClient.delete(`/api/v1/jobs/${jobId}/save`);
  },

  /**
   * Get saved jobs
   */
  async getSavedJobs(): Promise<Job[]> {
    try {
      const response = await apiClient.get<BackendResponse<Job>>('/api/v1/jobs/saved');

      if (response.data.ok && response.data.jobs) {
        return response.data.jobs.map(normalizeJob);
      }
    } catch (error) {
      // Log for debugging - saved jobs is optional but we want visibility
      console.warn('[Jobs] getSavedJobs failed:', error instanceof Error ? error.message : 'Unknown error');
    }

    return [];
  },
};

export default jobsApi;
