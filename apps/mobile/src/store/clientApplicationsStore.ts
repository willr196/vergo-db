/**
 * Client Applications Store
 * Manages applicants for client-owned jobs (keyed by jobId).
 * Mirrors useApplicationsStore but for the client view.
 */

import { create } from 'zustand';
import { applicationsApi } from '../api';
import { saveCache, loadCache, CACHE_KEYS } from '../utils/network';
import { useNetworkStore } from './networkStore';
import type { Application, ApplicationStatus } from '../types';

export type ClientApplicationStatusFilter = ApplicationStatus | 'all';

export type ClientApplicationAction = 'shortlist' | 'hire' | 'reject' | 'review';

const ACTION_TO_STATUS: Record<ClientApplicationAction, ApplicationStatus> = {
  shortlist: 'shortlisted',
  hire: 'hired',
  reject: 'rejected',
  review: 'reviewing',
};

function cacheKeyForJob(jobId: string): string {
  return `${CACHE_KEYS.CLIENT_APPLICATIONS}:${jobId}`;
}

interface ClientApplicationsState {
  // State
  applicationsByJobId: Record<string, Application[]>;
  selectedApplication: Application | null;
  isLoading: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  error: string | null;

  // Pagination — reflects the most-recently-fetched job
  currentPage: number;
  totalPages: number;
  hasMore: boolean;
  currentJobId: string | null;

  // Filter
  statusFilter: ClientApplicationStatusFilter;

  // Actions
  fetchJobApplications: (jobId: string, refresh?: boolean) => Promise<void>;
  fetchMoreJobApplications: (jobId: string) => Promise<void>;
  fetchApplication: (applicationId: string) => Promise<Application>;
  updateApplicationStatus: (
    applicationId: string,
    action: ClientApplicationAction
  ) => Promise<Application>;
  setStatusFilter: (filter: ClientApplicationStatusFilter) => void;
  clearSelectedApplication: () => void;
  clearError: () => void;
}

// Find the jobId an application currently lives under (used so callers don't
// have to thread jobId through update calls).
function findJobIdForApplication(
  byJobId: Record<string, Application[]>,
  applicationId: string,
  fallback: string | null
): string | null {
  for (const [jobId, apps] of Object.entries(byJobId)) {
    if (apps.some((a) => a.id === applicationId)) return jobId;
  }
  return fallback;
}

