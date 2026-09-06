/**
 * Jobs Store
 * Manages job listings state with Zustand
 */

import { create } from 'zustand';
import { jobsApi } from '../api';
import { logger } from '../utils/logger';
import { saveCache, loadCacheEntry, CACHE_KEYS } from '../utils/network';
import { useNetworkStore } from './networkStore';
import type { Job, JobFilters } from '../types';

interface JobsState {
  // State
  jobs: Job[];
  selectedJob: Job | null;
  savedJobs: Job[];
  isLoading: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  error: string | null;
  isShowingOfflineCache: boolean;
  offlineCacheTimestamp: number | null;
  
  // Pagination
  currentPage: number;
  totalPages: number;
  hasMore: boolean;
  
  // Filters
  filters: JobFilters;
  
  // Actions
  fetchJobs: (refresh?: boolean) => Promise<void>;
  fetchMoreJobs: () => Promise<void>;
  fetchJob: (jobId: string) => Promise<Job>;
  setFilters: (filters: Partial<JobFilters>) => void;
  clearFilters: () => void;
  saveJob: (jobId: string) => Promise<void>;
  unsaveJob: (jobId: string) => Promise<void>;
  fetchSavedJobs: () => Promise<void>;
  clearSelectedJob: () => void;
  reset: () => void;
}

const DEFAULT_FILTERS: JobFilters = {};
const JOB_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface CachedJobsPayload {
  jobs: Job[];
  filters: JobFilters;
}

