/**
 * Push Notification Utility
 * Handles Expo push notification setup, permission requests,
 * token registration, and notification listeners.
 */

import { Platform } from 'react-native';
import { authApi } from '../api';
import { logger } from './logger';

type NotificationsModule = typeof import('expo-notifications');
type DeviceModule = typeof import('expo-device');
type Notification = import('expo-notifications').Notification;
type NotificationResponse = import('expo-notifications').NotificationResponse;
type ExpoConstantsLike = {
  expoConfig?: {
    extra?: {
      eas?: {
        projectId?: string;
      };
    };
  };
  easConfig?: {
    projectId?: string;
  };
};

let notificationHandlerConfigured = false;

function loadNotificationsModule(): NotificationsModule | null {
  try {
    return require('expo-notifications') as NotificationsModule;
  } catch (error) {
    logger.warn('expo-notifications is unavailable in this client:', error);
    return null;
  }
}

function loadDeviceModule(): DeviceModule | null {
  try {
    return require('expo-device') as DeviceModule;
  } catch (error) {
    logger.warn('expo-device is unavailable in this client:', error);
    return null;
  }
}

function loadConstantsModule(): ExpoConstantsLike | null {
  try {
    return require('expo-constants').default as ExpoConstantsLike;
  } catch (error) {
    logger.warn('expo-constants is unavailable in this client:', error);
    return null;
  }
}

function ensureNotificationHandlerConfigured(notifications: NotificationsModule): boolean {
  if (notificationHandlerConfigured) return true;

  try {
    notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    notificationHandlerConfigured = true;
    return true;
  } catch (error) {
    logger.warn('Failed to configure notification handler:', error);
    return false;
  }
}

/**
 * Request notification permissions and register the device push token.
 * Safe to call multiple times — skips silently if already registered
 * or if running on a simulator.
 */
export async function registerForPushNotifications(): Promise<void> {
  const Notifications = loadNotificationsModule();
  const Device = loadDeviceModule();
  const Constants = loadConstantsModule();

  if (!Notifications || !Device) {
    return;
  }

  ensureNotificationHandlerConfigured(Notifications);

  if (!Device.isDevice) {
    logger.warn('Push notifications are only supported on physical devices.');
    return;
  }

  // Request permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    logger.warn('Push notification permission not granted.');
    return;
  }

  // Android requires a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#D4AF37',
    });
  }

  // Get the Expo push token
  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId;

  let expoPushToken: string;
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    expoPushToken = tokenData.data;
  } catch (err) {
    logger.error('Failed to get Expo push token:', err);
    return;
  }

  // Register token with backend
  try {
    await authApi.registerPushToken(expoPushToken);
    logger.info('Push token registered:', expoPushToken);
  } catch (err) {
    // Non-fatal — app still works without push notifications
    logger.warn('Failed to register push token with backend:', err);
  }
}

/**
 * Add a listener that fires when a notification is received
 * while the app is in the foreground.
 * Returns a cleanup function — call it in useEffect cleanup.
 */
export function addNotificationReceivedListener(
  handler: (notification: Notification) => void
): () => void {
  const Notifications = loadNotificationsModule();
  if (!Notifications) {
    return () => {};
  }

  ensureNotificationHandlerConfigured(Notifications);

  try {
    const sub = Notifications.addNotificationReceivedListener(handler);
    return () => sub.remove();
  } catch (error) {
    logger.warn('Failed to attach notification received listener:', error);
    return () => {};
  }
}

/**
 * Add a listener that fires when the user taps a notification.
 * Returns a cleanup function — call it in useEffect cleanup.
 */
export function addNotificationResponseListener(
  handler: (response: NotificationResponse) => void
): () => void {
  const Notifications = loadNotificationsModule();
  if (!Notifications) {
    return () => {};
  }

  ensureNotificationHandlerConfigured(Notifications);

  try {
    const sub = Notifications.addNotificationResponseReceivedListener(handler);
    return () => sub.remove();
  } catch (error) {
    logger.warn('Failed to attach notification response listener:', error);
    return () => {};
  }
}

export async function getLastNotificationResponse(): Promise<NotificationResponse | null> {
  const Notifications = loadNotificationsModule();
  if (!Notifications) {
    return null;
  }

  ensureNotificationHandlerConfigured(Notifications);

  try {
    return await Notifications.getLastNotificationResponseAsync();
  } catch (error) {
    logger.warn('Failed to get last notification response:', error);
    return null;
  }
}
