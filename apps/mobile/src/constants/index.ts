/**
 * App Constants
 * Centralized constants for reuse across the application
 */

import type { JobRole } from '../types';

// Job Role options with display labels
export const JOB_ROLES: ReadonlyArray<{ value: JobRole; label: string }> = [
  { value: 'bartender', label: 'Bartender' },
  { value: 'server', label: 'Server' },
  { value: 'chef', label: 'Chef' },
  { value: 'sous_chef', label: 'Sous Chef' },
  { value: 'kitchen_porter', label: 'Kitchen Porter' },
  { value: 'event_manager', label: 'Event Manager' },
  { value: 'front_of_house', label: 'Front of House' },
  { value: 'barista', label: 'Barista' },
  { value: 'runner', label: 'Runner' },
] as const;

// Job Role filter options (includes "All Roles" option)
export const JOB_ROLE_FILTERS: ReadonlyArray<{ value: JobRole | ''; label: string }> = [
  { value: '', label: 'All Roles' },
  ...JOB_ROLES,
] as const;

// Hourly rate filter options
export const HOURLY_RATE_OPTIONS: ReadonlyArray<number> = [0, 12, 15, 18, 20, 25] as const;

// Auth initialization timeout (milliseconds)
export const AUTH_TIMEOUT = 5000;

// API request timeout (milliseconds)
export const API_TIMEOUT = 30000;

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 20;
export const DEFAULT_PAGE = 1;

// Helper function to get job role label
export function getJobRoleLabel(role: JobRole): string {
  return JOB_ROLES.find(r => r.value === role)?.label || role;
}

// Helper function to format hourly rate
export function formatHourlyRate(rate: number): string {
  return `£${rate.toFixed(2)}/hr`;
}

// Helper function to format hourly rate range
export function formatHourlyRateRange(min?: number, max?: number): string {
  if (min && max) {
    return `£${min}-£${max}/hr`;
  }
  if (min) {
    return `£${min}+/hr`;
  }
  if (max) {
    return `Up to £${max}/hr`;
  }
  return 'Negotiable';
}
