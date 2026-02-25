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

export {
  registerForPushNotifications,
  addNotificationReceivedListener,
  addNotificationResponseListener,
} from './notifications';

export {
  saveCache,
  loadCache,
  enqueueAction,
  getQueue,
  removeFromQueue,
  subscribeToNetworkState,
  checkIsConnected,
  CACHE_KEYS,
} from './network';
export type { QueuedAction, QueuedActionType } from './network';

export {
  isBiometricAvailable,
  isBiometricEnabled,
  setBiometricEnabled,
  hasBiometricBeenAsked,
  markBiometricAsked,
  authenticateWithBiometrics,
} from './biometrics';
