/**
 * Jobs Store
 * Manages job listings state with Zustand
 */

import { create } from 'zustand';
import { jobsApi } from '../api';
import type { Job, JobFilters } from '../types';

interface JobsState {
  // State
  jobs: Job[];
  selectedJob: Job | null;
  savedJobs: Job[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  
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
}

const DEFAULT_FILTERS: JobFilters = {};

export const useJobsStore = create<JobsState>((set, get) => ({
  // Initial state
  jobs: [],
  selectedJob: null,
  savedJobs: [],
  isLoading: false,
  isRefreshing: false,
  error: null,
  
  currentPage: 1,
  totalPages: 1,
  hasMore: false,
  
  filters: DEFAULT_FILTERS,
  
  // Actions
  fetchJobs: async (refresh = false) => {
    const { filters } = get();
    
    set({ 
      isLoading: !refresh, 
      isRefreshing: refresh, 
      error: null 
    });
    
    try {
      const response = await jobsApi.getJobs(filters, 1, 20);
      
      set({
        jobs: response.jobs || [],
        isLoading: false,
        isRefreshing: false,
        currentPage: response.pagination?.page || 1,
        totalPages: response.pagination?.totalPages || 1,
        hasMore: response.pagination?.hasMore || false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch jobs';
      set({ 
        isLoading: false, 
        isRefreshing: false, 
        error: message 
      });
    }
  },
  
  fetchMoreJobs: async () => {
    const { currentPage, hasMore, filters, jobs, isLoading } = get();
    
    if (!hasMore || isLoading) return;
    
    set({ isLoading: true });
    
    try {
      const response = await jobsApi.getJobs(filters, currentPage + 1, 20);
      
      set({
        jobs: [...jobs, ...(response.jobs || [])],
        isLoading: false,
        currentPage: response.pagination?.page || currentPage + 1,
        totalPages: response.pagination?.totalPages || 1,
        hasMore: response.pagination?.hasMore || false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch more jobs';
      set({ isLoading: false, error: message });
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
      set({ isLoading: false, error: message });
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
      const { jobs, savedJobs } = get();
      const job = jobs.find(j => j.id === jobId);
      
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
      console.warn('Failed to fetch saved jobs:', error);
    }
  },
  
  clearSelectedJob: () => {
    set({ selectedJob: null });
  },
}));

// Selectors
export const selectJobById = (jobId: string) => (state: JobsState) =>
  state.jobs.find(j => j.id === jobId);

export const selectIsJobSaved = (jobId: string) => (state: JobsState) =>
  state.savedJobs.some(j => j.id === jobId);

export default useJobsStore;
