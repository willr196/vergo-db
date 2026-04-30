/**
 * Client Jobs Store
 * Manages client-owned job listings (any status) with Zustand.
 * Mirrors useJobsStore but scoped to /client/mobile/jobs endpoints.
 */

import { create } from 'zustand';
import { jobsApi } from '../api';
import { saveCache, loadCache, CACHE_KEYS } from '../utils/network';
import { useNetworkStore } from './networkStore';
import type { Job } from '../types';

export type JobStatusFilter = 'all' | 'active' | 'closed';

// Map UI filter to backend enum value
export function toApiStatus(filter: JobStatusFilter): string | undefined {
  if (filter === 'active') return 'OPEN';
  if (filter === 'closed') return 'CLOSED';
  return undefined;
}

// Payloads accepted by the underlying API surface
type CreateJobPayload = Parameters<typeof jobsApi.createClientJob>[0];
type UpdateJobPayload = Parameters<typeof jobsApi.updateClientJob>[1];

interface ClientJobsState {
  // State
  jobs: Job[];
  selectedJob: Job | null;
  isLoading: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  error: string | null;

  // Pagination
  currentPage: number;
  totalPages: number;
  hasMore: boolean;

  // Filter
  statusFilter: JobStatusFilter;

  // Actions
  fetchJobs: (refresh?: boolean) => Promise<void>;
  fetchMoreJobs: () => Promise<void>;
  fetchJob: (jobId: string) => Promise<Job>;
  setStatusFilter: (filter: JobStatusFilter) => void;
  closeJob: (jobId: string) => Promise<void>;
  updateJob: (jobId: string, payload: UpdateJobPayload) => Promise<Job>;
  createJob: (payload: CreateJobPayload) => Promise<Job>;
  clearSelectedJob: () => void;
  clearError: () => void;
}

export const useClientJobsStore = create<ClientJobsState>((set, get) => ({
  // Initial state
  jobs: [],
  selectedJob: null,
  isLoading: false,
  isRefreshing: false,
  isLoadingMore: false,
  error: null,

  currentPage: 1,
  totalPages: 1,
  hasMore: false,

  statusFilter: 'all',

  // Actions
  fetchJobs: async (refresh = false) => {
    const { statusFilter } = get();
    const { isConnected } = useNetworkStore.getState();

    set({
      isLoading: !refresh,
      isRefreshing: refresh,
      isLoadingMore: false,
      error: null,
    });

    // Offline — serve cached data immediately
    if (!isConnected) {
      const cached = await loadCache<Job[]>(CACHE_KEYS.CLIENT_JOBS);
      set({
        jobs: cached || [],
        isLoading: false,
        isRefreshing: false,
        isLoadingMore: false,
      });
      return;
    }

    try {
      const response = await jobsApi.getClientJobs(toApiStatus(statusFilter), 1);
      const jobs = response.jobs || [];

      // Persist to cache for offline use (only when no status filter applied)
      if (statusFilter === 'all') {
        await saveCache(CACHE_KEYS.CLIENT_JOBS, jobs);
      }

      set({
        jobs,
        isLoading: false,
        isRefreshing: false,
        isLoadingMore: false,
        currentPage: response.pagination?.page || 1,
        totalPages: response.pagination?.totalPages || 1,
        hasMore: response.pagination?.hasMore || false,
      });
    } catch (error) {
      // Network error — try cache fallback
      const cached = await loadCache<Job[]>(CACHE_KEYS.CLIENT_JOBS);
      if (cached) {
        set({ jobs: cached, isLoading: false, isRefreshing: false, isLoadingMore: false });
      } else {
        const message = error instanceof Error ? error.message : 'Failed to fetch jobs';
        set({ isLoading: false, isRefreshing: false, isLoadingMore: false, error: message });
      }
    }
  },

  fetchMoreJobs: async () => {
    const { currentPage, hasMore, statusFilter, jobs, isLoading, isRefreshing, isLoadingMore } = get();

    if (!hasMore || isLoading || isRefreshing || isLoadingMore) return;

    set({ isLoadingMore: true });

    try {
      const response = await jobsApi.getClientJobs(toApiStatus(statusFilter), currentPage + 1);

      set({
        jobs: [...jobs, ...(response.jobs || [])],
        isLoading: false,
        isLoadingMore: false,
        currentPage: response.pagination?.page || currentPage + 1,
        totalPages: response.pagination?.totalPages || 1,
        hasMore: response.pagination?.hasMore || false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch more jobs';
      set({ isLoading: false, isLoadingMore: false, error: message });
    }
  },

  fetchJob: async (jobId) => {
    set({ isLoading: true, error: null });

    try {
      const job = await jobsApi.getClientJob(jobId);
      set({ selectedJob: job, isLoading: false });
      return job;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch job';
      set({ isLoading: false, isLoadingMore: false, error: message });
      throw error;
    }
  },

  setStatusFilter: (filter) => {
    if (get().statusFilter === filter) return;
    set({ statusFilter: filter, currentPage: 1 });
    get().fetchJobs();
  },

  closeJob: async (jobId) => {
    try {
      const updated = await jobsApi.closeJob(jobId);
      set((state) => ({
        jobs: state.jobs.map((j) => (j.id === jobId ? updated : j)),
        selectedJob:
          state.selectedJob?.id === jobId ? updated : state.selectedJob,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to close job';
      set({ error: message });
      throw error;
    }
  },

  updateJob: async (jobId, payload) => {
    try {
      const updated = await jobsApi.updateClientJob(jobId, payload);
      set((state) => ({
        jobs: state.jobs.map((j) => (j.id === jobId ? updated : j)),
        selectedJob:
          state.selectedJob?.id === jobId ? updated : state.selectedJob,
      }));
      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update job';
      set({ error: message });
      throw error;
    }
  },

  createJob: async (payload) => {
    try {
      const created = await jobsApi.createClientJob(payload);
      set((state) => ({ jobs: [created, ...state.jobs] }));
      return created;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create job';
      set({ error: message });
      throw error;
    }
  },

  clearSelectedJob: () => {
    set({ selectedJob: null });
  },

  clearError: () => {
    set({ error: null });
  },
}));

// Selectors
export const selectClientJobById = (jobId: string) => (state: ClientJobsState) =>
  state.jobs.find((j) => j.id === jobId);

export default useClientJobsStore;
