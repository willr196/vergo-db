/**
 * Date Utility Functions
 * Formatting helpers for dates and times
 */

/**
 * Format a date string to readable format
 * @example "2025-01-15" → "15 Jan 2025"
 */
export function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}

/**
 * Format a date to short format
 * @example "2025-01-15" → "15 Jan"
 */
export function formatDateShort(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return dateString;
  }
}

/**
 * Format time string to HH:MM
 * @example "14:30:00" → "14:30"
 */
export function formatTime(timeString: string): string {
  if (!timeString) return '';
  
  // Handle ISO datetime strings
  if (timeString.includes('T')) {
    const date = new Date(timeString);
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  
  // Handle HH:MM:SS format
  return timeString.slice(0, 5);
}

/**
 * Format a date relative to now
 * @example "2025-01-08" (yesterday) → "yesterday"
 */
export function formatRelativeDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    if (diffMinutes < 1) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    
    return formatDate(dateString);
  } catch {
    return dateString;
  }
}

/**
 * Format date for API requests (ISO format)
 */
export function toISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Check if a date is in the past
 */
export function isPastDate(dateString: string): boolean {
  const date = new Date(dateString);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return date < now;
}

/**
 * Check if a date is today
 */
export function isToday(dateString: string): boolean {
  const date = new Date(dateString);
  const now = new Date();
  return (
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  );
}

/**
 * Get days until a date
 */
export function daysUntil(dateString: string): number {
  const date = new Date(dateString);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const diffMs = date.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Format duration in hours
 * @example (startTime, endTime) → "8 hours"
 */
export function formatDuration(startTime: string, endTime: string): string {
  const start = new Date(`1970-01-01T${startTime}`);
  const end = new Date(`1970-01-01T${endTime}`);
  const diffMs = end.getTime() - start.getTime();
  const hours = diffMs / (1000 * 60 * 60);
  
  if (hours === 1) return '1 hour';
  return `${hours} hours`;
}

export default {
  formatDate,
  formatDateShort,
  formatTime,
  formatRelativeDate,
  toISODate,
  isPastDate,
  isToday,
  daysUntil,
  formatDuration,
};
