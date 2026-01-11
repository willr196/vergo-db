/**
 * VERGO Stores
 * Central export for all Zustand stores
 */

export { useAuthStore, selectIsJobSeeker, selectIsClient, selectJobSeeker, selectClient } from './authStore';
export { useJobsStore, selectJobById, selectIsJobSaved } from './jobsStore';
export { useApplicationsStore, selectApplicationByJobId, selectApplicationsByStatus, selectPendingApplicationsCount } from './applicationsStore';
