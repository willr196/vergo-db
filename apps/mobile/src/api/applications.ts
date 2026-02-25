/**
 * Applications API Service
 * Updated to match VERGO backend format
 */

import apiClient from './client';
import { normalizeApplicationStatus, normalizeJob, toBackendApplicationStatus } from './normalizers';
import type { Application, ApplicationStatus, Job } from '../types';

type BackendApplication = Omit<Application, 'status' | 'job'> & {
  status?: unknown;
  job?: Parameters<typeof normalizeJob>[0];
};

// Backend response types
interface BackendResponse<T> {
  ok: boolean;
  error?: string;
  application?: T;
  applications?: T[];
  data?: T;
  hasApplied?: boolean;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

interface PaginatedApplicationsResponse {
  ok: boolean;
  applications: Application[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export const applicationsApi = {
  /**
   * Normalize application payloads
   */
  normalizeApplication(application: Application | BackendApplication): Application {
    const normalizedJob: Job | undefined = (() => {
      if (!application.job) return undefined;
      if ('clientCompanyId' in application.job) {
        return application.job;
      }
      return normalizeJob(application.job);
    })();

    return {
      ...application,
      status: normalizeApplicationStatus(application.status),
      job: normalizedJob,
    };
  },

  /**
   * Apply to a job
   */
  async applyToJob(jobId: string, coverNote?: string): Promise<Application> {
    const response = await apiClient.post<BackendResponse<BackendApplication>>('/api/v1/mobile/job-applications', {
      jobId,
      coverNote,
    });
    
    if (response.data.ok && (response.data.application || response.data.data)) {
      return applicationsApi.normalizeApplication(
        response.data.application || response.data.data!
      );
    }
    
    throw new Error(response.data.error || 'Failed to submit application');
  },

  /**
   * Get all applications for current user (job seeker)
   */
  async getUserApplications(
    status?: ApplicationStatus,
    page = 1,
    limit = 20
  ): Promise<PaginatedApplicationsResponse> {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    if (status) params.append('status', toBackendApplicationStatus(status));
    
    const response = await apiClient.get<PaginatedApplicationsResponse>(
      `/api/v1/mobile/job-applications/mine?${params.toString()}`
    );
    
    // Handle response format
    if (response.data.ok !== undefined) {
      return {
        ...response.data,
        applications: (response.data.applications || []).map(
          applicationsApi.normalizeApplication
        ),
      };
    }
    
    // Fallback
    return {
      ok: true,
      applications: [],
      pagination: { page, limit, total: 0, totalPages: 1, hasMore: false },
    };
  },

  /**
   * Get a single application by ID
   */
  async getApplication(applicationId: string): Promise<Application> {
    const response = await apiClient.get<BackendResponse<BackendApplication>>(
      `/api/v1/mobile/job-applications/${applicationId}`
    );
    
    if (response.data.ok && (response.data.application || response.data.data)) {
      return applicationsApi.normalizeApplication(
        response.data.application || response.data.data!
      );
    }
    
    throw new Error(response.data.error || 'Application not found');
  },

  /**
   * Withdraw an application
   */
  async withdrawApplication(applicationId: string): Promise<Application> {
    const response = await apiClient.post<BackendResponse<BackendApplication>>(
      `/api/v1/mobile/job-applications/${applicationId}/withdraw`
    );
    
    if (response.data.ok && (response.data.application || response.data.data)) {
      return applicationsApi.normalizeApplication(
        response.data.application || response.data.data!
      );
    }
    
    throw new Error(response.data.error || 'Failed to withdraw application');
  },

  /**
   * Check if user has already applied to a job
   */
  async hasApplied(jobId: string): Promise<boolean> {
    try {
      const response = await apiClient.get<BackendResponse<{ hasApplied: boolean }> & { applied?: boolean }>(
        `/api/v1/mobile/job-applications/check/${jobId}`
      );

      return response.data.applied ?? response.data.hasApplied ?? false;
    } catch {
      return false;
    }
  },

  // ============================================
  // Client-side application management
  // ============================================

  /**
   * Get a single application by ID (client only — verifies job ownership server-side)
   */
  async getClientApplication(applicationId: string): Promise<Application> {
    const response = await apiClient.get<BackendResponse<BackendApplication>>(
      `/api/v1/client/mobile/applications/${applicationId}`
    );

    if (response.data.ok && (response.data.application || response.data.data)) {
      return applicationsApi.normalizeApplication(
        response.data.application || response.data.data!
      );
    }

    throw new Error(response.data.error || 'Application not found');
  },

  /**
   * Get all applications for a job (client only)
   */
  async getJobApplications(
    jobId: string,
    status?: ApplicationStatus,
    page = 1,
    limit = 20
  ): Promise<PaginatedApplicationsResponse> {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    if (status) params.append('status', toBackendApplicationStatus(status));

    const response = await apiClient.get<PaginatedApplicationsResponse>(
      `/api/v1/client/mobile/jobs/${jobId}/applications?${params.toString()}`
    );

    if (response.data.ok !== undefined) {
      return {
        ...response.data,
        applications: (response.data.applications || []).map(
          applicationsApi.normalizeApplication
        ),
      };
    }

    return {
      ok: true,
      applications: [],
      pagination: { page, limit, total: 0, totalPages: 1, hasMore: false },
    };
  },

  /**
   * Update application status (client only)
   * Requires jobId to route through the client mobile endpoint
   */
  async updateApplicationStatus(
    applicationId: string,
    status: ApplicationStatus,
    notes?: string,
    rejectionReason?: string,
    jobId?: string
  ): Promise<Application> {
    // Use the client mobile route when jobId is provided
    const url = jobId
      ? `/api/v1/client/mobile/jobs/${jobId}/applications/${applicationId}/status`
      : `/api/v1/client/mobile/jobs/_/applications/${applicationId}/status`;

    const response = await apiClient.put<BackendResponse<BackendApplication>>(
      url,
      {
        status: toBackendApplicationStatus(status),
        adminNotes: notes,
      }
    );

    if (response.data.ok && (response.data.application || response.data.data)) {
      return applicationsApi.normalizeApplication(
        response.data.application || response.data.data!
      );
    }

    throw new Error(response.data.error || 'Failed to update application');
  },

  /**
   * Shortlist an applicant
   */
  async shortlistApplicant(applicationId: string, jobId: string, notes?: string): Promise<Application> {
    return this.updateApplicationStatus(applicationId, 'shortlisted', notes, undefined, jobId);
  },

  /**
   * Hire an applicant
   */
  async hireApplicant(applicationId: string, jobId: string, notes?: string): Promise<Application> {
    return this.updateApplicationStatus(applicationId, 'hired', notes, undefined, jobId);
  },

  /**
   * Reject an applicant
   */
  async rejectApplicant(
    applicationId: string,
    jobId: string,
    rejectionReason?: string,
    notes?: string
  ): Promise<Application> {
    return this.updateApplicationStatus(applicationId, 'rejected', notes, rejectionReason, jobId);
  },

  /**
   * Get application statistics for a client
   */
  async getClientStats(): Promise<{
    totalApplications: number;
    pendingReview: number;
    shortlisted: number;
    hired: number;
    activeJobs: number;
  }> {
    try {
      const response = await apiClient.get<BackendResponse<{
        totalApplications: number;
        pendingReview: number;
        shortlisted: number;
        hired: number;
        activeJobs: number;
      }>>('/api/v1/client/mobile/stats');
      
      if (response.data.ok && response.data.data) {
        return response.data.data;
      }
    } catch {
      // Stats endpoint is optional
    }
    
    return {
      totalApplications: 0,
      pendingReview: 0,
      shortlisted: 0,
      hired: 0,
      activeJobs: 0,
    };
  },
};

export default applicationsApi;
