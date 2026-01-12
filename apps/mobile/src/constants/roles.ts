/**
 * Shared role constants
 * Single source of truth for role labels and mappings
 */

import type { JobRole, ApplicationStatus } from '../types';

/**
 * Human-readable labels for job roles
 */
export const ROLE_LABELS: Record<JobRole, string> = {
  bartender: 'Bartender',
  server: 'Server',
  chef: 'Chef',
  sous_chef: 'Sous Chef',
  kitchen_porter: 'Kitchen Porter',
  event_manager: 'Event Manager',
  event_coordinator: 'Event Coordinator',
  front_of_house: 'Front of House',
  back_of_house: 'Back of House',
  runner: 'Runner',
  barista: 'Barista',
  sommelier: 'Sommelier',
  mixologist: 'Mixologist',
  catering_assistant: 'Catering Assistant',
  other: 'Other',
};

/**
 * Role options for filter dropdowns
 */
export const ROLE_OPTIONS: { value: JobRole | ''; label: string }[] = [
  { value: '', label: 'All Roles' },
  { value: 'bartender', label: 'Bartender' },
  { value: 'server', label: 'Server' },
  { value: 'chef', label: 'Chef' },
  { value: 'sous_chef', label: 'Sous Chef' },
  { value: 'kitchen_porter', label: 'Kitchen Porter' },
  { value: 'event_manager', label: 'Event Manager' },
  { value: 'event_coordinator', label: 'Event Coordinator' },
  { value: 'front_of_house', label: 'Front of House' },
  { value: 'back_of_house', label: 'Back of House' },
  { value: 'runner', label: 'Runner' },
  { value: 'barista', label: 'Barista' },
  { value: 'sommelier', label: 'Sommelier' },
  { value: 'mixologist', label: 'Mixologist' },
  { value: 'catering_assistant', label: 'Catering Assistant' },
  { value: 'other', label: 'Other' },
];

/**
 * Application status labels for display
 */
export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: 'Pending',
  received: 'Received',
  reviewing: 'Under Review',
  shortlisted: 'Shortlisted',
  hired: 'Hired',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

/**
 * Status filter options for applications
 */
export const STATUS_FILTER_OPTIONS: { value: ApplicationStatus | null; label: string }[] = [
  { value: null, label: 'All' },
  { value: 'received', label: 'Pending' },
  { value: 'reviewing', label: 'Under Review' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'hired', label: 'Hired' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

/**
 * Get role label with fallback
 */
export function getRoleLabel(role: JobRole | string): string {
  return ROLE_LABELS[role as JobRole] || role;
}

/**
 * Get status label with fallback
 */
export function getStatusLabel(status: ApplicationStatus | string): string {
  return STATUS_LABELS[status as ApplicationStatus] || status;
}
