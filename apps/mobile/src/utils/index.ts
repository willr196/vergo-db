/**
 * VERGO Utils
 * Central export for all utility functions
 */

export {
  formatDate,
  formatDateShort,
  formatTime,
  formatRelativeDate,
  toISODate,
  isPastDate,
  isToday,
  daysUntil,
  formatDuration,
} from './dateUtils';

export {
  calculateProfileCompletion,
  getIncompleteFields,
  getCompletionColor,
  getCompletionMessage,
  formatFullName,
  getInitials,
} from './profileUtils';