export const useClientApplicationsStore = create<ClientApplicationsState>((set, get) => ({
  // Initial state
  applicationsByJobId: {},
  selectedApplication: null,
  isLoading: false,
  isRefreshing: false,
  isLoadingMore: false,
  error: null,

  currentPage: 1,
  totalPages: 1,
  hasMore: false,
  currentJobId: null,

  statusFilter: 'all',

  // Actions
  fetchJobApplications: async (jobId, refresh = false) => {
    const { statusFilter } = get();
    const { isConnected } = useNetworkStore.getState();

    set({
      isLoading: !refresh,
      isRefreshing: refresh,
      isLoadingMore: false,
      error: null,
      currentJobId: jobId,
    });

    // Offline — serve cached data immediately
    if (!isConnected) {
      const cached = await loadCache<Application[]>(cacheKeyForJob(jobId));
      set((state) => ({
        applicationsByJobId: { ...state.applicationsByJobId, [jobId]: cached || [] },
        isLoading: false,
        isRefreshing: false,
        isLoadingMore: false,
      }));
      return;
    }

    try {
      const apiStatus = statusFilter === 'all' ? undefined : statusFilter;
      const response = await applicationsApi.getJobApplications(jobId, apiStatus, 1);
      const applications = response.applications || [];

      // Persist to cache (only when no status filter applied)
      if (statusFilter === 'all') {
        await saveCache(cacheKeyForJob(jobId), applications);
      }

      set((state) => ({
        applicationsByJobId: { ...state.applicationsByJobId, [jobId]: applications },
        isLoading: false,
        isRefreshing: false,
        isLoadingMore: false,
        currentPage: response.pagination?.page || 1,
        totalPages: response.pagination?.totalPages || 1,
        hasMore: response.pagination?.hasMore || false,
      }));
    } catch (error) {
      // Network error — try cache fallback
      const cached = await loadCache<Application[]>(cacheKeyForJob(jobId));
      if (cached) {
        set((state) => ({
          applicationsByJobId: { ...state.applicationsByJobId, [jobId]: cached },
          isLoading: false,
          isRefreshing: false,
          isLoadingMore: false,
        }));
      } else {
        const message = error instanceof Error ? error.message : 'Failed to fetch applications';
        set({ isLoading: false, isRefreshing: false, isLoadingMore: false, error: message });
      }
    }
  },

  fetchMoreJobApplications: async (jobId) => {
    const { currentPage, hasMore, statusFilter, applicationsByJobId, isLoading, isRefreshing, isLoadingMore } = get();

    if (!hasMore || isLoading || isRefreshing || isLoadingMore) return;

    set({ isLoadingMore: true });

    try {
      const apiStatus = statusFilter === 'all' ? undefined : statusFilter;
      const response = await applicationsApi.getJobApplications(jobId, apiStatus, currentPage + 1);
      const existing = applicationsByJobId[jobId] || [];

      set((state) => ({
        applicationsByJobId: {
          ...state.applicationsByJobId,
          [jobId]: [...existing, ...(response.applications || [])],
        },
        isLoading: false,
        isLoadingMore: false,
        currentPage: response.pagination?.page || currentPage + 1,
        totalPages: response.pagination?.totalPages || 1,
        hasMore: response.pagination?.hasMore || false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch more applications';
      set({ isLoading: false, isLoadingMore: false, error: message });
    }
  },

  fetchApplication: async (applicationId) => {
    set({ isLoading: true, error: null });

    try {
      const application = await applicationsApi.getClientApplication(applicationId);
      set({ selectedApplication: application, isLoading: false });
      return application;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch application';
      set({ isLoading: false, isRefreshing: false, isLoadingMore: false, error: message });
      throw error;
    }
  },

  updateApplicationStatus: async (applicationId, action) => {
    const { applicationsByJobId, selectedApplication } = get();
    const jobId = findJobIdForApplication(
      applicationsByJobId,
      applicationId,
      selectedApplication?.id === applicationId ? selectedApplication.jobId : null
    );

    if (!jobId) {
      const message = 'Cannot update applicant without a known job context';
      set({ error: message });
      throw new Error(message);
    }

    try {
      let updated: Application;
      if (action === 'shortlist') {
        updated = await applicationsApi.shortlistApplicant(applicationId, jobId);
      } else if (action === 'hire') {
        updated = await applicationsApi.hireApplicant(applicationId, jobId);
      } else if (action === 'reject') {
        updated = await applicationsApi.rejectApplicant(applicationId, jobId);
      } else {
        updated = await applicationsApi.updateApplicationStatus(
          applicationId,
          ACTION_TO_STATUS[action],
          undefined,
          undefined,
          jobId
        );
      }

      set((state) => {
        // Replace the application in every list it appears in
        const nextByJobId: Record<string, Application[]> = {};
        for (const [key, apps] of Object.entries(state.applicationsByJobId)) {
          nextByJobId[key] = apps.map((a) => (a.id === applicationId ? updated : a));
        }
        return {
          applicationsByJobId: nextByJobId,
          selectedApplication:
            state.selectedApplication?.id === applicationId
              ? updated
              : state.selectedApplication,
        };
      });

      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update application';
      set({ error: message });
      throw error;
    }
  },

  setStatusFilter: (filter) => {
    if (get().statusFilter === filter) return;
    set({ statusFilter: filter, currentPage: 1 });
    const { currentJobId, fetchJobApplications } = get();
    if (currentJobId) {
      fetchJobApplications(currentJobId);
    }
  },

  clearSelectedApplication: () => {
    set({ selectedApplication: null });
  },

  clearError: () => {
    set({ error: null });
  },
}));

// Selectors
export const selectApplicationsForJob =
  (jobId: string) => (state: ClientApplicationsState) =>
    state.applicationsByJobId[jobId] || [];

export default useClientApplicationsStore;