function filterKey(filters: JobFilters): string {
  return JSON.stringify(
    Object.entries(filters)
      .filter(([, value]) => value !== undefined && value !== '')
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

async function loadUsableCachedJobs(filters: JobFilters): Promise<{ jobs: Job[]; timestamp: number } | null> {
  const entry = await loadCacheEntry<CachedJobsPayload | Job[]>(CACHE_KEYS.JOBS);
  if (!entry || Date.now() - entry.timestamp > JOB_CACHE_MAX_AGE_MS) return null;

  // Caches written before filter-aware caching only represent an unfiltered list.
  if (Array.isArray(entry.data)) {
    return filterKey(filters) === filterKey(DEFAULT_FILTERS)
      ? { jobs: entry.data, timestamp: entry.timestamp }
      : null;
  }

  if (!Array.isArray(entry.data.jobs) || filterKey(entry.data.filters || {}) !== filterKey(filters)) {
    return null;
  }

  return { jobs: entry.data.jobs, timestamp: entry.timestamp };
}

export const useJobsStore = create<JobsState>((set, get) => ({
  // Initial state
  jobs: [],
  selectedJob: null,
  savedJobs: [],
  isLoading: false,
  isRefreshing: false,
  isLoadingMore: false,
  error: null,
  isShowingOfflineCache: false,
  offlineCacheTimestamp: null,
  
  currentPage: 1,
  totalPages: 1,
  hasMore: false,
  
  filters: DEFAULT_FILTERS,
  
  // Actions
  fetchJobs: async (refresh = false) => {
    const { filters } = get();
    const { isConnected } = useNetworkStore.getState();

    set({
      isLoading: !refresh,
      isRefreshing: refresh,
      isLoadingMore: false,
      error: null,
      isShowingOfflineCache: false,
      offlineCacheTimestamp: null,
    });

    // Offline — serve cached data immediately
    if (!isConnected) {
      const cached = await loadUsableCachedJobs(filters);
      set({
        jobs: cached?.jobs || [],
        isLoading: false,
        isRefreshing: false,
        isLoadingMore: false,
        currentPage: 1,
        totalPages: 1,
        hasMore: false,
        isShowingOfflineCache: Boolean(cached),
        offlineCacheTimestamp: cached?.timestamp ?? null,
        error: cached ? null : 'No recent offline results are available for these filters.',
      });
      return;
    }

    try {
      const response = await jobsApi.getJobs(filters, 1, 20);
      const jobs = response.jobs || [];

      // Persist to cache for offline use
      await saveCache<CachedJobsPayload>(CACHE_KEYS.JOBS, { jobs, filters });

      set({
        jobs,
        isLoading: false,
        isRefreshing: false,
        isLoadingMore: false,
        currentPage: response.pagination?.page || 1,
        totalPages: response.pagination?.totalPages || 1,
        hasMore: response.pagination?.hasMore || false,
        isShowingOfflineCache: false,
        offlineCacheTimestamp: null,
      });
    } catch (error) {
      // Network error — try cache fallback
      const cached = await loadUsableCachedJobs(filters);
      if (cached) {
        set({
          jobs: cached.jobs,
          isLoading: false,
          isRefreshing: false,
          isLoadingMore: false,
          currentPage: 1,
          totalPages: 1,
          hasMore: false,
          isShowingOfflineCache: true,
          offlineCacheTimestamp: cached.timestamp,
        });
      } else {
        const message = error instanceof Error ? error.message : 'Failed to fetch jobs';
        set({
          isLoading: false,
          isRefreshing: false,
          isLoadingMore: false,
          error: message,
          isShowingOfflineCache: false,
          offlineCacheTimestamp: null,
        });
      }
    }
  },
  
  fetchMoreJobs: async () => {
    const { currentPage, hasMore, filters, jobs, isLoading, isRefreshing, isLoadingMore } = get();
    
    if (!hasMore || isLoading || isRefreshing || isLoadingMore) return;
    
    set({ isLoadingMore: true });
    
    try {
      const response = await jobsApi.getJobs(filters, currentPage + 1, 20);
      
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
      const job = await jobsApi.getJob(jobId);
      set({ selectedJob: job, isLoading: false });
      return job;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch job';
      set({ isLoading: false, isLoadingMore: false, error: message });
      throw error;
    }
  },
  
  setFilters: (newFilters) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
      currentPage: 1,
    }));
    
    // Auto-fetch with new filters
    get().fetchJobs();
  },
  
  clearFilters: () => {
    set({ filters: DEFAULT_FILTERS, currentPage: 1 });
    get().fetchJobs();
  },
  
  saveJob: async (jobId) => {
    try {
      await jobsApi.saveJob(jobId);
      
      // Update local state
      const { jobs, savedJobs, selectedJob } = get();
      const job = jobs.find(j => j.id === jobId)
        ?? (selectedJob?.id === jobId ? selectedJob : undefined);
      
      if (job && !savedJobs.find(j => j.id === jobId)) {
        set({ savedJobs: [...savedJobs, job] });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save job';
      set({ error: message });
      throw error;
    }
  },
  
  unsaveJob: async (jobId) => {
    try {
      await jobsApi.unsaveJob(jobId);
      
      // Update local state
      set((state) => ({
        savedJobs: state.savedJobs.filter(j => j.id !== jobId),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to unsave job';
      set({ error: message });
      throw error;
    }
  },
  
  fetchSavedJobs: async () => {
    try {
      const savedJobs = await jobsApi.getSavedJobs();
      set({ savedJobs });
    } catch (error) {
      logger.warn('Failed to fetch saved jobs:', error);
      throw error;
    }
  },
  
  clearSelectedJob: () => {
    set({ selectedJob: null });
  },

  reset: () => {
    set({
      jobs: [], selectedJob: null, savedJobs: [], isLoading: false,
      isRefreshing: false, isLoadingMore: false, error: null,
      isShowingOfflineCache: false, offlineCacheTimestamp: null,
      currentPage: 1, totalPages: 1, hasMore: false, filters: DEFAULT_FILTERS,
    });
  },
}));

// Selectors
export const selectJobById = (jobId: string) => (state: JobsState) =>
  state.jobs.find(j => j.id === jobId);

export const selectIsJobSaved = (jobId: string) => (state: JobsState) =>
  state.savedJobs.some(j => j.id === jobId);

export default useJobsStore;
