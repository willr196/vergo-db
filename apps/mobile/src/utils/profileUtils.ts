/**
 * Profile Utility Functions
 * Helpers for profile management
 */

import type { JobSeeker } from '../types';

interface ProfileField {
  key: keyof JobSeeker;
  weight: number;
  label: string;
}

const PROFILE_FIELDS: ProfileField[] = [
  { key: 'firstName', weight: 10, label: 'First Name' },
  { key: 'lastName', weight: 10, label: 'Last Name' },
  { key: 'email', weight: 10, label: 'Email' },
  { key: 'phone', weight: 10, label: 'Phone' },
  { key: 'bio', weight: 5, label: 'Bio' },
  { key: 'city', weight: 5, label: 'City' },
  { key: 'postcode', weight: 5, label: 'Postcode' },
  { key: 'profileImage', weight: 10, label: 'Profile Photo' },
  { key: 'preferredRoles', weight: 10, label: 'Preferred Roles' },
  { key: 'yearsExperience', weight: 5, label: 'Experience' },
  { key: 'skills', weight: 5, label: 'Skills' },
  { key: 'hasDBSCheck', weight: 5, label: 'DBS Check' },
  { key: 'rightToWork', weight: 10, label: 'Right to Work' },
];

/**
 * Calculate profile completion percentage
 */
export function calculateProfileCompletion(user: JobSeeker): number {
  if (!user) return 0;
  
  let totalWeight = 0;
  let completedWeight = 0;
  
  for (const field of PROFILE_FIELDS) {
    totalWeight += field.weight;
    
    const value = user[field.key];
    
    if (value !== undefined && value !== null && value !== '') {
      // Handle arrays
      if (Array.isArray(value) && value.length > 0) {
        completedWeight += field.weight;
      }
      // Handle booleans (true counts as complete)
      else if (typeof value === 'boolean' && value === true) {
        completedWeight += field.weight;
      }
      // Handle numbers
      else if (typeof value === 'number' && value > 0) {
        completedWeight += field.weight;
      }
      // Handle strings
      else if (typeof value === 'string' && value.trim().length > 0) {
        completedWeight += field.weight;
      }
    }
  }
  
  return Math.round((completedWeight / totalWeight) * 100);
}

/**
 * Get incomplete profile fields
 */
export function getIncompleteFields(user: JobSeeker): string[] {
  if (!user) return PROFILE_FIELDS.map(f => f.label);
  
  const incomplete: string[] = [];
  
  for (const field of PROFILE_FIELDS) {
    const value = user[field.key];
    
    let isComplete = false;
    
    if (value !== undefined && value !== null && value !== '') {
      if (Array.isArray(value) && value.length > 0) {
        isComplete = true;
      } else if (typeof value === 'boolean' && value === true) {
        isComplete = true;
      } else if (typeof value === 'number' && value > 0) {
        isComplete = true;
      } else if (typeof value === 'string' && value.trim().length > 0) {
        isComplete = true;
      }
    }
    
    if (!isComplete) {
      incomplete.push(field.label);
    }
  }
  
  return incomplete;
}

/**
 * Get profile completion color based on percentage
 */
export function getCompletionColor(percentage: number): string {
  if (percentage >= 80) return '#28a745'; // Green
  if (percentage >= 50) return '#ffc107'; // Yellow
  return '#ff6b6b'; // Red
}

/**
 * Get profile completion message
 */
export function getCompletionMessage(percentage: number): string {
  if (percentage >= 100) return 'Your profile is complete!';
  if (percentage >= 80) return 'Almost there! Complete your profile to stand out.';
  if (percentage >= 50) return 'Good progress! Keep adding details.';
  return 'Complete your profile to increase your chances of getting hired.';
}

/**
 * Format user's full name
 */
export function formatFullName(user: { firstName: string; lastName: string }): string {
  return `${user.firstName} ${user.lastName}`.trim();
}

/**
 * Get user initials
 */
export function getInitials(user: { firstName: string; lastName: string }): string {
  const first = user.firstName?.charAt(0) || '';
  const last = user.lastName?.charAt(0) || '';
  return `${first}${last}`.toUpperCase();
}

export default {
  calculateProfileCompletion,
  getIncompleteFields,
  getCompletionColor,
  getCompletionMessage,
  formatFullName,
  getInitials,
};
