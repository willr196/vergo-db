/**
 * Applications Store
 * Manages job applications state with Zustand
 */

import { create } from 'zustand';
import { applicationsApi } from '../api';
import { isApplicationStatus, normalizeApplicationStatus } from '../api/normalizers';
import { saveCache, loadCache, CACHE_KEYS } from '../utils/network';
import { useNetworkStore } from './networkStore';
import type { Application, ApplicationStatus } from '../types';

interface ApplicationsState {
  // State
  applications: Application[];
  selectedApplication: Application | null;
  isLoading: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  isSubmitting: boolean;
  error: string | null;
  
  // Pagination
  currentPage: number;
  totalPages: number;
  hasMore: boolean;
  
  // Filter
  statusFilter: ApplicationStatus | null;
  
  // Actions
  fetchApplications: (refresh?: boolean) => Promise<void>;
  fetchMoreApplications: () => Promise<void>;
  fetchApplication: (applicationId: string) => Promise<Application>;
  applyToJob: (jobId: string, coverNote?: string) => Promise<Application>;
  withdrawApplication: (applicationId: string) => Promise<void>;
  setStatusFilter: (status: ApplicationStatus | null) => void;
  hasAppliedToJob: (jobId: string) => boolean;
  clearError: () => void;
}

export const useApplicationsStore = create<ApplicationsState>((set, get) => ({
  // Initial state
  applications: [],
  selectedApplication: null,
  isLoading: false,
  isRefreshing: false,
  isLoadingMore: false,
  isSubmitting: false,
  error: null,
  
  currentPage: 1,
  totalPages: 1,
  hasMore: false,
  
  statusFilter: null,
  
  // Actions
  fetchApplications: async (refresh = false) => {
    const { statusFilter } = get();
    const { isConnected } = useNetworkStore.getState();

    set({ isLoading: !refresh, isRefreshing: refresh, isLoadingMore: false, error: null });

    // Offline — serve cached data immediately
    if (!isConnected) {
      const cached = await loadCache<Application[]>(CACHE_KEYS.APPLICATIONS);
      set({
        applications: cached || [],
        isLoading: false,
        isRefreshing: false,
        isLoadingMore: false,
      });
      return;
    }

    try {
      const response = await applicationsApi.getUserApplications(
        statusFilter ?? undefined,
        1,
        20
      );
      const applications = response.applications || [];

      // Persist to cache for offline use (only when no status filter applied)
      if (!statusFilter) {
        await saveCache(CACHE_KEYS.APPLICATIONS, applications);
      }

      set({
        applications,
        isLoading: false,
        isRefreshing: false,
        isLoadingMore: false,
        currentPage: response.pagination?.page || 1,
        totalPages: response.pagination?.totalPages || 1,
        hasMore: response.pagination?.hasMore || false,
      });
    } catch (error) {
      // Network error — try cache fallback
      const cached = await loadCache<Application[]>(CACHE_KEYS.APPLICATIONS);
      if (cached) {
        set({ applications: cached, isLoading: false, isRefreshing: false, isLoadingMore: false });
      } else {
        const message = error instanceof Error ? error.message : 'Failed to fetch applications';
        set({ isLoading: false, isRefreshing: false, isLoadingMore: false, error: message });
      }
    }
  },
  
  fetchMoreApplications: async () => {
    const { currentPage, hasMore, statusFilter, applications, isLoading, isRefreshing, isLoadingMore } = get();
    
    if (!hasMore || isLoading || isRefreshing || isLoadingMore) return;
    
    set({ isLoadingMore: true });
    
    try {
      const response = await applicationsApi.getUserApplications(
        statusFilter ?? undefined,
        currentPage + 1,
        20
      );
      
      set({
        applications: [...applications, ...(response.applications || [])],
        isLoading: false,
        isLoadingMore: false,
        currentPage: response.pagination?.page || currentPage + 1,
        totalPages: response.pagination?.totalPages || 1,
        hasMore: response.pagination?.hasMore || false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch more applications';
      set({ isLoading: false, isLoadingMore: false, error: message });
    }
  },
  
  fetchApplication: async (applicationId) => {
    set({ isLoading: true, error: null });
    
    try {
      const application = await applicationsApi.getApplication(applicationId);
      set({ selectedApplication: application, isLoading: false });
      return application;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch application';
      set({ isLoading: false, isRefreshing: false, isLoadingMore: false, error: message });
      throw error;
    }
  },
  
  applyToJob: async (jobId, coverNote) => {
    set({ isSubmitting: true, error: null });

    const { isConnected, enqueueOfflineAction } = useNetworkStore.getState();

    // Offline — queue the action and apply optimistically
    if (!isConnected) {
      await enqueueOfflineAction({ type: 'apply', payload: { jobId, coverNote } });

      const optimistic: Application = {
        id: `pending_${Date.now()}`,
        jobId,
        userId: '',
        status: 'pending',
        coverNote,
        receivedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      set((state) => ({
        applications: [optimistic, ...state.applications],
        isSubmitting: false,
      }));

      return optimistic;
    }

    try {
      const application = await applicationsApi.applyToJob(jobId, coverNote);
      set((state) => ({
        applications: [application, ...state.applications],
        isSubmitting: false,
      }));
      return application;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to apply';
      set({ isSubmitting: false, error: message });
      throw error;
    }
  },
  
  withdrawApplication: async (applicationId) => {
    set({ isSubmitting: true, error: null });

    const { isConnected, enqueueOfflineAction } = useNetworkStore.getState();

    // Offline — queue the action and update optimistically
    if (!isConnected) {
      await enqueueOfflineAction({ type: 'withdraw', payload: { applicationId } });

      set((state) => ({
        applications: state.applications.map((a) =>
          a.id === applicationId ? { ...a, status: 'withdrawn' } : a
        ),
        selectedApplication:
          state.selectedApplication?.id === applicationId
            ? { ...state.selectedApplication, status: 'withdrawn' }
            : state.selectedApplication,
        isSubmitting: false,
      }));
      return;
    }

    try {
      const updated = await applicationsApi.withdrawApplication(applicationId);
      set((state) => ({
        applications: state.applications.map((a) =>
          a.id === applicationId ? updated : a
        ),
        selectedApplication:
          state.selectedApplication?.id === applicationId
            ? updated
            : state.selectedApplication,
        isSubmitting: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to withdraw';
      set({ isSubmitting: false, error: message });
      throw error;
    }
  },
  
  setStatusFilter: (status) => {
    set({ statusFilter: status, currentPage: 1 });
    get().fetchApplications();
  },
  
  hasAppliedToJob: (jobId) => {
    const { applications } = get();
    return applications.some((a) => a.jobId === jobId && !isApplicationStatus(a.status, 'withdrawn'));
  },
  
  clearError: () => {
    set({ error: null });
  },
}));

// Selectors
export const selectApplicationByJobId = (jobId: string) => (state: ApplicationsState) =>
  state.applications.find(a => a.jobId === jobId);

export const selectApplicationsByStatus = (status: ApplicationStatus) => (state: ApplicationsState) =>
  state.applications.filter((a) => normalizeApplicationStatus(a.status) === status);

export const selectPendingApplicationsCount = (state: ApplicationsState) =>
  state.applications.filter((a) =>
    isApplicationStatus(a.status, 'pending', 'reviewing')
  ).length;

export default useApplicationsStore;
